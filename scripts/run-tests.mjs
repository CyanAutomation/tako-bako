import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findTests(path);
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
  }));
  return found.flat();
}

const testFiles = (await Promise.all(["src", "api"].map(directory => findTests(join(projectRoot, directory)))))
  .flat()
  .sort();

if (testFiles.length === 0) {
  throw new Error("No TypeScript test files were found in src or api.");
}

const child = spawn(process.execPath, [
  "--import=tsx",
  "--test",
  "--test-reporter=spec",
  ...testFiles,
], { cwd: projectRoot, stdio: "inherit" });

const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("close", code => resolveExit(code ?? 1));
});

process.exitCode = exitCode;
