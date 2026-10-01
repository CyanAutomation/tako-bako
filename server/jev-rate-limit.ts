import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const CLIENT_LIMIT = 60;
const CLIENT_WINDOW_MS = 60_000;
const CLIENT_WINDOW_TTL_SECONDS = 120;
const GLOBAL_LIMIT = 10_000;
const GLOBAL_WINDOW_MS = 86_400_000;
const GLOBAL_WINDOW_TTL_SECONDS = 172_800;
const RATE_LIMIT_SCRIPT = [
  "local global_count = tonumber(redis.call('GET', KEYS[2]) or '0')",
  "if global_count >= tonumber(ARGV[3]) then return {0, global_count, 0} end",
  "local client_count = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "if client_count >= tonumber(ARGV[4]) then return {client_count, global_count, 0} end",
  "client_count = redis.call('INCR', KEYS[1])",
  "if client_count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
  "global_count = redis.call('INCR', KEYS[2])",
  "if global_count == 1 then redis.call('EXPIRE', KEYS[2], ARGV[2]) end",
  "return {client_count, global_count, 1}",
].join("\n");

interface RedisRestResult {
  result?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowedRedisRestUrl(url: URL): boolean {
  return url.protocol === "https:"
    && url.hostname.endsWith(".upstash.io")
    && url.pathname === "/"
    && !url.username
    && !url.password
    && !url.search
    && !url.hash
    && url.port === "";
}

function redisRestUrl(): string | undefined {
  const value = process.env.UPSTASH_REDIS_REST_URL;
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return isAllowedRedisRestUrl(url) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/** Uses the final address added by the hosting proxy, rejecting unparseable forwarding chains. */
export function clientAddressFromForwardedFor(header: string | string[] | undefined): string | undefined {
  const forwardedFor = Array.isArray(header) ? header.join(",") : header;
  const address = forwardedFor?.split(",").at(-1)?.trim();
  return address && isIP(address) ? address : undefined;
}

/** Atomically reserves one shared provider-call quota; absent or failing Redis disables Jev safely. */
export async function allowJevDecision(clientAddress: string | undefined, now = Date.now()): Promise<boolean> {
  const restUrl = redisRestUrl();
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!restUrl || !restToken) return false;

  const address = clientAddress && isIP(clientAddress) ? clientAddress : "unknown";
  const clientHash = createHmac("sha256", restToken).update(address).digest("hex");
  const clientWindow = Math.floor(now / CLIENT_WINDOW_MS);
  const globalWindow = Math.floor(now / GLOBAL_WINDOW_MS);
  const clientKey = `tako-bako:jev:client:${clientHash}:${clientWindow}`;
  const globalKey = `tako-bako:jev:global:${globalWindow}`;

  try {
    const response = await fetch(restUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${restToken}`, "content-type": "application/json" },
      body: JSON.stringify([
        "EVAL",
        RATE_LIMIT_SCRIPT,
        2,
        clientKey,
        globalKey,
        CLIENT_WINDOW_TTL_SECONDS,
        GLOBAL_WINDOW_TTL_SECONDS,
        GLOBAL_LIMIT,
        CLIENT_LIMIT,
      ]),
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    if (!isRecord(payload)) return false;
    const counts = (payload as RedisRestResult).result;
    if (!Array.isArray(counts) || counts.length !== 3) return false;
    const [clientCount, globalCount, allowed] = counts;
    if (!Number.isSafeInteger(clientCount) || !Number.isSafeInteger(globalCount) || (allowed !== 0 && allowed !== 1)) return false;
    return allowed === 1 && (clientCount as number) > 0 && (clientCount as number) <= CLIENT_LIMIT
      && (globalCount as number) > 0 && (globalCount as number) <= GLOBAL_LIMIT;
  } catch {
    return false;
  }
}
