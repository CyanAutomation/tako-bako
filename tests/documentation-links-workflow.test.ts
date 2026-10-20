import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseDocument } from "yaml";

test("manual external link checks only inspect the main branch", () => {
  const source = readFileSync(new URL("../.github/workflows/documentation-links.yml", import.meta.url), "utf8");
  const document = parseDocument(source);
  assert.deepStrictEqual(document.errors, []);

  const workflow = document.toJSON() as {
    jobs: Record<string, { if?: string }>;
  };
  assert.equal(workflow.jobs["external-links"]?.if, "github.ref == 'refs/heads/main'");
});
