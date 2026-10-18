import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { extractMarkdownDestinations, markdownFiles } from "../scripts/markdown-documents.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function createDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "tako-bako-markdown-documents-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("shared Markdown document helpers", () => {
  it("extracts link destinations with or without angle brackets", () => {
    assert.deepStrictEqual(extractMarkdownDestinations([
      "[relative](docs/guide.md)",
      "[wrapped](<https://example.com/path?q=1>)",
      "[with title](chapter.md \"Chapter\")",
    ].join("\n")), ["docs/guide.md", "https://example.com/path?q=1", "chapter.md"]);
  });

  it("finds Markdown files recursively and ignores other files", async () => {
    const root = await createDirectory();
    await mkdir(join(root, "docs", "nested"), { recursive: true });
    await writeFile(join(root, "docs", "guide.md"), "# Guide");
    await writeFile(join(root, "docs", "nested", "notes.MD"), "# Notes");
    await writeFile(join(root, "docs", "nested", "readme.txt"), "Not Markdown");

    assert.deepStrictEqual((await markdownFiles(join(root, "docs"))).sort(), [
      join(root, "docs", "guide.md"),
      join(root, "docs", "nested", "notes.MD"),
    ]);
  });

  it("treats a missing optional document directory as empty", async () => {
    const root = await createDirectory();

    assert.deepStrictEqual(await markdownFiles(join(root, "missing")), []);
  });
});
