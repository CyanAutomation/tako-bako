import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderCoachPanel } from "./coach-panel";

describe("reusable coach panel component", () => {
  it("renders an escaped HTML fallback and A2UI mount point for the hint coach", () => {
    const markup = renderCoachPanel({
      kind: "hint",
      label: "Reasoning coach",
      eyebrow: "Reason with Tako",
      title: "Think through the clue",
      body: "<img src=x onerror=alert(1)>",
      actionLabel: "Dismiss note",
      focusClueLabel: "Review this clue",
    });

    assert.match(markup, /class="hint-coach-fallback/);
    assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(markup, /data-dismiss-hint="true"/);
    assert.match(markup, /data-review-hint-clue="true"/);
    assert.match(markup, /data-a2ui-hint-coach hidden/);
  });

  it("renders the same reusable component contract for learning recommendations", () => {
    const markup = renderCoachPanel({
      kind: "learning",
      label: "Next puzzle focus",
      eyebrow: "For next time",
      title: "A strategy to carry forward",
      body: "Try adjacency.",
    });

    assert.match(markup, /class="learning-recommendation-fallback/);
    assert.match(markup, /data-a2ui-learning-recommendation hidden/);
    assert.doesNotMatch(markup, /data-dismiss-hint/);
  });
});
