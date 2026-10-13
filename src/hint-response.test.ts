import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseHintResponse } from "./hint-response";

describe("parseHintResponse", () => {
  it("accepts placements and clue hints with optional clue IDs", () => {
    assert.deepStrictEqual(parseHintResponse({ kind: "placement", placement: { subject: "Aki", category: "Club", value: "Lions" } }), {
      kind: "placement", placement: { subject: "Aki", category: "Club", value: "Lions" },
    });
    assert.deepStrictEqual(parseHintResponse({ kind: "clue", clue: { id: "next", text: "Try the next clue." } }), {
      kind: "clue", clue: { id: "next", text: "Try the next clue." },
    });
    assert.deepStrictEqual(parseHintResponse({ clue: { text: "A clue without an ID." } }), {
      kind: "clue", clue: { text: "A clue without an ID." },
    });
  });

  it("rejects unsupported or incomplete hint payloads", () => {
    for (const value of [null, [], {}, { kind: "placement", placement: { subject: "Aki" } }, { clue: { id: "missing-text" } }]) {
      assert.strictEqual(parseHintResponse(value), undefined);
    }
  });
});
