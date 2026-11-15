---
name: hint-clue-strategy
description: Use when changing how clue reasoning strategies are labeled, how gameplay context becomes a hint request, or how deterministic hints and optional Jev selection work.
---

# Hint and clue strategy pipeline

Use this skill for the end-to-end path from a player's board and clues to a labeled strategy or solver-backed hint. The client prepares bounded context, the API validates it, and deterministic solver behavior remains authoritative when optional model services are unavailable.

## Map of the implementation

- `src/hint-request.ts` builds the client request from the signed puzzle, marked board cells, used clues, and bounded gameplay counters.
- `src/clue-strategy-catalog.ts`, `src/clue-strategy-constraints.ts`, and `src/clue-strategy-results.ts` define known labels, deterministic constraint mapping, and accepted model results. `src/clue-strategy.ts` is their compatibility barrel.
- `api/hint*.ts` and `api/clue-strategies.ts` parse and validate requests, consult Yokaiba, and optionally use Jev for bounded selection or labeling.
- `server/jev.ts` handles model calls and response parsing. `src/hint-response.ts` validates the response before the UI consumes it.
- `src/sections/clue-panel.ts` and the app gameplay modules display clues, strategy labels, and returned hints.
- The route behavior and privacy contracts are in `docs/operations.md`; focused tests live in `src/hint-*`, `src/clue-strategy.test.ts`, `tests/api/hint*.test.ts`, and `tests/clue-strategy-input.test.ts`.

## Invariants to preserve

- The signed `puzzleToken` authorizes puzzle-specific server operations. Never expose the solution or add a browser-side answer path.
- Send only the fields needed for hint behavior. Keep marked cells, clue IDs, counters, and elapsed time bounded and validated; never add tokens, solutions, or unnecessary personal data to model context or logs.
- Yokaiba's solver provides valid hint candidates. Jev may rank bounded candidates or classify eligible clue text, but it must not invent hints or determine correctness.
- Preserve deterministic labels for known constraint kinds and deterministic hint behavior when Jev is disabled, misconfigured, unavailable, or returns an invalid response.
- Keep hint strength progression within the current progress-based policy. Model selection must remain bounded by the deterministic candidate set and escalation limit.
- Treat client input, solver responses, and model responses as untrusted. Validate IDs, shapes, values, confidence, candidate membership, and response size before use.
- Do not log puzzle tokens, solution data, answer grids, raw gameplay context, or clue text sent for classification.

## Change workflow

1. Trace the full path for the behavior being changed: request construction, API parsing, solver/provider call, result validation, response parsing, and UI rendering.
2. Keep deterministic policy separate from network and model orchestration. Prefer focused helpers with injectable fetchers or providers where the surrounding code already supports them.
3. Add focused tests for valid, malformed, boundary, unavailable-provider, and invalid-model-result cases. Check both server validation and the client response parser when the contract crosses the API boundary.
4. Update `docs/operations.md` and the relevant `TB-*` entries in `docs/test-traceability.md` when public behavior, provider configuration, privacy, or fallback policy changes.
5. Use `npm test` while iterating and `npm run check` for the complete repository gate. Run `npm run test:e2e` when the visible gameplay flow changes.

## Related skills

- [API and provider boundaries](../api-provider-boundaries/SKILL.md) for route validation, cache headers, provider boundaries, and privacy controls.
- [Accessible gameplay UI](../accessible-gameplay-ui/SKILL.md) for keyboard behavior, accessible clue presentation, or other UI changes.
- [Test and contract maintenance](../test-contract-maintenance/SKILL.md) for tests, traceability, and documentation updates.
