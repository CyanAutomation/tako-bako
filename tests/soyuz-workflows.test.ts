import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseDocument } from "yaml";

type WorkflowStep = {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
type WorkflowJob = {
  if?: string;
  name?: string;
  "runs-on"?: string;
  "timeout-minutes"?: number;
  environment?: string;
  env?: Record<string, string>;
  steps: WorkflowStep[];
};
type Workflow = {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency?: { group: string; "cancel-in-progress": boolean };
  env?: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
};

function readYaml(relativePath: string): Record<string, unknown> {
  const source = readFileSync(new URL("../" + relativePath, import.meta.url), "utf8");
  const document = parseDocument(source);
  assert.deepStrictEqual(document.errors, [], relativePath + " must be valid YAML");
  return document.toJSON() as Record<string, unknown>;
}

function readWorkflow(name: string): Workflow {
  return readYaml(".github/workflows/" + name) as unknown as Workflow;
}

const workflows = [
  {
    name: "kaseki-docs.yaml",
    jobName: "docs_sweep",
    concurrencyGroup: "soyuz-docs-sweep-${{ github.repository }}",
    workflow: readWorkflow("kaseki-docs.yaml"),
  },
  {
    name: "kaseki-dry.yaml",
    jobName: "dry_sweep",
    concurrencyGroup: "soyuz-dry-sweep-${{ github.repository }}",
    workflow: readWorkflow("kaseki-dry.yaml"),
  },
];

function allWorkflowSteps(workflow: Workflow): WorkflowStep[] {
  return Object.values(workflow.jobs).flatMap(job => job.steps);
}

function namedStep(workflow: Workflow, name: string): WorkflowStep {
  const step = allWorkflowSteps(workflow).find(candidate => candidate.name === name);
  assert.ok(step, "workflow should contain " + name);
  return step;
}

function submitStep(workflow: Workflow): WorkflowStep {
  const step = allWorkflowSteps(workflow).find(candidate => candidate.id === "submit");
  assert.ok(step?.run, "workflow should have a runnable Soyuz submit step");
  return step;
}

test("[CI-SOYUZ-01] Soyuz sweeps stay on main with least permissions and independent serialization", () => {
  for (const { name, jobName, concurrencyGroup, workflow } of workflows) {
    const expectedCron = name === "kaseki-docs.yaml" ? "0 4 * * 2" : "0 4 * * 0";
    const schedule = workflow.on.schedule as Array<{ cron: string }>;
    assert.deepStrictEqual(schedule?.map(entry => entry.cron), [expectedCron], name + " schedule");
    assert.deepStrictEqual(workflow.permissions, { contents: "read" }, name + " permissions");
    assert.deepStrictEqual(workflow.concurrency, {
      group: concurrencyGroup,
      "cancel-in-progress": false,
    }, name + " concurrency");

    const job = workflow.jobs[jobName];
    assert.equal(job?.if, "github.ref == 'refs/heads/main'", name + " main restriction");
    assert.equal(job?.environment, "soyuz", name + " environment");
    assert.equal(job?.["runs-on"], "ubuntu-24.04", name + " runner");
    assert.equal(job?.["timeout-minutes"], 15, name + " submission timeout");

    const source = readFileSync(new URL("../.github/workflows/" + name, import.meta.url), "utf8");
    assert.doesNotMatch(source, /KASEKI_(BASE_URL|API_TOKEN|PUBLISH_MODE)/);
    assert.doesNotMatch(source, /kaseki-preflight|turnstyle|wait-for-run\.ts/i);
  }
});

test("[CI-SOYUZ-06] Soyuz sweeps use Node 26 and credential-free pinned checkouts", () => {
  for (const { name, workflow } of workflows) {
    const steps = allWorkflowSteps(workflow);
    const checkout = steps.find(step => step.uses?.startsWith("actions/checkout@"));
    const setupNode = steps.find(step => step.uses?.startsWith("actions/setup-node@"));
    assert.ok(checkout, name + " checkout");
    assert.match(checkout.uses ?? "", /^actions\/checkout@[0-9a-f]{40}/);
    assert.equal(checkout.with?.ref, "${{ github.sha }}");
    assert.equal(checkout.with?.["persist-credentials"], false);
    assert.equal(setupNode?.with?.["node-version"], "26");

    const validator = namedStep(workflow, "Validate Soyuz URL");
    assert.match(validator.run ?? "", /node --experimental-strip-types scripts\/soyuz\/validate-soyuz-url\.ts/);
  }
});

test("[CI-SOYUZ-02] both sweeps submit the Soyuz patch contract with bounded retries and idempotency", () => {
  for (const { name, workflow } of workflows) {
    const job = Object.values(workflow.jobs)[0];
    assert.equal(job?.env?.SOYUZ_BASE_URL, "${{ vars.SOYUZ_BASE_URL }}", name + " URL variable");
    const submit = submitStep(workflow);
    assert.equal(submit.env?.SOYUZ_SUBMISSION_API_TOKEN, "${{ secrets.SOYUZ_SUBMISSION_API_TOKEN }}");

    const run = submit.run ?? "";
    assert.match(run, /SOYUZ_BASE_URL\/v1\/runs/);
    assert.match(run, /Authorization: Bearer \$SOYUZ_SUBMISSION_API_TOKEN/);
    assert.match(run, /Idempotency-Key: \$idempotency_key/);
    assert.match(run, /--arg idempotencyKey "\$idempotency_key"/);
    assert.match(run, /--retry 3 --retry-all-errors/);
    assert.match(run, /\^\(200\|202\)\$/);
    assert.match(run, /taskMode: "patch"/);
    assert.match(run, /publishMode: "pr"/);
    assert.match(run, /timeoutSeconds: 10800/);
    assert.match(run, /maxDiffBytes: 102400/);
    assert.match(run, /goalCheck: \{\s*enabled: true,\s*maxRetries: 1/);
    assert.match(run, /\.data\.id/);
    assert.match(run, /scripts\/soyuz\/validate-soyuz-run-id\.ts/);
    assert.match(run, /\.data\.displayId/);
    assert.match(run, /\.data\.status/);
    assert.match(run, /submission_status=accepted/);
    assert.doesNotMatch(run, /echo .*response_file|cat .*response_file/);
  }
});

test("[CI-SOYUZ-02] each Soyuz sweep retains Tako Bako's task and validation scope", () => {
  const docs = workflows[0]!.workflow.jobs.docs_sweep!.env!;
  assert.equal(docs.REPO_URL, "${{ github.server_url }}/${{ github.repository }}");
  assert.equal(docs.REF, "main");
  assert.equal(docs.TASK_DESCRIPTION, "Keep README.md and docs/ accurate against the current implementation.");
  assert.equal(docs.ALLOWLIST, "README.md,docs/**/*.md");
  assert.equal(docs.VALIDATION_COMMAND, "npm run lint && npm test && npm run build");

  const dry = workflows[1]!.workflow.jobs.dry_sweep!.env!;
  assert.equal(dry.REF, "main");
  assert.equal(dry.ALLOWLIST, "src/**/*,api/**/*,server/**/*,tests/**/*");
  assert.equal(dry.VALIDATION_COMMAND, "npm run check");
  assert.match(dry.TASK_DESCRIPTION ?? "", /conservative DRY-principle review/);

  for (const { workflow } of workflows) {
    const run = submitStep(workflow).run ?? "";
    assert.match(run, /--arg validationCommand "\$VALIDATION_COMMAND"/);
    assert.match(run, /--arg allowlist "\$ALLOWLIST"/);
    assert.match(run, /validationCommands: \[\$validationCommand\]/);
    assert.match(run, /changedFilesAllowlist:/);
  }

  assert.match(submitStep(workflows[0]!.workflow).run ?? "", /documentation sweep for this repository/);
  assert.match(submitStep(workflows[1]!.workflow).run ?? "", /Make at most one focused refactoring/);
});

test("[CI-SOYUZ-03] Soyuz summaries report admission without implying execution completion", () => {
  for (const { name, workflow } of workflows) {
    const summary = namedStep(workflow, "Publish Soyuz submission details");
    assert.equal(summary.if, "always()");
    assert.match(summary.run ?? "", /SUBMISSION_STATUS/);
    assert.match(summary.run ?? "", /DISPLAY_ID/);
    assert.match(summary.run ?? "", /RUN_STATUS/);
    assert.match(summary.run ?? "", /does not confirm execution completion/);
    assert.doesNotMatch(summary.run ?? "", /FINAL_STATUS|KASEKI_BASE_URL/);
    assert.equal(allWorkflowSteps(workflow).some(step => /Wait for Kaseki completion/.test(step.name ?? "")), false, name);
  }
});

test("[CI-SOYUZ-04] all Soyuz workflow bash steps pass syntax validation", () => {
  for (const { name, workflow } of workflows) {
    const scripts = allWorkflowSteps(workflow).filter(step => step.run).map(step => step.run!);
    assert.ok(scripts.length > 0, name + " should contain bash steps");
    for (const [index, script] of scripts.entries()) {
      const result = spawnSync("bash", ["-n"], { encoding: "utf8", input: script });
      assert.equal(result.status, 0, name + " bash step " + index + ": " + result.stderr);
    }
  }
});

test("[CI-SOYUZ-05] DRY submissions stay within source, API, server, and test code", () => {
  const dry = workflows[1]!.workflow.jobs.dry_sweep!.env!;
  assert.equal(dry.ALLOWLIST, "src/**/*,api/**/*,server/**/*,tests/**/*");
  const prompt = submitStep(workflows[1]!.workflow).run ?? "";
  assert.match(prompt, /Make at most one focused refactoring/);
  assert.match(prompt, /A no-change result is successful/);
});

test("[CI-SOYUZ-07] Soyuz URL validation accepts only the configured canonical service origin", async () => {
  const { validateSoyuzBaseUrl } = await import("../scripts/soyuz/validate-soyuz-url.ts");
  const origin = "https://soyuz.scheimann.workers.dev";
  assert.equal(validateSoyuzBaseUrl(origin), origin);
  assert.equal(validateSoyuzBaseUrl(origin + "/"), origin);

  for (const invalid of [
    undefined,
    null,
    "",
    "https://elsewhere.example",
    "http://soyuz.scheimann.workers.dev",
    origin + "/api",
    origin + "?token=value",
    origin + "#section",
    "https://user:pass@soyuz.scheimann.workers.dev",
    origin + " with-space",
  ]) {
    assert.throws(() => validateSoyuzBaseUrl(invalid), /SOYUZ_BASE_URL must be/);
  }
});

test("[CI-SOYUZ-08] URL validator normalizes the GitHub environment value without logging it", () => {
  const directory = mkdtempSync(join(tmpdir(), "soyuz-url-test-"));
  try {
    const githubEnvPath = join(directory, "github-env");
    const origin = "https://soyuz.scheimann.workers.dev";
    const result = spawnSync(process.execPath, [
      "--experimental-strip-types",
      "scripts/soyuz/validate-soyuz-url.ts",
    ], {
      encoding: "utf8",
      env: {
        ...process.env,
        SOYUZ_BASE_URL: origin + "/",
        GITHUB_ENV: githubEnvPath,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(readFileSync(githubEnvPath, "utf8"), "SOYUZ_BASE_URL=" + origin + "\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("[CI-SOYUZ-02] Soyuz run ID validation accepts UUIDv7 only", async () => {
  const { validateSoyuzRunId } = await import("../scripts/soyuz/validate-soyuz-run-id.ts");
  const runId = "01934f3e-5a1b-7abc-8def-1234567890ab";
  assert.equal(validateSoyuzRunId(runId), runId);
  assert.equal(validateSoyuzRunId(runId.toUpperCase()), runId.toUpperCase());

  for (const invalid of [undefined, null, "run_123", "01934f3e-5a1b-4abc-8def-1234567890ab", "01934f3e5a1b7abc8def1234567890ab"]) {
    assert.throws(() => validateSoyuzRunId(invalid), /UUIDv7/);
  }
});

test("[CI-SOYUZ-02] run ID validator CLI prints only a validated UUIDv7", () => {
  const runId = "01934f3e-5a1b-7abc-8def-1234567890ab";
  const result = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "scripts/soyuz/validate-soyuz-run-id.ts",
  ], {
    encoding: "utf8",
    env: { ...process.env, SOYUZ_RUN_ID: runId },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, runId + "\n");
});
