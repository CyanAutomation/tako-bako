import { describe, expect, it } from "vitest";
import { renderBoardToolbar, renderCluePanel, renderCurriculum, renderGridWorkspace, renderPuzzleHeader, renderPuzzleSettings } from "./sections";

describe("puzzle UI sections", () => {
  it("composes the puzzle heading and board toolbar from shared primitives", () => {
    expect(renderPuzzleHeader({ title: "Tournament Order", difficulty: "Level 3: Moderate", message: "Ready" })).toContain('<h1>Tournament Order</h1>');
    const toolbar = renderBoardToolbar({ marked: 2, total: 16, undoDisabled: false, checkDisabled: true });
    expect(toolbar).toContain('2 / 16 possibilities noted');
    expect(toolbar).toContain('id="undo"');
    expect(toolbar).toContain('id="check-solution"');
    expect(toolbar).toContain('Finish one ✓ in every row and column to check.');
    expect(toolbar).not.toContain('id="redo"');
    expect(toolbar).not.toContain('assist-toggle');
  });

  it("composes workspace, clues, and settings without page-level markup", () => {
    expect(renderGridWorkspace({ categories: [{ id: "weight", label: "Weight" }], activeGridId: "weight", grids: "<section>Grid</section>" })).toContain('aria-label="Logic grids"');
    expect(renderCluePanel({ clues: [{ id: "one", text: "Aki was associated with Lions." }], activeCategory: { id: "club", label: "Club", values: ["Lions"] }, cluesOpen: true, usedClueIds: new Set(["one"]) })).toContain('Mark clue 1 as unused');
    const settings = renderPuzzleSettings({ seed: "dojo-day", settingsOpen: true, assist: true });
    expect(settings).toContain('id="assist-toggle"');
    expect(settings).toContain('aria-label="Auto-eliminate is on"');
    expect(settings).toContain('aria-pressed="true"');
    expect(settings).toContain('class="disclosure puzzle-settings" open');
  });

  it("renders the Puzzle Challenge path with completed, current, and locked course states", () => {
    const markup = renderCurriculum({ completed: new Set(["beginner-1"]), currentCourseId: "beginner-2" });
    expect(markup).toContain('Puzzle Challenge');
    expect(markup).toContain('data-course="beginner-1"');
    expect(markup).toContain('data-course="beginner-2"');
    expect(markup).toMatch(/course--locked[\s\S]*disabled[\s\S]*data-course="beginner-3"/);
    expect(markup).toContain('aria-label="Beginner Level 2"');
  });
});
