# Test quality review follow-up

This file preserves review snapshots from different repository states. Historical suite counts and scores below are not the current inventory; the latest follow-up is at the end of this file.

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
| Soyuz workflow contracts and validation boundaries | [Workflow structure plus URL and run-ID validation tests](../tests/soyuz-workflows.test.ts) | 2/2/2/2/2 = **10** | Keep |

The origin-derivation and query-order tests were removed after request-level and development-proxy coverage took their place. The incomplete `Intl` parts test was removed and its helper made private; the UTC rollover contract remains tested. The Kaseki source-text checks were replaced with YAML configuration checks and tests of the idempotency and polling helpers.

The responsive-tabs test now covers the generated accessible selector and tab relationships. Width-specific CSS visibility still has no browser-level assertion. The mutation evidence is a targeted spot check: five representative behavior changes were introduced temporarily, and all five were caught. This is not a full mutation score.

At the time of this earlier focused review, the 232-test suite passed twice. Running each of the 29 test files separately also passed; the aggregate sequential profile was 8.27 seconds, with the slowest file at 0.96 seconds.

## Follow-up from the all-tests review

The follow-up consolidated duplicate button and cache-boundary assertions, replaced the cache race simulation with overlapping `loadPuzzle` requests, and checks browser history and keyboard behavior through focused app-level tests. Puzzle Challenge level tests now assert disabled state and accessible names; the error-flow test checks its status role. Main-app async tests drain promise callbacks without timer sleeps.

The cache expires records at the exact freshness deadline. `TB-CACHE-01` documents that deadline and the supported cleanup of earlier records without `createdAt`. `TB-OBS-01` documents the generation and health metric fields; tests cover finite, non-negative durations, including a backward wall-clock step. `TB-URL-03` documents that loading an existing puzzle URL does not add a history entry.

The full quality gate passed after this follow-up: lint, all 228 tests, TypeScript checks, and the production build. TDD checks first reproduced the exact-deadline cache bug and negative metric duration, then passed after the fixes.

## Follow-up for the lower-scoring tests

The earlier review intended to remove the actionlint source-string assertion because the workflow-validation job downloads a checksum-pinned actionlint binary and runs it against the workflows. The assertion remained in the test file and is removed in the latest follow-up below. The selected-template test now also covers the no-difficulty fallback behavior, and the tab markup test covers the `data-grid-tab` hook; the duplicate cases were removed.

| Contract or area | Revised test | Scores = total | Segment |
|---|---|---:|---|
| Elapsed outcome time | [`omits elapsed time until a puzzle has started`](../src/events.test.ts), [`measures elapsed time from any valid start timestamp`](../src/events.test.ts), and [`bounds elapsed time to zero through 24 hours`](../src/events.test.ts) | 2/2/2/2/2 = **10** each | Keep |
| Hint request duration | [`keeps hint duration bounded and treats epoch as a valid start time`](../src/hint-request.test.ts) | 2/2/2/2/2 = **10** | Keep |
| Saved clue state | [`persists used clues without changing saved board marks`](../src/puzzle.test.ts) | 2/2/2/2/2 = **10** | Keep |
| Progress reset | [`clears Challenge progress while preserving saved puzzle state`](../src/main.test.ts) | 2/2/2/1/2 = **9** | Keep |
| Cached clue strategy | [`restores clue strategy metadata from a validated cache entry without a request`](../src/puzzle-loader.test.ts) | 2/2/2/2/2 = **10** | Keep |
| Upstream error fallback | [`returns a non-cacheable fallback for an unrecognized Yokaiba 422 response`](../tests/api/puzzle.test.ts) | 2/2/2/2/2 = **10** | Keep |
| Tab relationships | [`renders a labelled grid selector and one keyboard-focusable active tab`](../src/ui.test.ts) | 2/2/1/2/2 = **9** | Keep |
| Dialog naming | [`renders a dialog with an accessible title, description, and supplied actions`](../src/ui.test.ts) | 2/2/2/2/2 = **10** | Keep |
| Invalid daily date | [Current test: `rejects an invalid date input`](../src/daily.test.ts) (named `throws a RangeError when given an invalid Date` at this review) | 2/1/2/2/2 = **9** | Keep |

The progress-reset integration test uses mocked browser globals, so isolation scores 1 despite fixed inputs and deterministic storage. The invalid-date test remains as a documented module boundary. The elapsed-time tests now distinguish “not started” (`undefined`) from the valid Unix epoch (`0`) and protect the event contract from negative durations after a clock rollback.

These scores are source-based. The focused elapsed-time tests first failed against the previous implementation and passed after the fix. No mutation-testing tool was run for this follow-up; mutation score is not measured here.

## Latest follow-up for CI workflow checks and browser smoke

Workflow configuration tests were added first and reproduced missing merge-queue triggers, dependency review, and browser-smoke coverage. The Kaseki workflows retain GitHub's `$/.github/...` self-repository action syntax; actionlint 1.7.12 requires a targeted ignore for that syntax, and zizmor 1.30.1 recognizes it. A Playwright smoke test now starts a mocked Beginner puzzle in Chromium and changes a grid cell. `npm run check` passed lint, all 313 Node tests, documentation validation, and the production build; `npm run test:e2e` passed the browser smoke. The workspace blocked Playwright's browser download with HTTP 403, so local browser verification used the installed system Chromium. CI installs Playwright's Chromium build. This smoke test covers one core flow; it does not measure responsive layouts or full accessibility behavior.

## Latest follow-up for lower-scoring tests

This pass consolidated bounded-text helper cases into one table-driven test while retaining endpoint checks for rejected tokens and acceptance at the configured maximum. It removed the duplicate direct level-card assertion because the curriculum rendering test already covers current and locked accessible names. The invalid-date test now checks the `RangeError` contract without binding to its message. Reset-dialog checks have separate intent for full-board and selected-grid clearing, and the product name remains a standalone landing-page check.

The grid workspace test now verifies its named `<section>` region without checking a styling class. Kaseki preflight coverage checks each step by its named purpose; source-string assertions about actionlint were removed because workflow validation runs the pinned binary on the workflow files. The DRY sweep scope and external-link workflow now have traceability IDs `CI-KASEKI-05` and `CI-DOCS-01`. `TB-BOARD-RESET-01` documents the reset confirmation and Undo contract, and `TB-ACCESS-01` includes the named grid region.

The targeted follow-up suite passed all 82 tests after correcting the reset-dialog assertion to check the native `<dialog>` element. The final `npm run check` passed lint, all 308 tests, documentation validation, TypeScript checks, and the production build. No mutation-testing run was performed for this follow-up.

## Follow-up for the lower-scoring tests

The mock-only link-fetcher argument test and the helper-only missing-documents-directory test were removed; the repository-level checker test still exercises the optional `docs` directory. The duplicate hint-candidate ordering test was removed because the endpoint test asserts both the candidates sent to Jev and the selected player-facing hint. The empty-grid keyboard helper test was removed because accepted puzzles require non-empty category values.

The mocked navigation test now covers only `popstate` restoration, while a Playwright test exercises browser Back. Shared-link dialog behavior has its own test. Clipboard success/dismissal and retry after a clipboard failure are separate tests. The keyboard handler test now verifies that disabled cells and non-arrow keys are left alone. The clue-filter reset check moved from a fake `toggle` event to a browser assertion on the native `<details>.open` property.

API body-parser budgets are documented in [operations](operations.md#request-body-limits) and traced by `TB-API-INPUT-01`. The raw actionlint command-string assertion was removed; the workflow validation job still runs the checksum-pinned actionlint binary against the workflow files.

| Revised test | Scores = total | Segment |
|---|---:|---|
| [`browser Back returns to the landing page after starting a challenge`](../tests/e2e/app-smoke.spec.ts) (`TB-URL-04`) | 2/2/2/2/1 = **9** | Keep |
| [`restarting a challenge closes the open clue filters disclosure`](../tests/e2e/app-smoke.spec.ts) (`TB-CLUE-02`) | 2/2/2/2/1 = **9** | Keep |
| [`opens a shared puzzle from the landing dialog with its template and difficulty`](../src/main.test.ts) (`TB-URL-01`) | 2/2/2/1/2 = **9** | Keep |
| [`applies the documented parser budget to every JSON endpoint`](../tests/api/body-limits.test.ts) (`TB-API-INPUT-01`) | 2/2/2/2/2 = **10** | Keep |
| [`grid cell keyboard handler leaves disabled cells and non-arrow keys alone`](../src/app-keyboard.test.ts) (`TB-ACCESS-01`) | 2/2/2/2/1 = **9** | Keep |
| [`shows and dismisses a snackbar after successfully copying a puzzle link`](../src/main.test.ts) (`TB-URL-05`) | 2/2/2/1/2 = **9** | Keep |
| [`clears a clipboard failure warning after a successful retry`](../src/main.test.ts) (`TB-URL-05`) | 2/2/2/1/2 = **9** | Keep |

The full quality gate passed: lint, all 323 Node tests, documentation validation, TypeScript checks, and the production build. All three Playwright browser smoke tests passed with system Chromium. No mutation-testing run was performed, so mutation coverage remains an estimate from assertion review.

## Follow-up for the Soyuz submission migration

The workflow contract tests were rewritten first and failed against the original Kaseki endpoint, permissions, environment, and run polling. After the workflow changes, the focused Soyuz workflow suite passed. The old controller preflight and polling helpers are no longer used and were removed; URL origin and UUIDv7 response validation now have focused tests. The workflows continue to run their existing repository-specific schedules, prompts, allowlists, and validation commands. The workflow traceability IDs are now `CI-SOYUZ-01` through `CI-SOYUZ-08`.

The final `npm run check` passed lint, all 315 Node tests, documentation checks, TypeScript checks, and the production build. The pinned actionlint 1.7.12 binary also passed. Local `npm ci` reported the declared Node 26 engine mismatch because this environment runs Node 24; the workflows themselves select Node 26.
