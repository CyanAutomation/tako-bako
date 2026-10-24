---
name: test-contract-maintenance
description: Use when adding or changing tests, test contracts, README or operations documentation, or the repository quality gate.
---

# Test and contract maintenance

Use this skill to keep implementation behavior, focused tests, and repository documentation aligned.

## Test setup

- The project targets Node.js `^24.0.0`, uses TypeScript/ES modules, and runs tests with Node's built-in test runner through `tsx`.
- `npm test` runs `scripts/run-tests.ts`, which discovers `*.test.ts` files in `src/` and `tests/` and runs them in sorted order.
- Most pure browser logic has colocated tests in `src/`; Vercel route and cross-module tests are under `tests/` and `tests/api/`.
- `docs/test-traceability.md` maps stable contract IDs to product or operations documentation and test files. `docs/test-quality-review.md` records review history and known coverage limitations.

## Test and documentation rules

- Test observable behavior at the narrowest useful layer. Prefer parsing real YAML/config or exercising handlers/helpers over brittle assertions about source-code text.
- Include negative and boundary cases where the behavior accepts external, persisted, or user-controlled values.
- Keep tests isolated and deterministic. Use explicit dates for UTC rollover behavior, controlled clocks for elapsed time, and injected fetchers/storage where supported.
- When a product or operations contract changes, update its source documentation (`README.md` or `docs/operations.md`) and the corresponding traceability row. Keep IDs stable when the underlying contract is unchanged.
- Keep coverage-review documents accurate about what was tested and what was not measured; do not claim browser-level or mutation coverage from source-level tests.
- Use `npm run check` for the full gate: lint, tests, documentation checks, and production build. `npm run check:external-links` is a separate network-dependent check.

## Change workflow

1. Locate the owning implementation, its focused tests, and any related `TB-*` or `CI-*` entry in `docs/test-traceability.md`.
2. Add or adjust assertions that explain the public behavior and regression boundary. Keep test names descriptive and tie them to a contract ID when appropriate.
3. Update README/operations docs and traceability together if the contract changes. Avoid duplicating implementation detail in player-facing docs.
4. Review the full diff for consistency. Use the focused test while iterating, then `npm run check` when validating a complete change.

## Related skills

- [Gameplay state and routing](../gameplay-state-routing/SKILL.md) for player-state contracts.
- [API and provider boundaries](../api-provider-boundaries/SKILL.md) for API, privacy, cache, and provider contracts.
- [Accessible gameplay UI](../accessible-gameplay-ui/SKILL.md) for UI and accessibility behavior.
- [GitHub Actions operations](../github-actions-operations/SKILL.md) for workflow contracts.

