import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseDocument } from "yaml";

test("[CI-DOCS-01] manual external link checks use Node 26 and inspect only the main branch", () => {
  const source = readFileSync(new URL("../.github/workflows/documentation-links.yml", import.meta.url), "utf8");
  const document = parseDocument(source);
  assert.deepStrictEqual(document.errors, []);

  const workflow = document.toJSON() as {
    jobs: Record<string, { if?: string; steps?: Array<{ uses?: string; with?: Record<string, unknown> }> }>;
  };
  assert.equal(workflow.jobs["external-links"]?.if, "github.ref == 'refs/heads/main'");
  const setupNode = workflow.jobs["external-links"]?.steps?.find(step => step.uses?.startsWith("actions/setup-node@"));
  assert.equal(setupNode?.with?.["node-version"], "26.x");
});
