import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocumentation, checkReadme } from "../scripts/check-readme.ts";

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

    assert.deepStrictEqual(await checkDocumentation(root), [
      "README.md: relative link target does not exist: docs/missing.md",
      "README.md: project structure path does not exist: src/missing.ts",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("README documentation check validates relative links in docs Markdown files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tako-bako-docs-check-"));
  try {
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "README.md"), "# Project\n");
    await writeFile(join(root, "docs", "operations.md"), "[Missing guide](missing-guide.md)\n");

    assert.deepStrictEqual(await checkDocumentation(root), [
      "docs/operations.md: relative link target does not exist: missing-guide.md",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("README documentation check reports missing headings in relative Markdown links", async () => {
  const root = await mkdtemp(join(tmpdir(), "tako-bako-anchor-check-"));
  try {
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "README.md"), "[Operations](docs/operations.md#not-a-section)\n");
    await writeFile(join(root, "docs", "operations.md"), "# Operations\n");

    assert.deepStrictEqual(await checkReadme(root), [
      "README.md: relative link fragment does not exist: docs/operations.md#not-a-section",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
