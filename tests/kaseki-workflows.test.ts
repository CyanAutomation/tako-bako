import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { parseDocument } from "yaml";

import { createKasekiIdempotencyKey } from "../scripts/kaseki/idempotency-key.mjs";
import { createKasekiStatusFetcher, pollKasekiRun, runKasekiPolling } from "../scripts/kaseki/wait-for-run.mjs";

type WorkflowStep = { name?: string; uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type WorkflowJob = {
  if?: string;
  env?: Record<string, string>;
  steps: WorkflowStep[];
  strategy?: { "fail-fast"?: boolean; matrix?: { "node-version"?: string[] } };
};
type Workflow = {
  permissions: Record<string, unknown>;
  concurrency: { group: string; "cancel-in-progress": boolean };
  env: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
};

function readYaml(relativePath: string): Record<string, unknown> {
  const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
  const document = parseDocument(source);
  assert.deepStrictEqual(document.errors, [], `${relativePath} must be valid YAML`);
  return document.toJSON() as Record<string, unknown>;
}

function readWorkflow(name: string): Workflow {
  return readYaml(`.github/workflows/${name}`) as unknown as Workflow;
}

const workflows = [
  { name: "kaseki-docs.yaml", workflow: readWorkflow("kaseki-docs.yaml") },
  { name: "kaseki-dry.yaml", workflow: readWorkflow("kaseki-dry.yaml") },
];

function allWorkflowSteps(workflow: Workflow): WorkflowStep[] {
  return Object.values(workflow.jobs).flatMap(job => job.steps);
}

function submitStep(workflow: Workflow): WorkflowStep {
  const step = allWorkflowSteps(workflow).find(candidate => candidate.name?.startsWith("Submit "));
  assert.ok(step?.run, "workflow should have a runnable submit step");
  return step;
}

function namedStep(workflow: Workflow, name: string): WorkflowStep {
  const step = allWorkflowSteps(workflow).find(candidate => candidate.name === name);
  assert.ok(step, `workflow should contain ${name}`);
  return step;
}

test("CI prioritizes Node 24, tests the supported Node 22 line, and disables matrix fail-fast", () => {
  const workflow = readWorkflow("ci.yml");
  const strategy = workflow.jobs.quality?.strategy;
  assert.deepStrictEqual(strategy?.matrix?.["node-version"], ["24.x", "22.x"]);
  assert.equal(strategy?.["fail-fast"], false);

  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    engines: { node: string };
  };
  assert.equal(packageJson.engines.node, "^24.0.0 || ^22.12.0");
});

test("Kaseki sweeps use Node 24 and share a single main-only preflight action", () => {
  for (const { name, workflow } of workflows) {
    assert.equal(workflow.jobs[Object.keys(workflow.jobs)[0]!]!.if, "github.ref == 'refs/heads/main'", `${name} remains main-only`);
    const steps = allWorkflowSteps(workflow);
    const setupNode = steps.find(step => step.uses?.startsWith("actions/setup-node@"));
    const preflight = steps.find(step => step.name === "Verify Kaseki controller and gateway");
    assert.equal(setupNode?.with?.["node-version"], "24.x", `${name} uses Node 24`);
    assert.equal(preflight?.uses, "$/.github/actions/kaseki-preflight");
    assert.deepStrictEqual(preflight?.with, {
      "base-url": "${{ vars.KASEKI_BASE_URL }}",
      "api-token": "${{ secrets.KASEKI_API_TOKEN }}",
    });
  }

  const action = readYaml(".github/actions/kaseki-preflight/action.yml") as {
    inputs: Record<string, { required?: boolean }>;
    runs: { steps: WorkflowStep[] };
  };
  assert.equal(action.inputs["base-url"]?.required, true);
  assert.equal(action.inputs["api-token"]?.required, true);
  assert.ok(action.runs.steps.some(step => step.uses?.startsWith("CyanAutomation/kaseki-agent/.github/actions/verify-controller-health@")));
  assert.ok(action.runs.steps.some(step => step.run?.includes("/ready")));
  assert.ok(action.runs.steps.some(step => step.run?.includes("/api/v1/gateway-test?stage=1")));
});

test("DRY sweep scope includes server code and excludes workflow helper scripts", () => {
  const workflow = readWorkflow("kaseki-dry.yaml");
  const allowlist = workflow.jobs.dry_sweep?.env?.ALLOWLIST;
  assert.equal(allowlist, "src/**/*,api/**/*,server/**/*,tests/**/*");
});

test("all Kaseki workflow bash steps pass bash syntax validation", () => {
  for (const { name, workflow } of workflows) {
    const scripts = allWorkflowSteps(workflow).filter(step => step.run).map(step => step.run!);
    assert.ok(scripts.length > 0, `${name} should contain bash steps`);

    for (const [index, script] of scripts.entries()) {
      const result = spawnSync("bash", ["-n"], { encoding: "utf8", input: script });
      assert.equal(result.status, 0, `${name} bash step ${index}: ${result.stderr}`);
    }
  }

  const action = readYaml(".github/actions/kaseki-preflight/action.yml") as {
    runs: { steps: WorkflowStep[] };
  };
  for (const [index, script] of action.runs.steps.filter(step => step.run).map(step => step.run!).entries()) {
    const result = spawnSync("bash", ["-n"], { encoding: "utf8", input: script });
    assert.equal(result.status, 0, `Kaseki preflight bash step ${index}: ${result.stderr}`);
  }
});

test("[CI-KASEKI-01] workflows run on main with least permissions and shared serialization", () => {
  for (const { name, workflow } of workflows) {
    assert.deepStrictEqual(workflow.permissions, { contents: "read" }, `${name} should request read-only checkout access`);
    assert.deepStrictEqual(workflow.concurrency, {
      group: "kaseki-${{ github.repository }}",
      "cancel-in-progress": false,
    });
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      assert.equal(job.if, "github.ref == 'refs/heads/main'", `${name} job ${jobName} should run only on main`);
    }
  }
});

test("[CI-KASEKI-01] workflows check out helpers without persisting credentials and select Node 24", () => {
  for (const { name, workflow } of workflows) {
    const steps = allWorkflowSteps(workflow);
    const checkout = steps.find(step => step.uses?.startsWith("actions/checkout@"));
    const setupNode = steps.find(step => step.uses?.startsWith("actions/setup-node@"));

    assert.ok(checkout, `${name} should check out the helper scripts`);
    assert.equal(checkout.with?.["persist-credentials"], false);
    assert.ok(setupNode, `${name} should select a supported Node runtime`);
    assert.equal(setupNode.with?.["node-version"], "24.x");
  }
});

test("[CI-KASEKI-02] submit steps use the configured pull request mode and diff limit", () => {
  for (const { name, workflow } of workflows) {
    assert.equal(workflow.env.KASEKI_PUBLISH_MODE, "pr", `${name} publish mode`);
    assert.equal(workflow.env.KASEKI_MAX_DIFF_BYTES, "102400", `${name} diff limit`);
    const run = submitStep(workflow).run!;
    assert.match(run, /--arg publishMode "\$KASEKI_PUBLISH_MODE"/);
    assert.match(run, /--argjson maxDiffBytes "\$KASEKI_MAX_DIFF_BYTES"/);
    assert.match(run, /publishMode: \$publishMode/);
    assert.match(run, /maxDiffBytes: \$maxDiffBytes/);
  }
});

test("[CI-KASEKI-03] idempotency keys are stable UUIDv5 values for each workflow run", () => {
  const input = {
    repository: "CyanAutomation/tako-bako",
    workflow: "Kaseki Docs Sweep",
    runId: "123456789",
  };
  const first = createKasekiIdempotencyKey(input);

  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first, "3bc77288-0b27-51ed-9866-c12d81d76d63");
  assert.equal(first, createKasekiIdempotencyKey(input));
  assert.notEqual(first, createKasekiIdempotencyKey({ ...input, workflow: "Kaseki DRY Sweep" }));
  assert.notEqual(first, createKasekiIdempotencyKey({ ...input, runId: "123456790" }));
});

test("[CI-KASEKI-03] idempotency CLI reads GitHub run context", () => {
  const result = spawnSync(process.execPath, ["scripts/kaseki/idempotency-key.mjs"], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      GITHUB_REPOSITORY: "CyanAutomation/tako-bako",
      GITHUB_WORKFLOW: "Kaseki Docs Sweep",
      GITHUB_RUN_ID: "123456789",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "3bc77288-0b27-51ed-9866-c12d81d76d63");
});

test("[CI-KASEKI-03] workflows invoke the tested idempotency and status helpers", () => {
  for (const { name, workflow } of workflows) {
    assert.match(namedStep(workflow, "Create idempotency key").run ?? "", /node scripts\/kaseki\/idempotency-key\.mjs/);
    assert.match(namedStep(workflow, "Wait for Kaseki completion").run ?? "", /node scripts\/kaseki\/wait-for-run\.mjs/);
    assert.equal(namedStep(workflow, "Wait for Kaseki completion").env?.KASEKI_API_TOKEN, "${{ secrets.KASEKI_API_TOKEN }}");
    assert.equal(namedStep(workflow, "Wait for Kaseki completion").env?.RUN_ID, "${{ steps.submit.outputs.run_id }}");
    if (name === "kaseki-dry.yaml") {
      assert.equal(namedStep(workflow, "Wait for Kaseki completion").env?.SUBMITTED_AT, "${{ steps.submit.outputs.submitted_at }}");
    }
  }
});

test("[CI-KASEKI-03] status fetch uses the authenticated HTTPS endpoint and retries transient failures", async () => {
  const calls: { input: URL | RequestInfo; init?: RequestInit }[] = [];
  const responses = [
    new Response("unavailable", { status: 503 }),
    new Response(JSON.stringify({ status: "running" }), { status: 200 }),
  ];
  const fetchStatus = createKasekiStatusFetcher({
    baseUrl: "https://kaseki.example",
    apiToken: "test-token",
    runId: "run_123",
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return responses.shift()!;
    },
  });

  assert.deepStrictEqual(await fetchStatus(), { status: "running" });
  assert.equal(calls.length, 2);
  assert.equal(String(calls[0]?.input), "https://kaseki.example/api/v1/runs/run_123/status");
  assert.equal(new Headers(calls[1]?.init?.headers).get("authorization"), "Bearer test-token");
  assert.throws(() => createKasekiStatusFetcher({ baseUrl: "http://kaseki.example", apiToken: "test-token", runId: "run_123" }), /HTTPS/);
});

test("[CI-KASEKI-03] polling returns success only for a completed run with exit code zero", async () => {
  const responses: unknown[] = [
    { status: "queued" },
    { status: "running" },
    { status: "completed", exitCode: 0 },
  ];
  let now = 0;
  const delays: number[] = [];

  const result = await pollKasekiRun({
    fetchStatus: async () => responses.shift(),
    deadlineAt: 180_000,
    now: () => now,
    wait: async milliseconds => {
      delays.push(milliseconds);
      now += milliseconds;
    },
  });

  assert.deepStrictEqual(result, { status: "completed", exitCode: 0 });
  assert.deepStrictEqual(delays, [60_000, 60_000]);
});

test("[CI-KASEKI-03] polling marks nonzero completion, failure, and cancellation as unsuccessful", async () => {
  const cases = [
    { response: { status: "completed", exitCode: 7 }, expected: { status: "failed", exitCode: 7 } },
    { response: { status: "failed" }, expected: { status: "failed" } },
    { response: { status: "cancelled" }, expected: { status: "cancelled" } },
  ] as const;

  for (const { response, expected } of cases) {
    const result = await pollKasekiRun({
      fetchStatus: async () => response,
      deadlineAt: 60_000,
      now: () => 0,
      wait: async () => undefined,
    });
    assert.deepStrictEqual(result, expected);
  }
});

test("[CI-KASEKI-03] polling rejects unsupported states and expired deadlines", async () => {
  await assert.rejects(pollKasekiRun({
    fetchStatus: async () => ({ status: "starting" }),
    deadlineAt: 60_000,
    now: () => 0,
    wait: async () => undefined,
  }), /unsupported status/);

  let requests = 0;
  await assert.rejects(pollKasekiRun({
    fetchStatus: async () => { requests += 1; return { status: "queued" }; },
    deadlineAt: 0,
    now: () => 0,
    wait: async () => undefined,
  }), /timed out/);
  assert.equal(requests, 0);
});

test("[CI-KASEKI-03] polling entrypoint writes successful status and reports completion", async () => {
  const output: string[] = [];
  let stdout = "";
  const result = await runKasekiPolling({
    env: {
      RUN_ID: "run_123",
      SUBMITTED_AT: "1",
      KASEKI_BASE_URL: "https://kaseki.example",
      KASEKI_API_TOKEN: "test-token",
      GITHUB_OUTPUT: "github-output",
    },
    fetchImpl: async (input: URL | RequestInfo, init?: RequestInit) => {
      assert.equal(String(input), "https://kaseki.example/api/v1/runs/run_123/status");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-token");
      return new Response(JSON.stringify({ status: "completed", exitCode: 0 }));
    },
    appendOutput: (path: string, contents: string) => output.push(`${path}:${contents}`),
    stdout: { write: (contents: string) => { stdout += contents; return true; } },
    now: () => 1_000,
    wait: async () => undefined,
  });

  assert.deepStrictEqual(result, { status: "completed", exitCode: 0 });
  assert.deepStrictEqual(output, ["github-output:status=completed\n"]);
  assert.equal(stdout, "Kaseki status: completed with exit code 0\n");
});

test("[CI-KASEKI-03] polling entrypoint writes terminal failure before failing the job", async () => {
  const output: string[] = [];
  await assert.rejects(runKasekiPolling({
    env: {
      RUN_ID: "run_123",
      SUBMITTED_AT: "1",
      KASEKI_BASE_URL: "https://kaseki.example",
      KASEKI_API_TOKEN: "test-token",
      GITHUB_OUTPUT: "github-output",
    },
    fetchImpl: async () => new Response(JSON.stringify({ status: "cancelled" })),
    appendOutput: (path: string, contents: string) => output.push(`${path}:${contents}`),
    stdout: { write: () => true },
    now: () => 1_000,
    wait: async () => undefined,
  }), /Kaseki run ended with status cancelled/);

  assert.deepStrictEqual(output, ["github-output:status=cancelled\n"]);
});
