---
name: api-provider-boundaries
description: Use when changing Vercel API handlers, Yokaiba or Jev integration, request validation, cache behavior, privacy, or server-side metrics.
---

# API and provider boundaries

Use this skill for changes at the boundary between the browser, Tako Bako's Vercel handlers, and external services.

## Map of the implementation

- `api/` contains Vercel serverless handlers. `api/puzzle.ts` generates and verifies puzzles; other handlers cover hints, clue strategies, events, feedback, and health.
- `server/` contains shared provider-origin, payload, and model-client logic.
- `src/puzzle-input.ts`, `src/scenarios.ts`, and `src/cache-policy.ts` hold contracts shared by client and server code.
- `docs/operations.md` documents routes, configuration, cache behavior, privacy, and troubleshooting. API boundary tests are under `tests/` and `tests/api/`.

## Boundary rules

- Treat query parameters, request bodies, forwarded headers, and provider responses as untrusted. Validate methods, shapes, allow-listed values, and size/range limits before forwarding or using them.
- Keep provider origins server-side. Do not expose credentials or provider secrets in browser modules, committed configuration, errors, or logs.
- Generated puzzles contain a signed `puzzleToken`; the solution must stay with Yokaiba. Answer verification and hints require that token. Do not introduce a browser-visible solution path.
- Keep Jev optional. Deterministic labels and hint behavior must remain available when its key or services are absent. Validate/cap model-selected behavior against the deterministic policy.
- Send `no-store` for answer-dependent, personal, feedback, or otherwise request-specific responses. Puzzle generation uses the shared five-minute fresh and one-hour stale-while-revalidate policy; preserve generation timestamps when changing cache behavior.
- Forward only useful, bounded upstream details. Sanitize provider failures into stable client messages and retain established rate-limit behavior.
- Logs and metrics must not include puzzle tokens, solutions, answer grids, feedback contents, client addresses, or other gameplay payloads. Keep metrics finite and non-negative and limited to documented diagnostic fields.

## Change workflow

1. Read the relevant handler and its parser/helper before changing a route. Check `docs/operations.md` for the current external-service contract.
2. Keep input parsing and sanitization in focused helpers where possible. Do not forward unknown browser fields by default.
3. Cover method handling, malformed input, boundary values, upstream status/content type, timeout/rate-limit behavior, and no-store/cache headers in the corresponding API tests.
4. Update operations docs and `docs/test-traceability.md` when a route, configuration value, privacy property, or externally visible behavior changes.

Relevant tests include `tests/api/puzzle.test.ts`, `tests/api/hint*.test.ts`, `tests/feedback-api.test.ts`, `tests/event-payload.test.ts`, `tests/clue-strategy-input.test.ts`, and `tests/api/health.test.ts`.

## Related skills

- [Gameplay state and routing](../gameplay-state-routing/SKILL.md) for browser state and URL contracts.
- [Test and contract maintenance](../test-contract-maintenance/SKILL.md) for test, traceability, and operations-doc updates.

