import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hintCandidates } from "../../api/hint-selection.js";
import { parseSelectionContext } from "../../api/hint-context.js";
import type { SelectionContext } from "../../api/hint-context-types.js";

describe("hintCandidates", () => {
  it("omits a used solver clue and appends only fresh clues", () => {
    const context: SelectionContext = {
      clues: [
        { id: "used", text: "The old clue." },
        { id: "fresh", text: "The next clue.", strategy: "adjacency" },
      ],
      usedClueIds: new Set(["used"]),
      board: [],
    };

    assert.deepStrictEqual(hintCandidates({ kind: "clue", clue: { id: "used", text: "The old clue." } }, context), [{
      id: "clue:fresh",
      payload: { kind: "clue", clue: { id: "fresh", text: "The next clue." } },
      type: "clue",
      text: "The next clue. (reasoning strategy: Neighbours)",
    }]);
  });

  it("keeps solver placements and appends unused clues in order", () => {
    const context: SelectionContext = {
      clues: [{ id: "fresh", text: "The next clue." }],
      usedClueIds: new Set(),
      board: [],
    };

    const candidates = hintCandidates({ kind: "placement", placement: { subject: "Aki", category: "Club", value: "Lions" } }, context);

    assert.strictEqual(candidates[0]?.id, "solver_primary");
    assert.strictEqual(candidates[0]?.type, "placement");
    assert.strictEqual(candidates[1]?.id, "clue:fresh");
  });

  it("caps upstream candidate text while preserving the original hint payload", () => {
    const clueText = "🐟".repeat(600);
    const payload = { kind: "clue", clue: { id: "upstream", text: clueText } };
    const candidate = hintCandidates(payload, { clues: [], usedClueIds: new Set(), board: [] })[0];

    assert.ok(candidate);
    assert.ok(candidate.text.length <= 512);
    assert.ok(candidate.text.endsWith("🐟…"));
    assert.deepStrictEqual(candidate.payload, payload);
  });

  it("rejects duplicate clue IDs and board coordinates in optional selection context", () => {
    assert.strictEqual(parseSelectionContext({ clues: [{ id: "same", text: "One." }, { id: "same", text: "Two." }] }), undefined);
    assert.strictEqual(parseSelectionContext({ board: [
      { category: "Club", subject: "Aki", value: "Lions", mark: "yes" },
      { category: "Club", subject: "Aki", value: "Lions", mark: "no" },
    ] }), undefined);
  });
});
