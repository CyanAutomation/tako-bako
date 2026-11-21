---
name: github-actions-operations
description: Use when changing GitHub Actions CI, workflow validation, scheduled Kaseki sweeps, or Soyuz submission helpers in Tako Bako.
---

# GitHub Actions operations

Use this skill for changes to repository automation, especially the scheduled Kaseki workflows whose safety properties are covered by tests.

## Map of the implementation

- `.github/workflows/ci.yml` runs the Node 26 quality gate on pull requests and pushes to `main`.
- `.github/workflows/ci.yml` also runs a Chromium smoke test of the built app.
- `.github/workflows/workflow-validation.yml` runs `actionlint` and `zizmor` with read-only permissions.
- `.github/workflows/dependency-review.yml` checks pull requests for introduced vulnerable dependencies.
- `.github/workflows/deployment-smoke.yml` checks the deployed `/api/health` endpoint on a schedule or manual dispatch; it does not deploy the app.
- `.github/workflows/kaseki-docs.yaml` runs the documentation-only sweep. `.github/workflows/kaseki-dry.yaml` runs the bounded DRY review.
- `scripts/soyuz/validate-soyuz-url.ts` restricts submissions to the approved Soyuz origin.
- `scripts/soyuz/validate-soyuz-run-id.ts` validates UUIDv7 run IDs returned by Soyuz. Workflow contracts and validators are tested in `tests/soyuz-workflows.test.ts`.

## Workflow invariants

- Keep the Kaseki sweeps restricted to `main`, in the `soyuz` environment, and configured with only the permissions they need. Use a separate repository-scoped GitHub concurrency group per sweep with `cancel-in-progress: false`.
- Preserve `persist-credentials: false` on checkouts and use pinned action commit SHAs with readable version comments.
- Keep CI, workflow validation, and CodeQL triggered for merge queue checks so required results are reported for merge groups.
- Submit Kaseki tasks to Soyuz at `/v1/runs` as normal pull requests with a 102,400-byte maximum diff. Send the idempotency key in both the JSON payload and `Idempotency-Key` header; accept only HTTP 200 or 202 and validate the UUIDv7 run ID, display ID, and status. A successful job reports submission acceptance, not remote execution completion.
- Keep each sweep's changed-file allowlist and prompt aligned: the docs sweep is documentation-only; the DRY sweep is limited to source, API, server, and tests and makes at most one focused refactor.
- Keep the Soyuz base URL and submission token in the configured GitHub environment. Do not add a public fallback URL or print tokens or response bodies in workflow logs.
- Keep `tests/soyuz-workflows.test.ts` aligned with deliberate workflow contract changes. Workflow validation also runs actionlint and zizmor.

## Change workflow

1. Read the workflows, Soyuz validators, and matching workflow tests before editing.
2. Preserve the boundary between workflow orchestration and helper logic; keep shell steps valid under `bash -n` and use `set -euo pipefail` for multi-line scripts.
3. When changing a workflow contract, update its assertion and the `CI-SOYUZ-*` section in `docs/test-traceability.md` if its documented behavior changes.
4. Run `npm test` for workflow structure/helper coverage and `npm run check` for the repository gate. The dedicated workflow-validation job runs actionlint and zizmor.

## Related skills

- [Test and contract maintenance](../test-contract-maintenance/SKILL.md) for workflow tests and traceability.
- [Deployment and runtime operations](../deployment-runtime-operations/SKILL.md) for Vercel runtime configuration and post-deployment verification.
- [API and provider boundaries](../api-provider-boundaries/SKILL.md) if automation changes server-facing contracts.

