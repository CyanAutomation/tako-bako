import { spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coverageDirectory = process.argv.includes("--coverage")
  ? join(projectRoot, "coverage", "v8")
  : undefined;

if (coverageDirectory) {
  await rm(coverageDirectory, { recursive: true, force: true });
  await mkdir(coverageDirectory, { recursive: true });
}

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findTests(path);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
  }));
  return found.flat();
}

const testFiles = (await Promise.all(["src", "tests"].map(directory => findTests(join(projectRoot, directory)))))
  .flat()
  .sort();

if (testFiles.length === 0) {
  throw new Error("No TypeScript test files were found in src or tests.");
}

const child = spawn(process.execPath, [
  "--import=tsx",
  "--test",
  "--test-reporter=spec",
  ...testFiles,
], {
  cwd: projectRoot,
  stdio: "inherit",
  ...(coverageDirectory ? { env: { ...process.env, NODE_V8_COVERAGE: coverageDirectory } } : {}),
});

const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("close", code => resolveExit(code ?? 1));
});

process.exitCode = exitCode;
