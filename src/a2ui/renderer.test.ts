import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import { buildHintCoachSurface, buildLearningRecommendationSurface, buildStrategySurface } from "./messages";
import { A2uiDomRenderer, validateA2uiMessages } from "./renderer";

interface TestComponent {
  id: string;
  component: string;
  action?: { event: { name: string; context: Record<string, unknown> } };
  [key: string]: unknown;
}

interface TestMessage {
  version: string;
  createSurface: { catalogId: string; components: TestComponent[]; [key: string]: unknown };
  [key: string]: unknown;
}

describe("A2UI DOM renderer boundary", () => {
  it("renders a validated hint surface using safe native text components", () => {
    const document = parseHTML("<html><body><main id='target'></main></body></html>").document;
    const target = document.querySelector("#target") as HTMLElement;
    const renderer = new A2uiDomRenderer(target, () => {});
    const message = buildHintCoachSurface({ surfaceId: "tako-hint-coach", title: "Safe text", body: "<img src=x onerror=alert(1)>" });

    renderer.render(message, "tako-hint-coach");

    assert.equal(target.querySelector("img"), null);
    assert.match(target.textContent ?? "", /<img src=x onerror=alert\(1\)>/);
    assert.match(target.querySelector(".ui-card")?.textContent ?? "", /Safe text/);
    renderer.dispose();
  });

  it("renders a validated learning card with the reusable semantic coach-card component", () => {
    const document = parseHTML("<html><body><main id='target'></main></body></html>").document;
    const target = document.querySelector("#target") as HTMLElement;
    const renderer = new A2uiDomRenderer(target, () => {});

    renderer.render(buildLearningRecommendationSurface({
      surfaceId: "tako-learning-recommendation",
      strategy: "adjacency",
    }), "tako-learning-recommendation");

    const card = target.querySelector(".ui-coach-card");
    assert.ok(card);
    assert.equal(card.getAttribute("role"), "note");
    assert.match(card.textContent ?? "", /Neighbours/);
    renderer.dispose();
  });

  it("validates and dispatches an allowlisted button on a non-hint surface", async () => {
    const document = parseHTML("<html><body><main id='target'></main></body></html>").document;
    const target = document.querySelector("#target") as HTMLElement;
    const actions: unknown[] = [];
    const renderer = new A2uiDomRenderer(target, action => { actions.push(action); });
    const messages = buildLearningRecommendationSurface({
      surfaceId: "tako-learning-recommendation",
      strategy: "adjacency",
    });
    const surface = messages[0]!.createSurface;
    const content = surface.components.find(component => component.id === "learning_content")!;
    content.children = [...content.children as string[], "dismiss_button"];
    surface.components.push(
      { id: "dismiss_button", component: "Button", child: "dismiss_label", action: { event: { name: "dismiss_hint", context: {} } } },
      { id: "dismiss_label", component: "Text", text: { "@path": "/dismissLabel" } },
    );
    surface.dataModel.dismissLabel = "Dismiss note";

    assert.equal(validateA2uiMessages(messages, "tako-learning-recommendation").ok, true);
    renderer.render(messages, "tako-learning-recommendation");
    (target.querySelector("button") as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(actions, [{ name: "dismiss_hint", context: {} }]);
    renderer.dispose();
  });

  it("dispatches only the declared A2UI event through the host action callback", async () => {
    const document = parseHTML("<html><body><main id='target'></main></body></html>").document;
    const target = document.querySelector("#target") as HTMLElement;
    const actions: unknown[] = [];
    const renderer = new A2uiDomRenderer(target, action => { actions.push(action); });
    renderer.render(buildHintCoachSurface({ surfaceId: "tako-hint-coach", title: "Order", body: "Follow the sequence." }), "tako-hint-coach");

    (target.querySelector("button") as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(actions, [{ name: "dismiss_hint", context: {} }]);
    renderer.dispose();
  });

  it("passes a matched clue ID through the validated review action", async () => {
    const document = parseHTML("<html><body><main id='target'></main></body></html>").document;
    const target = document.querySelector("#target") as HTMLElement;
    const actions: unknown[] = [];
    const renderer = new A2uiDomRenderer(target, action => { actions.push(action); });
    renderer.render(buildHintCoachSurface({
      surfaceId: "tako-hint-coach",
      title: "Order",
      body: "Follow the sequence.",
      focusClueId: "clue-7",
    }), "tako-hint-coach");

    (target.querySelectorAll("button")[1] as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(actions, [{ name: "focus_clue", context: { clueId: "clue-7" } }]);
    renderer.dispose();
  });

  it("rejects unsupported operations, components, actions, and catalog IDs", () => {
    const valid = buildHintCoachSurface({ surfaceId: "tako-hint-coach", title: "Order", body: "Follow the sequence." });
    assert.equal(validateA2uiMessages(valid, "tako-hint-coach").ok, true);

    const cases: ((messages: TestMessage[]) => void)[] = [
      messages => { messages[0]!.version = "0.9"; },
      messages => { messages[0]!.createSurface.catalogId = "https://evil.example/catalog.json"; },
      messages => { messages[0]!.createSurface.components[0]!.component = "Image"; },
      messages => {
        const dismiss = messages[0]!.createSurface.components.find(component => component.id === "dismiss");
        if (dismiss?.action) dismiss.action.event.name = "delete_board";
      },
      messages => { messages[0]!.createSurface.components.push({ id: "orphan", component: "Text", text: "orphan" }); },
      messages => { messages[0]!.updateComponents = { surfaceId: "tako-hint-coach", components: [] }; },
    ];

    for (const mutate of cases) {
      const messages = structuredClone(valid) as unknown as TestMessage[];
      mutate(messages);
      assert.equal(validateA2uiMessages(messages, "tako-hint-coach").ok, false);
    }

    const invalidFocus = buildHintCoachSurface({ surfaceId: "tako-hint-coach", title: "Order", body: "Follow the sequence.", focusClueId: "clue-7" }) as unknown as TestMessage[];
    const review = invalidFocus[0]!.createSurface.components.find(component => component.id === "review_clue");
    if (review?.action) review.action.event.context.unexpected = true;
    assert.equal(validateA2uiMessages(invalidFocus, "tako-hint-coach").ok, false);
  });

  it("rejects deeply nested untrusted component properties before traversing them recursively", () => {
    const messages = buildHintCoachSurface({ surfaceId: "tako-hint-coach", title: "Order", body: "Follow the sequence." }) as unknown as TestMessage[];
    let nested: unknown = "leaf";
    for (let index = 0; index < 128; index += 1) nested = { child: nested };
    messages[0]!.createSurface.components[0]!.unexpected = nested;

    assert.equal(validateA2uiMessages(messages, "tako-hint-coach").ok, false);
  });

  it("keeps the last good DOM when a later surface is invalid", () => {
    const document = parseHTML("<html><body><main id='target'></main></body></html>").document;
    const target = document.querySelector("#target") as HTMLElement;
    const renderer = new A2uiDomRenderer(target, () => {});
    renderer.render(buildStrategySurface({ surfaceId: "tako-strategy-0", strategy: "direct_match" }), "tako-strategy-0");
    const before = target.textContent;
    const invalid = buildStrategySurface({ surfaceId: "tako-strategy-0", strategy: "direct_match" }) as unknown as TestMessage[];
    invalid[0]!.createSurface.components[1]!.component = "Image";

    assert.throws(() => renderer.render(invalid, "tako-strategy-0"), /A2UI/i);
    assert.equal(target.textContent, before);
    renderer.dispose();
  });
});
