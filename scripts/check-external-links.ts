import { readFile } from "node:fs/promises";
import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { extractMarkdownDestinations, markdownFiles } from "./markdown-documents.ts";
import { runMarkdownCheck } from "./run-markdown-check.ts";

const MAX_REDIRECTS = 5;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 10_000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const blockedIPv4Ranges = new BlockList();
const blockedIPv6Ranges = new BlockList();

for (const [subnet, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blockedIPv4Ranges.addSubnet(subnet, prefix, "ipv4");
}

for (const [subnet, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20], ["fc00::", 7],
  ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) {
  blockedIPv6Ranges.addSubnet(subnet, prefix, "ipv6");
}

type ResolvedAddress = { address: string; family: number };
type AddressLookup = (hostname: string) => Promise<readonly ResolvedAddress[]>;
type ExternalFetchOptions = {
  fetchImpl?: typeof fetch;
  lookupImpl?: AddressLookup;
  sleep?: (milliseconds: number) => Promise<unknown>;
  timeoutMs?: number;
  maxRetries?: number;
  maxRedirects?: number;
};

type LinkCheckResponse = {
  status: number;
  body?: { cancel(): Promise<void> } | null;
};

type LinkFetcher = (url: string, init?: RequestInit) => Promise<LinkCheckResponse>;

export function extractExternalLinks(markdown: string): string[] {
  const links = new Set<string>();
  for (const destination of extractMarkdownDestinations(markdown)) {
    try {
      const url = new URL(destination);
      if (url.protocol === "http:" || url.protocol === "https:") links.add(url.href);
    } catch {
      // Relative paths, fragments, and non-web schemes are checked separately or ignored.
    }
  }
  return [...links];
}

export function isPublicExternalAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !((family === 4 ? blockedIPv4Ranges : blockedIPv6Ranges).check(address, family === 4 ? "ipv4" : "ipv6"));
}

class UnsafeExternalTargetError extends Error {}

async function resolveExternalHost(hostname: string): Promise<readonly ResolvedAddress[]> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

async function validateExternalTarget(input: string, lookupImpl: AddressLookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeExternalTargetError("External link is not a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeExternalTargetError("External links must use only HTTP and HTTPS");
  }
  if (url.username || url.password) {
    throw new UnsafeExternalTargetError("External links must not contain credentials");
  }
  if (url.port) {
    throw new UnsafeExternalTargetError("External links must use standard HTTP(S) ports");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new UnsafeExternalTargetError("External links must not target local hostnames");
  }

  const addresses = isIP(hostname) === 0
    ? await lookupImpl(hostname)
    : [{ address: hostname, family: isIP(hostname) }];
  if (addresses.length === 0) throw new Error(`Could not resolve external link host: ${hostname}`);
  if (addresses.some(({ address }) => !isPublicExternalAddress(address))) {
    throw new UnsafeExternalTargetError(`External link resolves to a non-public address: ${hostname}`);
  }

  return url;
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    const dateDelay = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay >= 0) return Math.min(dateDelay, 2_000);
  }
  return 250 * 2 ** attempt;
}

async function cancelBody(response: Response): Promise<void> {
  if (response.body) await response.body.cancel().catch(() => {});
}

export async function fetchExternalLink(input: string, {
  fetchImpl = globalThis.fetch,
  lookupImpl = resolveExternalHost,
  sleep = delay,
  timeoutMs = REQUEST_TIMEOUT_MS,
  maxRetries = MAX_RETRIES,
  maxRedirects = MAX_REDIRECTS,
}: ExternalFetchOptions = {}): Promise<Response> {
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new TypeError("maxRetries must be a non-negative integer");
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0) throw new TypeError("maxRedirects must be a non-negative integer");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("timeoutMs must be positive");

  let target = input;
  for (let redirectCount = 0; ; redirectCount += 1) {
    let response: Response | undefined;
    let validatedUrl: URL | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        validatedUrl = await validateExternalTarget(target, lookupImpl);
        response = await fetchImpl(validatedUrl, {
          method: "GET",
          redirect: "manual",
          headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8", "user-agent": "TakoBako-link-check/1.0" },
          signal: globalThis.AbortSignal.timeout(timeoutMs),
        });

        if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxRetries) break;
        const waitMs = retryDelay(response.headers.get("retry-after"), attempt);
        await cancelBody(response);
        await sleep(waitMs);
      } catch (error) {
        if (error instanceof UnsafeExternalTargetError || attempt === maxRetries) throw error;
        await sleep(250 * 2 ** attempt);
      }
    }

    if (!response || !validatedUrl) throw new Error("External link request did not produce a response");
    const location = response.headers.get("location");
    const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
    if (!isRedirect || location === null) return response;
    if (redirectCount >= maxRedirects) {
      await cancelBody(response);
      throw new Error(`External link exceeded the ${maxRedirects}-redirect limit`);
    }

    await cancelBody(response);
    let redirectedUrl: URL;
    try {
      redirectedUrl = new URL(location, validatedUrl);
    } catch {
      throw new UnsafeExternalTargetError("External link returned an invalid redirect URL");
    }
    target = redirectedUrl.href;
  }
}

async function fetchExternalLinkForCheck(url: string): Promise<Response> {
  return fetchExternalLink(url);
}

export async function checkExternalLinks(markdownSources: readonly string[], fetcher: LinkFetcher = fetchExternalLinkForCheck): Promise<string[]> {
  const links = [...new Set(markdownSources.flatMap(extractExternalLinks))];
  const results = await Promise.all(links.map(async url => {
    try {
      const response = await fetcher(url, {
        method: "GET",
        redirect: "follow",
        headers: { accept: "text/html,application/json;q=0.9,*/*;q=0.8", "user-agent": "TakoBako-link-check/1.0" },
        signal: globalThis.AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      return response.status >= 400
        ? `External link returned HTTP ${response.status}: ${url}`
        : undefined;
    } catch (error) {
      return `External link could not be checked: ${url} (${error instanceof Error ? error.message : String(error)})`;
    }
  }));
  return results.filter((result): result is string => result !== undefined);
}

async function readMarkdownSources(root: string): Promise<string[]> {
  const readmePath = join(root, "README.md");
  let readme;
  try {
    readme = await readFile(readmePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Required README.md not found in ${root}`, { cause: error });
    }
    throw error;
  }

  const docsPaths = await markdownFiles(join(root, "docs"));
  return [readme, ...await Promise.all(docsPaths.map(path => readFile(path, "utf8")))];
}

export async function checkExternalLinksInRepository(root: string, fetcher: LinkFetcher = fetchExternalLinkForCheck): Promise<string[]> {
  return checkExternalLinks(await readMarkdownSources(root), fetcher);
}

const scriptPath = fileURLToPath(import.meta.url);
await runMarkdownCheck(scriptPath, checkExternalLinksInRepository, "External Markdown links are reachable.");
