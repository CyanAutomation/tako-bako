import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const UUID_V5_NAMESPACE_URL = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

export function createKasekiIdempotencyKey({ repository, workflow, runId }) {
  for (const [name, value] of Object.entries({ repository, workflow, runId })) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError(`${name} is required to create a Kaseki idempotency key`);
    }
  }

  const name = JSON.stringify([repository, workflow, runId]);
  const digest = createHash("sha1").update(UUID_V5_NAMESPACE_URL).update(name).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;

  const hex = digest.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function main() {
  const key = createKasekiIdempotencyKey({
    repository: process.env.GITHUB_REPOSITORY,
    workflow: process.env.GITHUB_WORKFLOW,
    runId: process.env.GITHUB_RUN_ID,
  });
  process.stdout.write(`${key}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Could not create idempotency key"}\n`);
    process.exitCode = 1;
  }
}
