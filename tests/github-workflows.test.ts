import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseDocument } from "yaml";

type WorkflowStep = { uses?: string; run?: string; with?: Record<string, unknown> };
type WorkflowJob = { permissions?: Record<string, string>; steps?: WorkflowStep[] };
type Workflow = {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
};

function readWorkflow(path: string): Workflow {
  const source = readFileSync(new URL(`../.github/workflows/${path}`, import.meta.url), "utf8");
  const document = parseDocument(source);
  assert.deepStrictEqual(document.errors, [], `${path} must be valid YAML`);
  return document.toJSON() as Workflow;
}

test("[CI-ACTIONS-01] required validation workflows run for merge queue checks", () => {
  for (const path of ["ci.yml", "workflow-validation.yml", "codeql.yml"]) {
    const trigger = readWorkflow(path).on.merge_group as { types?: string[] } | undefined;
    assert.deepStrictEqual(trigger?.types, ["checks_requested"], `${path} should run for merge queue checks`);
  }
});

test("[CI-ACTIONS-02] dependency review checks pull requests with read-only permissions", () => {
  const workflow = readWorkflow("dependency-review.yml");
  assert.ok(workflow.on.pull_request, "dependency review should run on pull requests");
  assert.deepStrictEqual(workflow.permissions, {});
  const job = workflow.jobs.review;
  assert.deepStrictEqual(job?.permissions, { contents: "read", "pull-requests": "read" });
  const action = job?.steps?.find(step => step.uses?.startsWith("actions/dependency-review-action@"));
  assert.match(action?.uses ?? "", /^actions\/dependency-review-action@[0-9a-f]{40}$/);
  assert.equal(action?.with?.["fail-on-severity"], "high");
});

test("[CI-E2E-01] the CI browser smoke job runs Playwright on every quality-gate trigger", () => {
  const workflow = readWorkflow("ci.yml");
  assert.ok(workflow.on.pull_request, "browser smoke should run for pull requests");
  assert.ok(workflow.on.push, "browser smoke should run for main pushes");
  assert.deepStrictEqual(workflow.on.merge_group, { types: ["checks_requested"] });
  const steps = workflow.jobs["browser-smoke"]?.steps ?? [];
  assert.ok(steps.some(step => step.run === "npm run test:e2e"));

  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    scripts?: Record<string, string>;
  };
  assert.equal(packageJson.scripts?.["test:e2e"], "npm run build && playwright test");
});
