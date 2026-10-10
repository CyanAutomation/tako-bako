import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { TextDecoder } from "node:util";
import { URL, fileURLToPath } from "node:url";

const POLL_TIMEOUT_MS = 185 * 60 * 1_000;
const POLL_INTERVAL_MS = 60 * 1_000;
const REQUEST_TIMEOUT_MS = 50 * 1_000;
const MAX_STATUS_BYTES = 1_048_576;

function statusRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Kaseki returned an invalid status response");
  }

  const { status } = value;
  if (status === "queued" || status === "running") return undefined;
  if (status === "failed" || status === "cancelled") return { status };
  if (status !== "completed") throw new Error("Kaseki returned an unsupported status");

  const exitCode = value.exitCode ?? 0;
  if (!Number.isSafeInteger(exitCode)) throw new TypeError("Kaseki returned an invalid exit code");
  return exitCode === 0 ? { status: "completed", exitCode: 0 } : { status: "failed", exitCode };
}

export async function pollKasekiRun({
  fetchStatus,
  deadlineAt,
  now = Date.now,
  wait = delay,
  pollIntervalMs = POLL_INTERVAL_MS,
}) {
  if (typeof fetchStatus !== "function") throw new TypeError("fetchStatus must be a function");
  if (!Number.isFinite(deadlineAt)) throw new TypeError("deadlineAt must be a finite timestamp");
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) throw new TypeError("pollIntervalMs must be non-negative");

  while (now() < deadlineAt) {
    const result = statusRecord(await fetchStatus());
    if (result) return result;

    const remainingMs = deadlineAt - now();
    if (remainingMs > 0) await wait(Math.min(pollIntervalMs, remainingMs));
  }

  throw new Error("Kaseki run timed out before reaching a terminal status");
}

async function readJsonBody(response) {
  if (!response.body) return JSON.parse(await response.text());

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_STATUS_BYTES) {
      await reader.cancel();
      throw new Error("Kaseki status response exceeded the size limit");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function createKasekiStatusFetcher({ baseUrl, apiToken, runId, fetchImpl = globalThis.fetch }) {
  if (typeof apiToken !== "string" || apiToken.length === 0) throw new TypeError("apiToken is required");
  if (typeof runId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(runId)) throw new TypeError("runId is invalid");

  const url = new URL(`/api/v1/runs/${encodeURIComponent(runId)}/status`, baseUrl);
  if (url.protocol !== "https:") throw new TypeError("Kaseki status URL must use HTTPS");

  return async () => {
    const deadline = Date.now() + REQUEST_TIMEOUT_MS;
    let lastError;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      try {
        const response = await fetchImpl(url, {
          headers: { authorization: `Bearer ${apiToken}` },
          signal: globalThis.AbortSignal.timeout(remainingMs),
        });
        if (!response.ok) throw new Error(`Kaseki status request failed with HTTP ${response.status}`);
        return await readJsonBody(response);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("Kaseki status request timed out");
  };
}

function requiredEnvironment(environment, name) {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function runKasekiPolling({
  env = process.env,
  fetchImpl = globalThis.fetch,
  appendOutput = appendFileSync,
  stdout = process.stdout,
  now = Date.now,
  wait = delay,
} = {}) {
  const runId = requiredEnvironment(env, "RUN_ID");
  const submittedAtSeconds = env.SUBMITTED_AT
    ? Number(env.SUBMITTED_AT)
    : now() / 1_000;
  if (!Number.isFinite(submittedAtSeconds)) throw new TypeError("SUBMITTED_AT must be a timestamp in seconds");

  const fetchStatus = createKasekiStatusFetcher({
    baseUrl: requiredEnvironment(env, "KASEKI_BASE_URL"),
    apiToken: requiredEnvironment(env, "KASEKI_API_TOKEN"),
    runId,
    fetchImpl,
  });
  const result = await pollKasekiRun({
    fetchStatus,
    deadlineAt: submittedAtSeconds * 1_000 + POLL_TIMEOUT_MS,
    now,
    wait,
  });

  const outputFile = requiredEnvironment(env, "GITHUB_OUTPUT");
  appendOutput(outputFile, `status=${result.status}\n`);
  if (result.exitCode !== undefined && result.exitCode !== 0) {
    throw new Error(`Kaseki run completed with exit code ${result.exitCode}`);
  }
  if (result.status !== "completed") {
    throw new Error(`Kaseki run ended with status ${result.status}`);
  }
  stdout.write("Kaseki status: completed with exit code 0\n");
  return result;
}

async function main() {
  await runKasekiPolling();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : "Kaseki polling failed"}\n`);
    process.exitCode = 1;
  });
}
