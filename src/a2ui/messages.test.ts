import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { A2UI_BASIC_CATALOG_ID, buildHintCoachSurface, buildLearningRecommendationSurface, buildStrategySurface, hintCoachContent } from "./messages";
import type { ClueStrategy } from "../clue-strategy-catalog";

function surface(message: unknown) {
  assert.ok(Array.isArray(message));
  assert.equal(message.length, 1);
  const envelope = message[0] as { version?: unknown; createSurface?: Record<string, unknown> };
  assert.equal(envelope.version, "1.0");
  assert.ok(envelope.createSurface);
  return envelope.createSurface;
}

describe("Tako Bako A2UI message components", () => {
  it("builds a fixed strategy surface with host-owned explanation data", () => {
    const created = surface(buildStrategySurface({
      surfaceId: "tako-strategy-0",
      strategy: "adjacency",
    }));

    assert.equal(created.surfaceId, "tako-strategy-0");
    assert.equal(created.catalogId, A2UI_BASIC_CATALOG_ID);
    assert.equal(created.sendDataModel, false);
    assert.deepEqual(created.dataModel, {
      label: "Neighbours",
      description: "Uses next-to or adjacent positions.",
    });
    assert.ok(Array.isArray(created.components));
  });

  it("builds a bounded hint-coach surface with only the fixed dismiss action", () => {
    const created = surface(buildHintCoachSurface({
      surfaceId: "tako-hint-coach",
      title: "Spacing",
      body: "Use a fixed number of positions between the two items.",
    }));
    const components = created.components as Record<string, unknown>[];
    const dismiss = components.find(component => component.id === "dismiss") as { action?: unknown } | undefined;

    assert.equal(created.surfaceId, "tako-hint-coach");
    assert.deepEqual(created.dataModel, {
      title: "Spacing",
      body: "Use a fixed number of positions between the two items.",
      dismissLabel: "Dismiss note",
    });
    assert.deepEqual(dismiss?.action, { event: { name: "dismiss_hint", context: {} } });
  });

  it("adds a host-bound review action only when the app supplies a matched clue ID", () => {
    const created = surface(buildHintCoachSurface({
      surfaceId: "tako-hint-coach",
      title: "Order",
      body: "Follow the sequence.",
      focusClueId: "clue-7",
    }));
    const components = created.components as Record<string, unknown>[];
    const review = components.find(component => component.id === "review_clue") as { action?: unknown } | undefined;

    assert.deepEqual(review?.action, { event: { name: "focus_clue", context: { clueId: "clue-7" } } });
  });

  it("builds a learning recommendation surface from the fixed strategy catalog", () => {
    const created = surface(buildLearningRecommendationSurface({
      surfaceId: "tako-learning-recommendation",
      strategy: "adjacency",
    }));

    assert.equal(created.surfaceId, "tako-learning-recommendation");
    assert.deepEqual(created.dataModel, {
      label: "For next time",
      body: "Neighbours: Uses next-to or adjacent positions. Look for this kind of reasoning in your next puzzle.",
    });
  });

  it("bounds surface IDs and text before creating protocol messages", () => {
    assert.throws(() => buildHintCoachSurface({ surfaceId: "bad id", title: "Title", body: "Body" }), /surface/i);
    assert.throws(() => buildHintCoachSurface({
      surfaceId: "tako-hint-coach",
      title: "Think",
      body: "x".repeat(2_000),
    }), /outside the supported length/i);
  });

  it("uses generic hint coaching when a strategy is unknown at runtime", () => {
    const content = hintCoachContent({
      kind: "clue",
      clue: { id: "clue-1", text: "Aki lives next to the judoka." },
    }, "future_strategy" as ClueStrategy);

    assert.equal(content.title, "Think through the clue");
    assert.match(content.body, /Aki lives next to the judoka/);
  });
});
