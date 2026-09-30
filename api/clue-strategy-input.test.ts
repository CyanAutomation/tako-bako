import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseClues } from "./clue-strategy-input.js";

describe("parseClues", () => {
  it("accepts bounded unique clues and keeps bounded constraint kinds", () => {
    assert.deepStrictEqual(parseClues([
      { id: "one", text: "Aki matches Lions.", constraintKind: "matches" },
      { id: "two", text: "Hana is next to Kenji.", constraintKind: "x".repeat(129) },
    ]), [
      { id: "one", text: "Aki matches Lions.", constraintKind: "matches" },
      { id: "two", text: "Hana is next to Kenji." },
    ]);
  });

  it("rejects empty, oversized, duplicate, and malformed clue lists", () => {
    const tooMany = Array.from({ length: 65 }, (_, index) => ({ id: `clue-${index}`, text: "Valid clue." }));
    const invalid: unknown[] = [
      undefined,
      [],
      tooMany,
      [{ id: "same", text: "First." }, { id: "same", text: "Second." }],
      [{ id: "", text: "Missing ID." }],
      [{ id: "valid", text: "" }],
      [null],
    ];

    for (const value of invalid) assert.strictEqual(parseClues(value), undefined);
  });
});
