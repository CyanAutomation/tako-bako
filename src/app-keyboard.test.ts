import assert from "node:assert/strict";
import test from "node:test";

import { handleGridCellKeydown, handleGridTabKeydown } from "./app-keyboard";
import type { Puzzle } from "./puzzle";

const puzzle = {
  spec: {
    baseCategory: "person",
    categories: [
      { id: "person", label: "Person", values: ["Aki", "Ben"] },
      { id: "club", label: "Club", values: ["Lions", "Wolves"] },
      { id: "place", label: "Place", values: ["North", "South"] },
    ],
  },
} as Puzzle;

function keyboardEvent(key: string, target: object): { event: KeyboardEvent; wasPrevented: () => boolean } {
  let prevented = false;
  return {
    event: { key, target, preventDefault: () => { prevented = true; } } as unknown as KeyboardEvent,
    wasPrevented: () => prevented,
  };
}

test("grid cell keyboard handler moves focus only for a valid arrow destination", () => {
  const cell = { disabled: false, dataset: { square: "club|Aki|Lions" } };
  const { event, wasPrevented } = keyboardEvent("ArrowRight", { closest: () => cell });
  const focused: string[] = [];

  assert.equal(handleGridCellKeydown(event, puzzle, key => focused.push(key)), true);
  assert.deepStrictEqual(focused, ["club|Aki|Wolves"]);
  assert.equal(wasPrevented(), true);
});

test("grid tab keyboard handler selects the next tab and requests focus", () => {
  const tab = { dataset: { gridTab: "club" } };
  const { event, wasPrevented } = keyboardEvent("ArrowRight", { closest: () => tab });
  const selections: [string, boolean][] = [];

  handleGridTabKeydown(event, puzzle, (id, focus) => { selections.push([id, focus ?? false]); });
  assert.deepStrictEqual(selections, [["place", true]]);
  assert.equal(wasPrevented(), true);
});
