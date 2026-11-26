import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { assertVercelFunctionLimit, findVercelFunctionFiles, VERCEL_FUNCTION_LIMIT } from "../scripts/vercel-function-limit.js";

const apiDirectory = fileURLToPath(new URL("../api/", import.meta.url));
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const checkerPath = fileURLToPath(new URL("../scripts/check-vercel-function-limit.ts", import.meta.url));
const inventoryPath = fileURLToPath(new URL("../scripts/vercel-function-limit.ts", import.meta.url));

describe("Vercel function inventory", () => {
  it("finds supported function files recursively and ignores declarations and non-code files", async () => {
    const root = await mkdtemp(join(tmpdir(), "tako-bako-vercel-functions-"));
    try {
      const apiRoot = join(root, "api");
      const nestedDirectory = join(apiRoot, "nested");
      await mkdir(nestedDirectory, { recursive: true });
      await Promise.all([
        writeFile(join(apiRoot, "health.ts"), ""),
        writeFile(join(apiRoot, "legacy.cjs"), ""),
        writeFile(join(apiRoot, "types.d.ts"), ""),
        writeFile(join(apiRoot, "settings.json"), "{}"),
        writeFile(join(nestedDirectory, "events.mjs"), ""),
      ]);

      assert.deepEqual(await findVercelFunctionFiles(apiRoot), [
        "health.ts",
        "legacy.cjs",
        "nested/events.mjs",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("accepts the Hobby function limit and reports every function beyond it", () => {
    const allowed = Array.from({ length: VERCEL_FUNCTION_LIMIT }, (_, index) => `route-${index}.ts`);
    assert.doesNotThrow(() => assertVercelFunctionLimit(allowed));

    const overLimit = [...allowed, "unintended-helper.ts"];
    assert.throws(
      () => assertVercelFunctionLimit(overLimit),
      /Found 13 Vercel functions[\s\S]*\n {2}- api\/unintended-helper\.ts$/,
    );
  });

  it("reports a missing API directory without an unhandled rejection", async () => {
    const root = await mkdtemp(join(tmpdir(), "tako-bako-missing-api-"));
    const scriptsDirectory = join(root, "scripts");
    try {
      await mkdir(scriptsDirectory, { recursive: true });
      await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
      await Promise.all([
        copyFile(checkerPath, join(scriptsDirectory, "check-vercel-function-limit.ts")),
        copyFile(inventoryPath, join(scriptsDirectory, "vercel-function-limit.ts")),
      ]);

      const result = spawnSync(process.execPath, ["--import=tsx", join(scriptsDirectory, "check-vercel-function-limit.ts")], {
        cwd: projectRoot,
        encoding: "utf8",
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /ENOENT.*api/s);
      assert.doesNotMatch(result.stderr, /UnhandledPromiseRejection|triggerUncaughtException/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps this project's API routes within the deployment limit", async () => {
    const functionFiles = await findVercelFunctionFiles(apiDirectory);
    assert.ok(functionFiles.length <= VERCEL_FUNCTION_LIMIT, `${functionFiles.length} Vercel functions found: ${functionFiles.join(", ")}`);
  });
});
