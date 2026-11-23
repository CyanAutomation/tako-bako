import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import {
  createUiBadge,
  createUiButton,
  createUiCard,
  createUiDivider,
  createUiStack,
  createUiText,
} from "./ui-primitives";

function createDocument() {
  return parseHTML("<html><body></body></html>").document;
}

describe("reusable UI primitives", () => {
  it("composes semantic cards and vertical or horizontal stacks", () => {
    const document = createDocument();
    const title = createUiText(document, "Reasoning guide", { variant: "caption" });
    const body = createUiText(document, "Use the relationship between the clues.");
    const stack = createUiStack(document, "vertical", [title, body]);
    const card = createUiCard(document, [stack]);
    const row = createUiStack(document, "horizontal", [createUiBadge(document, "Direct match")]);

    assert.equal(card.tagName, "ARTICLE");
    assert.ok(card.classList.contains("ui-card"));
    assert.ok(stack.classList.contains("ui-stack--vertical"));
    assert.ok(row.classList.contains("ui-stack--horizontal"));
    assert.equal(card.textContent, "Reasoning guideUse the relationship between the clues.");
  });

  it("uses textContent for untrusted text and exposes a real button action", () => {
    const document = createDocument();
    const text = createUiText(document, "<img src=x onerror=alert(1)>");
    let activated = false;
    const button = createUiButton(document, "Dismiss note", () => { activated = true; });
    const divider = createUiDivider(document);

    assert.equal(text.textContent, "<img src=x onerror=alert(1)>");
    assert.equal(text.querySelector("img"), null);
    assert.equal(button.type, "button");
    assert.equal(button.textContent, "Dismiss note");
    assert.equal(divider.tagName, "HR");
    button.click();
    assert.equal(activated, true);
  });
});
