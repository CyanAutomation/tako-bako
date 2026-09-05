import { describe, expect, it } from "vitest";
import { renderBoardToolbar, renderCluePanel, renderCurriculum, renderGridWorkspace, renderPuzzleHeader } from "./sections";

describe("puzzle UI sections", () => {
  it("announces puzzle status and displays its difficulty in the header", () => {
    const header = renderPuzzleHeader({ title: "Tournament Order", difficulty: "Level 3: Moderate", message: "Ready" });
    expect(header).toContain('<h1>Tournament Order</h1>');
    expect(header).toContain('role="status">Ready</p>');
    expect(header).toContain("Level 3: Moderate");
  });

  it("labels the board actions and exposes their interaction roles", () => {
    const toolbar = renderBoardToolbar({ matches: 2, total: 4, undoDisabled: false, checkDisabled: true, assist: true });
    expect(toolbar).toContain('2 of 4 matches found');
    expect(toolbar).toContain('id="undo"');
    expect(toolbar).toContain('id="check-solution"');
    expect(toolbar).toContain('Find one match in each row and column. Then check your deduction.');
    expect(toolbar).not.toContain('id="redo"');
    expect(toolbar).toContain('id="assist-toggle"');
    expect(toolbar).toContain('aria-label="Smart marking: on"');
    expect(toolbar).toContain('class="board-actions"');
    expect(toolbar).toContain('aria-label="Board actions"');
    expect(toolbar).toContain('data-action-role="utility"');
    expect(toolbar).toContain('data-action-role="toggle"');
    expect(toolbar).toContain('data-action-role="primary"');
    expect(toolbar).toContain('class="readiness-meter"');
    expect(toolbar).toContain('aria-label="2 of 4 matches found"');
  });

  it("labels the grid workspace for assistive technology", () => {
    const workspace = renderGridWorkspace({ categories: [{ id: "weight", label: "Weight" }], activeGridId: "weight", grids: "<section>Grid</section>" });
    expect(workspace).toContain('aria-label="Logic grids"');
    expect(workspace).toContain('class="legend legend--quiet"');
  });

  it("labels the clue panel and reports its clue count", () => {
    const panel = renderCluePanel({ clues: [{ id: "one", text: "Aki was associated with Lions." }], activeCategory: { id: "club", label: "Club", values: ["Lions"] }, cluesOpen: true, usedClueIds: new Set(["one"]), clueFilter: "used" });
    expect(panel).toContain("<aside");
    expect(panel).toContain('aria-labelledby="clues-title"');
    expect(panel).toContain("1 clues");
    expect(panel).toContain('Mark clue 1 as unused');
  });

  it("offers focused clue views without changing the original clue numbering", () => {
    const clues = [{ id: "one", text: "Aki was associated with Lions." }, { id: "two", text: "Hana was associated with Wolves." }];
    const markup = renderCluePanel({ clues, activeCategory: { id: "club", label: "Club", values: ["Lions", "Wolves"] }, cluesOpen: true, usedClueIds: new Set(["two"]), clueFilter: "remaining" });

    expect(markup).toContain('data-clue-filter="remaining"');
    expect(markup).toContain('>Unmarked</button>');
    expect(markup).toContain('Mark clue 1 as used');
    expect(markup).not.toContain('Mark clue 2 as unused');
    expect(markup).toContain('class="clue-item clue-item--related"');
  });

  it("renders the Puzzle Challenge path with stateful tiles and compact tier information", () => {
    const markup = renderCurriculum({ completed: new Set(["beginner-1"]), currentCourseId: "beginner-2" });
    expect(markup).toContain('Your Puzzle Challenge');
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
    expect(markup).toMatch(/course--current[\s\S]*disabled/);
  });

  it("makes the active clue context explicit with a reusable category chip", () => {
    const markup = renderCluePanel({ clues: [{ id: "one", text: "Aki was associated with Lions." }], activeCategory: { id: "club", label: "Club", values: ["Lions"] }, cluesOpen: true, usedClueIds: new Set() });

    expect(markup).toContain('class="category-chip">Club</span>');
  });
});
