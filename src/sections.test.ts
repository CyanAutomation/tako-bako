import { describe, expect, it } from "vitest";
import { renderBoardToolbar, renderCluePanel, renderCurriculum, renderGridWorkspace, renderPuzzleHeader } from "./sections";

describe("puzzle UI sections", () => {
  it("composes the puzzle heading and board toolbar from shared primitives", () => {
    expect(renderPuzzleHeader({ title: "Tournament Order", difficulty: "Level 3: Moderate", message: "Ready" })).toContain('<h1>Tournament Order</h1>');
    const toolbar = renderBoardToolbar({ matches: 2, total: 4, undoDisabled: false, checkDisabled: true, assist: true });
    expect(toolbar).toContain('2 / 4 matches placed');
    expect(toolbar).toContain('id="undo"');
    expect(toolbar).toContain('id="check-solution"');
    expect(toolbar).toContain('Place one match in every row and column to check.');
    expect(toolbar).not.toContain('id="redo"');
    expect(toolbar).toContain('id="assist-toggle"');
    expect(toolbar).toContain('Fill rule-outs: on');
    expect(toolbar).toContain('class="board-state-controls"');
    expect(toolbar).toContain('class="readiness-meter"');
    expect(toolbar).toContain('aria-label="2 of 4 matches placed"');
  });

  it("composes workspace and clues without page-level markup", () => {
    expect(renderGridWorkspace({ categories: [{ id: "weight", label: "Weight" }], activeGridId: "weight", grids: "<section>Grid</section>" })).toContain('aria-label="Logic grids"');
    expect(renderCluePanel({ clues: [{ id: "one", text: "Aki was associated with Lions." }], activeCategory: { id: "club", label: "Club", values: ["Lions"] }, cluesOpen: true, usedClueIds: new Set(["one"]), clueFilter: "used" })).toContain('Mark clue 1 as unused');
  });

  it("offers focused clue views without changing the original clue numbering", () => {
    const clues = [{ id: "one", text: "Aki was associated with Lions." }, { id: "two", text: "Hana was associated with Wolves." }];
    const markup = renderCluePanel({ clues, activeCategory: { id: "club", label: "Club", values: ["Lions", "Wolves"] }, cluesOpen: true, usedClueIds: new Set(["two"]), clueFilter: "remaining" });

    expect(markup).toContain('data-clue-filter="remaining"');
    expect(markup).toContain('Mark clue 1 as used');
    expect(markup).not.toContain('Mark clue 2 as unused');
  });

  it("renders the Puzzle Challenge path with stateful tiles and compact tier information", () => {
    const markup = renderCurriculum({ completed: new Set(["beginner-1"]), currentCourseId: "beginner-2" });
    expect(markup).toContain('Puzzle Challenge');
    expect(markup).toContain('data-course="beginner-1"');
    expect(markup).toContain('data-course="beginner-2"');
    expect(markup).toMatch(/course--locked[\s\S]*disabled[\s\S]*data-course="beginner-3"/);
    expect(markup).toContain('aria-label="Beginner Level 2, current"');
    expect(markup).toContain('class="course course--complete"');
    expect(markup).toContain('class="course course--current"');
    expect(markup).toContain('class="course-state"');
    expect(markup).toContain('Complete');
    expect(markup).toContain('class="info-disclosure"');
    expect(markup).toContain('More information about Beginner');
    expect(markup).toContain('A compact 4×4 introduction to logic-grid deduction.');
  });

  it("makes the active clue context explicit with a reusable category chip", () => {
    const markup = renderCluePanel({ clues: [{ id: "one", text: "Aki was associated with Lions." }], activeCategory: { id: "club", label: "Club", values: ["Lions"] }, cluesOpen: true, usedClueIds: new Set() });

    expect(markup).toContain('class="category-chip">Club</span>');
  });
});
