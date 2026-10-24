---
name: accessible-gameplay-ui
description: Use when changing the puzzle board, clue panel, dialogs, navigation, keyboard behavior, responsive layout, or accessibility in Tako Bako.
---

# Accessible gameplay UI

Tako Bako renders a custom DOM interface from TypeScript template strings; it is not a React application. Use this skill for visual and interaction changes in that UI.

## Map of the implementation

- `src/app-view.ts` composes the page and gameplay views. `src/sections/` contains board, clue, curriculum, and header regions.
- `src/ui-*.ts` contains reusable buttons, dialogs, grid cells, tabs, form controls, escaping, and status primitives.
- `src/app.ts` and `src/app-*.ts` handle events and state; `src/app-keyboard.ts` owns keyboard interaction.
- `src/style.css` and `src/expert-grid.css` define responsive and board styling.
- UI markup tests live in `src/ui.test.ts` and `src/sections.test.ts`; app interaction tests include `src/main.test.ts` and `src/app-keyboard.test.ts`.

## Interaction and accessibility rules

- Prefer the existing UI primitives and section renderers so names, states, and markup stay consistent.
- Escape dynamic text before interpolating it into HTML. Keep attributes and IDs derived from controlled values; do not insert untrusted puzzle or user text as raw markup.
- Preserve semantic controls and accessible names. Icon-only actions need a name; decorative SVGs should be hidden from assistive technology.
- For tabs and disclosures, expose the expected roles, relationships, selected/open state, and keyboard behavior. Keep focus usable when dialogs open, close, or rerender.
- Every meaningful action and state change must be available to keyboard users. Grid navigation should remain bounded and predictable.
- Keep readiness, loading, error, and success messages perceivable with appropriate status semantics. Do not rely on color or icon shape alone.
- Check both compact and wide layouts when changing the board or clue panel; the responsive interface changes which navigation controls are visible.

## Change workflow

1. Find the existing renderer and event handler for the control. Reuse a nearby primitive before adding a new markup pattern.
2. Identify the interaction state, accessible name, role, keyboard path, and focus behavior before editing.
3. Add focused markup tests and interaction tests. When CSS visibility or layout is the behavior being changed, inspect the relevant breakpoint rules as well as the generated markup tests.
4. Check the accessibility contracts in `docs/test-traceability.md` (`TB-ACCESS-*`) and the accessibility notes in `README.md`.

## Related skills

- [Gameplay state and routing](../gameplay-state-routing/SKILL.md) for modes and state that the UI presents.
- [Test and contract maintenance](../test-contract-maintenance/SKILL.md) for updating behavior contracts and running the quality gate.

