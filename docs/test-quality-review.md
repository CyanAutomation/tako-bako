# Test quality review follow-up

This is a focused re-score of the ten areas called out in the earlier review. It scores the replacement or retained tests for those areas; it is not a full re-score of every test in the repository. Scores use the order **intent / relevance / assertions / isolation / cost**, with 2 points per dimension. Contract IDs and source links are in [test traceability](test-traceability.md).

| Reviewed area | Replacement or retained test | Scores = total | Segment |
|---|---|---:|---|
| Yokaiba template and seed forwarding | [`sends the selected template and seed`](../src/yokaiba.test.ts) | 2/2/2/2/2 = **10** | Keep |
| Difficulty fallback behavior | [`requests deterministic fallback with a selected difficulty`](../src/yokaiba.test.ts) | 2/2/2/2/2 = **10** | Keep |
| Development proxy endpoint | [`rewrites development puzzle requests with their selected settings`](../src/yokaiba.test.ts) | 2/2/2/2/2 = **10** | Keep |
| Grid selector and tab markup | [`renders a labelled grid selector and one keyboard-focusable active tab`](../src/ui.test.ts) | 2/2/1/2/2 = **9** | Keep |
| Icon action accessibility | [`gives icon actions an accessible name and hides decorative SVGs`](../src/ui.test.ts) | 2/2/1/2/2 = **9** | Keep |
| Clue filter state | [`exposes clue filters as a labelled single-choice control`](../src/ui.test.ts) | 2/2/1/2/2 = **9** | Keep |
| Grid panel states | [`renders a labelled tab panel with its active grid identity`](../src/ui.test.ts) | 2/2/1/2/2 = **9** | Keep |
| Curriculum mapping | [`maps all twelve player-facing courses to their calibrated Yokaiba parameters`](../src/curriculum.test.ts) | 2/2/2/2/2 = **10** | Keep |
| Cross-layer input boundaries | [`accepts documented seed and difficulty boundaries`](../tests/api/puzzle.test.ts) and [`rejects invalid API seed and difficulty boundaries`](../tests/api/puzzle.test.ts) | 2/2/2/2/2 = **10** each | Keep |
| Daily rollover | [`uses one explicit UTC rollover for every player`](../src/daily.test.ts) | 2/2/2/2/2 = **10** | Keep |
| Kaseki workflow contracts and polling | [Structured workflow checks and direct helper tests](../tests/kaseki-workflows.test.ts) | 2/2/2/2/2 = **10** | Keep |

The origin-derivation and query-order tests were removed after request-level and development-proxy coverage took their place. The incomplete `Intl` parts test was removed and its helper made private; the UTC rollover contract remains tested. The Kaseki source-text checks were replaced with YAML configuration checks and tests of the idempotency and polling helpers.

The responsive-tabs test now covers the generated accessible selector and tab relationships. Width-specific CSS visibility still has no browser-level assertion. The mutation evidence is a targeted spot check: five representative behavior changes were introduced temporarily, and all five were caught. This is not a full mutation score.

At the time of this earlier focused review, the 232-test suite passed twice. Running each of the 29 test files separately also passed; the aggregate sequential profile was 8.27 seconds, with the slowest file at 0.96 seconds.

## Follow-up from the all-tests review

The follow-up consolidated duplicate button and cache-boundary assertions, replaced the cache race simulation with overlapping `loadPuzzle` requests, and checks browser history and keyboard behavior through focused app-level tests. Puzzle Challenge level tests now assert disabled state and accessible names; the error-flow test checks its status role. Main-app async tests drain promise callbacks without timer sleeps.

The cache expires records at the exact freshness deadline. `TB-CACHE-01` documents that deadline and the supported cleanup of earlier records without `createdAt`. `TB-OBS-01` documents the generation and health metric fields; tests cover finite, non-negative durations, including a backward wall-clock step. `TB-URL-03` documents that loading an existing puzzle URL does not add a history entry.

The full quality gate passed after this follow-up: lint, all 228 tests, TypeScript checks, and the production build. TDD checks first reproduced the exact-deadline cache bug and negative metric duration, then passed after the fixes.
