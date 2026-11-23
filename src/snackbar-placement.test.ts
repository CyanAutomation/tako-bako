import assert from "node:assert/strict";
import test from "node:test";

import { findOverlappingBlocker } from "./snackbar-placement.js";

function element(rect: DOMRect): { getBoundingClientRect: () => DOMRect } {
  return { getBoundingClientRect: () => rect };
}

const toast = { left: 10, right: 30, top: 10, bottom: 30 } as DOMRect;

test("snackbar placement finds the first visible blocker with a positive-area intersection", () => {
  const hidden = element({ left: 10, right: 30, top: 10, bottom: 30, width: 0, height: 0 } as DOMRect);
  const touchingEdge = element({ left: 30, right: 40, top: 10, bottom: 30, width: 10, height: 20 } as DOMRect);
  const overlap = element({ left: 25, right: 40, top: 25, bottom: 40, width: 15, height: 15 } as DOMRect);
  const laterOverlap = element({ left: 15, right: 25, top: 15, bottom: 25, width: 10, height: 10 } as DOMRect);

  assert.equal(findOverlappingBlocker(toast, [hidden, touchingEdge, overlap, laterOverlap]), overlap);
});

test("snackbar placement returns no blocker when every element is hidden or outside the toast", () => {
  const hidden = element({ left: 15, right: 25, top: 15, bottom: 25, width: 0, height: 10 } as DOMRect);
  const outside = element({ left: 30, right: 40, top: 10, bottom: 30, width: 10, height: 20 } as DOMRect);

  assert.equal(findOverlappingBlocker(toast, [hidden, outside]), undefined);
  assert.equal(findOverlappingBlocker(toast, []), undefined);
});
