import assert from "node:assert/strict";
import { it } from "node:test";

import { isBoundedText } from "../../api/hint-validation.js";

it("accepts only non-empty strings within the supplied length limit", () => {
  const cases: readonly { value: unknown; maximumLength: number; expected: boolean }[] = [
    { value: "abc", maximumLength: 3, expected: true },
    { value: "abcd", maximumLength: 3, expected: false },
    { value: "", maximumLength: 3, expected: false },
    { value: 7, maximumLength: 3, expected: false },
    { value: null, maximumLength: 3, expected: false },
  ];

  for (const { value, maximumLength, expected } of cases) {
    assert.equal(isBoundedText(value, maximumLength), expected);
  }
});
