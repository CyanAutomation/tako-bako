---
name: github-actions-operations
description: Use when changing GitHub Actions CI, workflow validation, scheduled Kaseki sweeps, or Kaseki helper scripts in Tako Bako.
---

# GitHub Actions operations

Use this skill for changes to repository automation, especially the scheduled Kaseki workflows whose safety properties are covered by tests.

## Map of the implementation

- `.github/workflows/ci.yml` runs the Node 24 quality gate on pull requests and pushes to `main`.
- `.github/workflows/workflow-validation.yml` runs `actionlint` and `zizmor` with read-only permissions.
- `.github/workflows/kaseki-docs.yaml` runs the documentation-only sweep. `.github/workflows/kaseki-dry.yaml` runs the bounded DRY review.
- `.github/actions/kaseki-preflight/` validates controller and gateway readiness.
- `scripts/kaseki/idempotency-key.ts` and `scripts/kaseki/wait-for-run.ts` implement stable run IDs and polling. Their behavior is tested with workflow structure in `tests/kaseki-workflows.test.ts`.

## Workflow invariants

- Keep Kaseki jobs restricted to `main`, serialized through the shared Turnstyle queue, and configured with only the permissions they need. Do not replace Turnstyle with GitHub concurrency: GitHub can replace a pending run instead of queueing it.
- Preserve `persist-credentials: false` on checkouts and use pinned action commit SHAs with readable version comments.
- Kaseki submissions use normal pull requests, stable UUIDv5 idempotency keys, and a 102,400-byte maximum diff. Preserve the polling rule that only completed runs with exit code zero succeed; failures, cancellation, unknown states, and timeout fail.
- Keep each sweep's changed-file allowlist and prompt aligned: the docs sweep is documentation-only; the DRY sweep is limited to source, API, server, and tests and makes at most one focused refactor.
- Keep controller URL and token in the configured GitHub environment/secret. Do not add a public fallback URL or print tokens or response bodies in workflow logs.
- Keep `tests/kaseki-workflows.test.ts` aligned with deliberate workflow contract changes. Workflow validation also runs actionlint and zizmor.

## Change workflow

1. Read the workflow, shared preflight action, helper script, and matching workflow tests before editing.
2. Preserve the boundary between workflow orchestration and helper logic; keep shell steps valid under `bash -n` and use `set -euo pipefail` for multi-line scripts.
3. When changing a workflow contract, update its assertion and the `CI-KASEKI-*` section in `docs/test-traceability.md` if its documented behavior changes.
4. Run `npm test` for workflow structure/helper coverage and `npm run check` for the repository gate. The dedicated workflow-validation job runs actionlint and zizmor.

## Related skills

- [Test and contract maintenance](../test-contract-maintenance/SKILL.md) for workflow tests and traceability.
- [API and provider boundaries](../api-provider-boundaries/SKILL.md) if automation changes server-facing contracts.

