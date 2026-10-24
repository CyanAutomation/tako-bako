---
name: gameplay-state-routing
description: Use when changing puzzle modes, shared URLs, scenarios, Puzzle Challenge progression, daily puzzles, or saved gameplay state in Tako Bako.
---

# Gameplay state and routing

Use this skill for browser-side changes to which puzzle is active, how a player reaches it, and what the game remembers.

## Map of the implementation

- `src/app.ts` coordinates application state and browser events. Related responsibilities are split into `src/app-*.ts`, `src/puzzle-*.ts`, and `src/sections/` modules.
- `src/app-routing.ts` resolves and builds URLs. `src/puzzle-input.ts` validates shared seed and difficulty values; `src/scenarios.ts` resolves supported and legacy scenario IDs.
- `src/curriculum.ts`, `src/progress.ts`, and `src/daily.ts` define course mapping, unlock/progression behavior, and UTC daily seeds.
- `src/puzzle-storage.ts` saves per-puzzle board marks and used clues. `src/progress-storage.ts` stores Challenge completion separately.
- `src/puzzle-parser.ts` validates generated puzzle data before it enters app state.

Read the focused module and its colocated tests before changing behavior. Consult the `Puzzle Challenge` and `Share` sections of `README.md` for the player-facing contract.

## Invariants to preserve

- Challenge and shared play are distinct modes. Only an explicit Challenge completion advances course progress; solving a shared puzzle does not.
- A shared URL must remain replayable. Preserve the documented seed syntax (1–128 ASCII letters, digits, or hyphens), difficulty range (1–12), supported templates, and legacy-link mappings.
- URL parsing and browser storage are untrusted input. Validate values and stored JSON, tolerate malformed or outdated values, and keep saved board state separate from Challenge progress.
- Daily puzzle identity must be the same for every player and roll over at midnight UTC.
- Loading a puzzle from its current URL must not add a duplicate history entry. Use the caller-selected `push`, `replace`, or `none` history behavior.
- When changing a persisted shape or key, consider old saved values and preserve unrelated storage entries.

## Change workflow

1. Trace the flow from route or user action through `src/app.ts` into the focused pure helper, loader, or storage module.
2. Keep parsing, mapping, and policy logic in small testable modules; keep orchestration in the app layer.
3. Update focused tests for both valid behavior and malformed or boundary inputs. Check relevant contract IDs in `docs/test-traceability.md` and update them if the documented behavior changes.
4. If a change affects a URL or persisted value, check restoration and progression paths as well as the path that creates it.

Useful focused tests include `src/app-routing.test.ts`, `src/shared-puzzle.test.ts`, `src/puzzle-input.test.ts`, `src/curriculum.test.ts`, `src/daily.test.ts`, `src/progress.test.ts`, `src/puzzle-storage` coverage in `src/puzzle.test.ts`, and `src/main.test.ts` for app integration.

## Related skills

- [API and provider boundaries](../api-provider-boundaries/SKILL.md) for browser-to-server contracts.
- [Accessible gameplay UI](../accessible-gameplay-ui/SKILL.md) for user actions and visible state.
- [Test and contract maintenance](../test-contract-maintenance/SKILL.md) for test and documentation updates.

