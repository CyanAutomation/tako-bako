---
name: deployment-runtime-operations
description: Use when changing Vercel build or runtime configuration, production headers and caching, deployment health checks, or deployment-related operations documentation.
---

# Deployment and runtime operations

Use this skill for the boundary between the Vite build, Vercel hosting, API functions, and production verification. It complements GitHub Actions guidance: Actions orchestrate checks and scheduled tasks, while this skill covers what is built, hosted, configured, and inspected after deployment.

## Map of the implementation

- `vercel.json` selects Vite, the `npm run build` command, `dist` output, response headers, and static asset caching.
- `vite.config.ts` configures local development and its puzzle-generation proxy. Plain `npm run dev` does not run Vercel serverless handlers.
- `api/` contains Vercel function routes; `docs/operations.md` documents routes, runtime configuration, provider setup, cache behavior, privacy, and troubleshooting.
- `.github/workflows/deployment-smoke.yml` checks the production health endpoint on a schedule or manual dispatch. It is a health check, not a deployment trigger or full browser test.
- `.github/workflows/ci.yml` runs the quality gate and a separate Chromium smoke test. The health endpoint also depends on Yokaiba availability.

## Runtime and deployment invariants

- Keep provider origins and credentials server-side. Document required environment names and which service receives each one; never commit secret values or print them in logs.
- Preserve the single-origin Vercel setup for the app and API routes unless the CORS and routing contracts are deliberately redesigned.
- Preserve the root HTML revalidation policy, immutable caching for content-hashed assets, and the documented cache policy for stable brand assets. Do not cache request-specific API responses.
- Preserve the documented security headers and check the actual deployed responses when changing their rules. Ensure the Content Security Policy still permits the app's required resources.
- Treat `/api/health` as dependency readiness: a Yokaiba outage should be visible in health status. Keep the smoke check bounded, avoid logging response bodies, and do not make it a release or deploy trigger by accident.
- Build and local Vite behavior are not equivalent to the Vercel runtime. Use a local Vercel serverless runtime when validating function behavior that Vite does not host.

## Change workflow

1. Read `vercel.json`, the affected API route or Vite configuration, and the matching section of `docs/operations.md` before changing runtime behavior.
2. Identify cache, security-header, environment-variable, health, and local-development effects. Keep secret values out of examples and diagnostics.
3. Add or update config and route tests where the behavior is testable. Update operational instructions and `docs/test-traceability.md` when a documented contract changes.
4. Run `npm run check` for lint, unit tests, documentation checks, and build. Run `npm run test:e2e` for browser-visible changes.
5. After a production deployment, inspect the root and an API response for expected security and cache headers, then check `/api/health`. Do not treat a passing health response as proof of the full gameplay flow.

## Related skills

- [GitHub Actions operations](../github-actions-operations/SKILL.md) for workflow structure, permissions, and scheduled automation.
- [API and provider boundaries](../api-provider-boundaries/SKILL.md) for API request validation, upstream behavior, and response cache rules.
- [Test and contract maintenance](../test-contract-maintenance/SKILL.md) for test coverage, traceability, and operations documentation.
