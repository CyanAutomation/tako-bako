import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseHTML } from "linkedom";
import type { ClueStrategy } from "../clue-strategy-catalog";
import type { Puzzle } from "../puzzle";
import { A2uiSurfaceMount } from "./mount";

function puzzle() {
  return {
    id: "a2ui-test-puzzle",
    clues: [{ id: "clue-1", text: "Aki lives next to the judoka from the Lions club." }],
  } as unknown as Puzzle;
}

describe("A2UI view mounting", () => {
  it("mounts strategy and hint surfaces and routes dismiss actions to the host", async () => {
    const document = parseHTML(`<html><body><main>
      <details class="clue-strategy-disclosure"><span class="clue-strategy-fallback">Direct match</span><div data-a2ui-strategy data-clue-index="0" hidden></div></details>
      <section class="hint-coach"><div class="hint-coach-fallback">Fallback coach</div><div data-a2ui-hint-coach hidden></div></section>
    </main></body></html>`).document;
    const root = document.querySelector("main") as HTMLElement;
    const actions: unknown[] = [];
    const mount = new A2uiSurfaceMount(action => { actions.push(action); });

    mount.mount(root, {
      puzzle: puzzle(),
      clueStrategies: { "clue-1": "adjacency" },
      hintCoach: { kind: "clue", clue: { id: "clue-1", text: "Aki lives next to the judoka from the Lions club." } },
    });

    const strategyTarget = root.querySelector("[data-a2ui-strategy]") as HTMLElement;
    const strategyFallback = root.querySelector(".clue-strategy-fallback") as HTMLElement;
    const coachTarget = root.querySelector("[data-a2ui-hint-coach]") as HTMLElement;
    const coachFallback = root.querySelector(".hint-coach-fallback") as HTMLElement;
    assert.equal(strategyTarget.hidden, false);
    assert.equal(strategyFallback.hidden, true);
    assert.match(strategyTarget.textContent ?? "", /Neighbours/);
    assert.equal(coachTarget.hidden, false);
    assert.equal(coachFallback.hidden, true);
    assert.match(coachTarget.textContent ?? "", /next-to or adjacent/);

    (coachTarget.querySelector("button") as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(actions, [{ name: "dismiss_hint", context: {} }]);

    mount.dispose();
    assert.equal(coachTarget.childElementCount, 0);
  });

  it("leaves accessible fallback content visible when a surface cannot be built", () => {
    const document = parseHTML(`<html><body><main>
      <details class="clue-strategy-disclosure"><span class="clue-strategy-fallback">Fallback strategy</span><div data-a2ui-strategy data-clue-index="0" hidden></div></details>
      <section class="hint-coach"><div class="hint-coach-fallback">Fallback coach</div><div data-a2ui-hint-coach hidden></div></section>
    </main></body></html>`).document;
    const root = document.querySelector("main") as HTMLElement;
    const mount = new A2uiSurfaceMount(() => {});

    mount.mount(root, { puzzle: puzzle(), clueStrategies: { "clue-1": "unknown" as ClueStrategy } });

    assert.equal((root.querySelector("[data-a2ui-strategy]") as HTMLElement).hidden, true);
    assert.equal((root.querySelector(".clue-strategy-fallback") as HTMLElement).hidden, false);
    mount.dispose();
  });

  it("does not mount a strategy surface when the clue index is missing or empty", () => {
    const document = parseHTML(`<html><body><main>
      <details><span class="clue-strategy-fallback">Missing index fallback</span><div data-a2ui-strategy hidden></div></details>
      <details><span class="clue-strategy-fallback">Empty index fallback</span><div data-a2ui-strategy data-clue-index="" hidden></div></details>
    </main></body></html>`).document;
    const root = document.querySelector("main") as HTMLElement;
    const mount = new A2uiSurfaceMount(() => {});

    mount.mount(root, { puzzle: puzzle(), clueStrategies: { "clue-1": "adjacency" } });

    const targets = root.querySelectorAll<HTMLElement>("[data-a2ui-strategy]");
    const fallbacks = root.querySelectorAll<HTMLElement>(".clue-strategy-fallback");
    assert.equal(targets.length, 2);
    for (const target of targets) assert.equal(target.hidden, true);
    for (const fallback of fallbacks) assert.equal(fallback.hidden, false);
    mount.dispose();
  });
});
