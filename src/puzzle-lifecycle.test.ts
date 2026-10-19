import assert from "node:assert/strict";
import test from "node:test";
import { shouldRecordPuzzleAbandoned } from "./puzzle-lifecycle";

test("starting another puzzle does not record abandonment after successful completion", () => {
  assert.equal(shouldRecordPuzzleAbandoned(true, true), false);
  assert.equal(shouldRecordPuzzleAbandoned(true, false), true);
  assert.equal(shouldRecordPuzzleAbandoned(false, false), false);
});
