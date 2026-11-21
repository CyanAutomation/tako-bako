import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateSoyuzRunId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new Error("Soyuz returned an invalid UUIDv7 run ID");
  }

  return value;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.stdout.write(validateSoyuzRunId(process.env.SOYUZ_RUN_ID) + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write("::error title=Invalid Soyuz run ID::" + message + "\n");
    process.exitCode = 1;
  }
}
