import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const docsWorkflow = readFileSync(
  new URL("../.github/workflows/kaseki-docs.yaml", import.meta.url),
  "utf8",
);
const dryWorkflow = readFileSync(
  new URL("../.github/workflows/kaseki-dry.yaml", import.meta.url),
  "utf8",
);

const workflows = [docsWorkflow, dryWorkflow];

function workflowStep(source: string, name: string): string {
  const marker = `      - name: ${name}\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `workflow step "${name}" should exist`);
  const nextStep = source.indexOf("\n      - name:", start + marker.length);
  return source.slice(start, nextStep === -1 ? source.length : nextStep);
}

function shellScripts(workflow: string): string[] {
  const lines = workflow.split("\n");
  const scripts: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== "        run: |") continue;

    const body: string[] = [];
    for (let lineIndex = index + 1; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      if (line.trim() === "") {
        body.push("");
      } else if (line.startsWith("          ")) {
        body.push(line.slice(10));
      } else {
        break;
      }
    }
    scripts.push(body.join("\n"));
  }

  return scripts;
}

function idempotencyProgram(workflow: string): string {
  const step = workflowStep(workflow, "Create idempotency key");
  const match = step.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\n[ \t]*NODE/);
  assert.ok(match, "idempotency step should derive a UUIDv5 from GitHub run context");
  return match[1].split("\n").map(line => line.replace(/^ {12}/, "")).join("\n");
}

function generateIdempotencyKey(program: string, workflowName: string, runId: string): string {
  const result = spawnSync(process.execPath, ["--input-type=module"], {
    encoding: "utf8",
    input: program,
    env: {
      ...process.env,
      GITHUB_REPOSITORY: "CyanAutomation/tako-bako",
      GITHUB_WORKFLOW: workflowName,
      GITHUB_RUN_ID: runId,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("all Kaseki workflow bash steps pass bash syntax validation", () => {
  for (const [index, workflow] of workflows.entries()) {
    const scripts = shellScripts(workflow);
    assert.ok(scripts.length > 0, "each workflow should contain bash steps");

    for (const [scriptIndex, script] of scripts.entries()) {
      const result = spawnSync("bash", ["-n"], {
        encoding: "utf8",
        input: script,
      });
      const context = "workflow " + index + ", bash step " + scriptIndex;
      assert.equal(result.status, 0, context + ": " + result.stderr);
    }
  }
});

test("Kaseki workflows only target main and use repository-wide serialization", () => {
  assert.match(docsWorkflow, /^ {2}REF: main$/m);
  assert.match(dryWorkflow, /^ {6}REF: main$/m);
  assert.match(docsWorkflow, /github\.repository }}@main/);
  assert.match(dryWorkflow, /github\.repository }}@main/);

  const docsJobs = ["docs_sweep"];
  for (const job of docsJobs) {
    const jobStart = docsWorkflow.indexOf(`  ${job}:\n`);
    assert.notEqual(jobStart, -1, `${job} job should exist`);
    const nextJob = docsWorkflow.slice(jobStart + 1).search(/^ {2}[a-z_]+:\n/m);
    const block = docsWorkflow.slice(
      jobStart,
      nextJob === -1 ? docsWorkflow.length : jobStart + 1 + nextJob,
    );
    assert.match(block, /^ {4}if: github\.ref == 'refs\/heads\/main'$/m, "job must be main-only");
  }
  assert.match(dryWorkflow, /^ {4}if: github\.ref == 'refs\/heads\/main'$/m);

  const sharedConcurrencyGroup = "group: kaseki-${{ github.repository }}";
  for (const workflow of workflows) {
    assert.ok(workflow.includes(sharedConcurrencyGroup));
    assert.match(workflow, /^permissions: \{\}$/m);
  }
});

test("both Kaseki requests require normal PR publication and a bounded diff", () => {
  for (const workflow of workflows) {
    assert.match(workflow, /^\s+publishMode: "pr",?$/m);
    assert.doesNotMatch(workflow, /draft_pr/i);
    assert.match(workflow, /^\s+maxDiffBytes: 102400,?$/m);
    assert.match(workflow, /full pull request/);
  }
});

test("Kaseki idempotency keys are stable UUIDv5 values for each GitHub workflow run", () => {
  const docsProgram = idempotencyProgram(docsWorkflow);
  const dryProgram = idempotencyProgram(dryWorkflow);
  assert.equal(docsProgram, dryProgram, "both workflows should share the same key derivation");

  const first = generateIdempotencyKey(docsProgram, "Kaseki Docs Sweep", "123456789");
  const replay = generateIdempotencyKey(docsProgram, "Kaseki Docs Sweep", "123456789");
  const otherWorkflow = generateIdempotencyKey(docsProgram, "Kaseki DRY Sweep", "123456789");
  const otherRun = generateIdempotencyKey(docsProgram, "Kaseki Docs Sweep", "123456790");

  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first, replay);
  assert.notEqual(first, otherWorkflow);
  assert.notEqual(first, otherRun);

  for (const workflow of workflows) {
    assert.match(workflow, /IDEMPOTENCY_KEY: \$\{\{ steps\.idempotency\.outputs\.key \}\}/);
    assert.match(workflow, /--arg idempotencyKey "\$IDEMPOTENCY_KEY"/);
  }
});

test("DOCS waits for the remote run and reports its terminal result", () => {
  const docsSweepJobStart = docsWorkflow.indexOf("  docs_sweep:\n");
  assert.notEqual(docsSweepJobStart, -1);
  const docsSweepJob = docsWorkflow.slice(docsSweepJobStart);
  const waitStep = workflowStep(docsWorkflow, "Wait for Kaseki completion");
  const summary = workflowStep(docsWorkflow, "Publish run details");

  assert.match(docsSweepJob, /^ {4}timeout-minutes: 200$/m);
  assert.match(docsSweepJob, /steps\.wait\.outputs\.status/);
  assert.match(waitStep, /\/api\/runs\/\$RUN_ID\/status/);
  assert.match(waitStep, /\.exitCode \/\/ 0 \| numbers/);
  assert.match(waitStep, /status=failed/);
  assert.match(summary, /FINAL_STATUS: \$\{\{ steps\.wait\.outputs\.status/);
});

test("DRY fails completed runs with nonzero exit codes", () => {
  const waitStep = workflowStep(dryWorkflow, "Wait for Kaseki completion");
  assert.match(waitStep, /\.exitCode \/\/ 0 \| numbers/);
  assert.match(waitStep, /completed with exit code/);
  assert.match(waitStep, /status=failed/);
});
