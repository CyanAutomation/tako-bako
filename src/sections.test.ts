import { describe, expect, it } from "vitest";
import { renderBoardToolbar, renderCluePanel, renderGridWorkspace, renderPuzzleHeader, renderPuzzleSettings } from "./sections";

describe("puzzle UI sections", () => {
  it("composes the puzzle heading and board toolbar from shared primitives", () => {
    expect(renderPuzzleHeader({ title: "Tournament Order", difficulty: "Level 3: Moderate", message: "Ready" })).toContain('<h1>Tournament Order</h1>');
    const toolbar = renderBoardToolbar({ marked: 2, total: 16, undoDisabled: false, redoDisabled: true, checkDisabled: true });
    expect(toolbar).toContain('2 / 16 possibilities noted');
    expect(toolbar).toContain('id="undo"');
    expect(toolbar).toContain('id="check-solution"');
  });

  it("composes workspace, clues, and settings without page-level markup", () => {
    expect(renderGridWorkspace({ categories: [{ id: "weight", label: "Weight" }], activeGridId: "weight", grids: "<section>Grid</section>" })).toContain('aria-label="Logic grids"');
    expect(renderCluePanel({ clues: [{ id: "one", text: "Aki was associated with Lions." }], activeCategory: { id: "club", label: "Club", values: ["Lions"] }, cluesOpen: true, usedClueIds: new Set(["one"]) })).toContain('Mark clue 1 as unused');
    expect(renderPuzzleSettings({ seed: "dojo-day", assist: true, settingsOpen: true })).toContain('id="assist-toggle" type="checkbox" checked');
  });
});
