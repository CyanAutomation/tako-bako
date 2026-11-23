import type { ClueStrategy } from "../clue-strategy-catalog";
import type { ParsedHintResponse } from "../hint-response";
import type { Puzzle } from "../puzzle";
import { buildHintCoachSurface, buildStrategySurface, hintCoachContent } from "./messages";
import { A2uiDomRenderer, type A2uiHostAction } from "./renderer";

export interface A2uiViewState {
  puzzle: Puzzle | null;
  clueStrategies: Record<string, ClueStrategy>;
  hintCoach?: ParsedHintResponse;
}

/** Owns the short-lived A2UI renderers created after the app replaces its view DOM. */
export class A2uiSurfaceMount {
  private readonly renderers: A2uiDomRenderer[] = [];

  constructor(private readonly onAction: (action: A2uiHostAction) => void | Promise<void>) {}

  mount(root: ParentNode, view: A2uiViewState): void {
    this.dispose();
    if (!view.puzzle || typeof root.querySelectorAll !== "function") return;

    for (const target of root.querySelectorAll<HTMLElement>("[data-a2ui-strategy]")) {
      this.mountStrategy(target, view);
    }
    if (view.hintCoach) this.mountHintCoach(root, view, view.hintCoach);
  }

  dispose(): void {
    for (const renderer of this.renderers.splice(0)) renderer.dispose();
  }

  private mountStrategy(target: HTMLElement, view: A2uiViewState): void {
    const clueIndex = Number(target.dataset.clueIndex);
    const clue = Number.isInteger(clueIndex) ? view.puzzle?.clues[clueIndex] : undefined;
    if (!clue) return;
    const strategy = clue.strategy ?? view.clueStrategies[clue.id];
    if (!strategy) return;

    const renderer = new A2uiDomRenderer(target, this.onAction);
    try {
      renderer.render(buildStrategySurface({
        surfaceId: `tako-strategy-${clueIndex}`,
        strategy,
      }), `tako-strategy-${clueIndex}`);
      target.hidden = false;
      const fallback = target.closest(".clue-strategy-disclosure")?.querySelector<HTMLElement>(".clue-strategy-fallback");
      if (fallback) fallback.hidden = true;
      this.renderers.push(renderer);
    } catch {
      renderer.dispose();
    }
  }

  private mountHintCoach(root: ParentNode, view: A2uiViewState, hint: ParsedHintResponse): void {
    const target = root.querySelector<HTMLElement>("[data-a2ui-hint-coach]");
    if (!target) return;
    const clue = hint.kind === "clue"
      ? view.puzzle?.clues.find(candidate => candidate.id === hint.clue.id || candidate.text === hint.clue.text)
      : undefined;
    const strategy = clue?.strategy ?? (clue ? view.clueStrategies[clue.id] : undefined);
    const renderer = new A2uiDomRenderer(target, this.onAction);
    try {
      renderer.render(buildHintCoachSurface({
        surfaceId: "tako-hint-coach",
        ...hintCoachContent(hint, strategy),
      }), "tako-hint-coach");
      target.hidden = false;
      const fallback = target.parentElement?.querySelector<HTMLElement>(".hint-coach-fallback");
      if (fallback) fallback.hidden = true;
      this.renderers.push(renderer);
    } catch {
      renderer.dispose();
    }
  }
}
