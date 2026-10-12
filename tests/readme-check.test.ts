import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkReadme } from "../scripts/check-readme.mjs";

test("README documentation check accepts existing relative links and project paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tako-bako-readme-check-"));
  try {
    await mkdir(join(root, "docs"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "docs", "guide.md"), "# Guide\n");
    await writeFile(join(root, "src", "main.ts"), "export {};\n");
    await writeFile(join(root, "README.md"), [
      "[Guide](docs/guide.md)",
      "## Project Structure",
      "```text",
      "src/          Application source",
      "  main.ts     Entry point",
      "```",
    ].join("\n"));

    assert.deepStrictEqual(await checkReadme(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("README documentation check reports broken relative links and project paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "tako-bako-readme-check-"));
  try {
    await writeFile(join(root, "README.md"), [
      "[Missing guide](docs/missing.md)",
      "## Project Structure",
      "```text",
      "src/missing.ts     Missing entry point",
      "```",
    ].join("\n"));

    assert.deepStrictEqual(await checkReadme(root), [
      "README.md: relative link target does not exist: docs/missing.md",
      "README.md: project structure path does not exist: src/missing.ts",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
