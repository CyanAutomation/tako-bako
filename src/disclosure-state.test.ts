import assert from "node:assert/strict";
import test from "node:test";

import { applyDisclosureToggle, type DisclosureState } from "./disclosure-state.js";

function initialState(): DisclosureState {
  return {
    actionMenuOpen: false,
    feedbackEntryOpen: false,
    cluesOpen: false,
    clueFiltersOpen: false,
    smartMarkingToolsOpen: false,
  };
}

test("disclosure toggles update the state associated with each supported class", () => {
  const state = initialState();
  const cases = [
    ["action-menu", "actionMenuOpen"],
    ["feedback-entry", "feedbackEntryOpen"],
    ["clue-drawer", "cluesOpen"],
    ["clue-filter-disclosure", "clueFiltersOpen"],
    ["board-tools", "smartMarkingToolsOpen"],
  ] as const;

  for (const [className, key] of cases) {
    applyDisclosureToggle(state, ["unrelated", className], true);
    assert.equal(state[key], true);
  }
});

test("disclosure toggles ignore unrelated classes and support closing an open control", () => {
  const state = initialState();
  state.cluesOpen = true;

  applyDisclosureToggle(state, ["unrelated"], false);
  applyDisclosureToggle(state, ["clue-drawer"], false);

  assert.deepEqual(state, { ...initialState(), cluesOpen: false });
});
