import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseAnswerVerification } from "./answer-verification";

describe("parseAnswerVerification", () => {
  it("accepts both explicit solver outcomes", () => {
    assert.strictEqual(parseAnswerVerification({ correct: true }), true);
    assert.strictEqual(parseAnswerVerification({ correct: false }), false);
  });

  it("rejects malformed response shapes", () => {
    for (const value of [null, [], {}, { correct: "yes" }]) {
      assert.strictEqual(parseAnswerVerification(value), undefined);
    }
  });
});
