import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderBoardToolbar, renderCluePanel, renderCurriculum, renderGridWorkspace, renderPuzzleHeader } from "./sections";

describe("puzzle UI sections", () => {
  it("announces puzzle status and displays its difficulty in the header", () => {
    const header = renderPuzzleHeader({ title: "Tournament Order", difficulty: "Level 3: Moderate", message: "Ready" });
    assert.ok((header).includes('<h1>Tournament Order</h1>'));
    assert.ok((header).includes('role="status">Ready</p>'));
    assert.ok((header).includes("Level 3: Moderate"));
  });

  it("labels the board actions and exposes their interaction roles", () => {
    const toolbar = renderBoardToolbar({ matches: 2, total: 4, undoDisabled: false, checkDisabled: true, hintDisabled: false, smartMarking: true });
    assert.ok((toolbar).includes('2 of 4 matches found'));
    assert.ok((toolbar).includes('id="undo"'));
    assert.ok((toolbar).includes('id="check-solution"'));
    assert.ok((toolbar).includes('Choose one match in each row and column, then check your solution.'));
    assert.ok((toolbar).includes('>Check my solution</span>'));
    assert.ok(!(toolbar).includes('id="redo"'));
    assert.ok((toolbar).includes('id="smart-marking-toggle"'));
    assert.ok((toolbar).includes('id="hint"'));
    assert.ok((toolbar).includes('aria-label="Smart marking: on. An efficiency tool'));
    assert.ok((toolbar).includes('class="board-actions"'));
    assert.ok((toolbar).includes('aria-label="Board actions"'));
    assert.ok((toolbar).includes('data-action-role="utility"'));
    assert.ok((toolbar).includes('data-action-role="efficiency"'));
    assert.ok((toolbar).includes('data-action-role="primary"'));
    assert.ok((toolbar).includes('class="readiness-meter"'));
    assert.ok((toolbar).includes('aria-label="2 of 4 matches found"'));
  });

  it("labels the grid workspace for assistive technology", () => {
    const workspace = renderGridWorkspace({ categories: [{ id: "weight", label: "Weight" }], activeGridId: "weight", grids: "<section>Grid</section>" });

    assert.ok((workspace).includes('aria-label="Logic grids"'));
    assert.ok((workspace).includes('class="legend legend--quiet"'));
  });

  it("offers an action to mark a used clue as unused", () => {
    const markup = renderCluePanel({ clues: [{ id: "one", text: "Aki was associated with Lions." }], activeCategory: { id: "club", label: "Club", values: ["Lions"] }, cluesOpen: true, usedClueIds: new Set(["one"]), clueFilter: "used" });

    assert.ok((markup).includes('aria-label="Mark clue 1 as unused"'));
  });

  it("offers focused clue views without changing the original clue numbering", () => {
    const clues = [{ id: "one", text: "Aki was associated with Lions." }, { id: "two", text: "Hana was associated with Wolves." }];
    const markup = renderCluePanel({ clues, activeCategory: { id: "club", label: "Club", values: ["Lions", "Wolves"] }, cluesOpen: true, usedClueIds: new Set(["two"]), clueFilter: "remaining" });

    assert.ok((markup).includes('data-clue-filter="remaining"'));
    assert.ok((markup).includes('>To review</button>'));
    assert.ok((markup).includes('Mark clue 1 as used'));
    assert.ok(!(markup).includes('Mark clue 2 as unused'));
    assert.ok((markup).includes('class="clue-item clue-item--related"'));
  });

  it("renders the Puzzle Challenge path with stateful tiles and compact tier information", () => {
    const markup = renderCurriculum({ completed: new Set(["beginner-1"]), currentCourseId: "beginner-2" });
    assert.ok((markup).includes('Your Puzzle Challenge'));
    assert.ok((markup).includes('data-course="beginner-1"'));
    assert.ok((markup).includes('data-course="beginner-2"'));
    assert.match(markup, /course--locked[\s\S]*disabled[\s\S]*data-course="beginner-3"/);
    assert.ok((markup).includes('aria-label="Beginner Level 2, current"'));
    assert.ok((markup).includes('class="course course--complete"'));
    assert.ok((markup).includes('class="course course--current"'));
    assert.ok((markup).includes('class="course-state"'));
    assert.ok((markup).includes('Complete'));
    assert.ok((markup).includes('class="info-disclosure"'));
    assert.ok((markup).includes('More information about Beginner'));
    assert.ok((markup).includes('A compact 4×4 introduction with no-guess beginner puzzles.'));
    assert.match(markup, /course--current[\s\S]*disabled/);
  });

  it("makes the active clue context explicit with a reusable category chip", () => {
    const markup = renderCluePanel({ clues: [{ id: "one", text: "Aki was associated with Lions." }], activeCategory: { id: "club", label: "Club", values: ["Lions"] }, cluesOpen: true, usedClueIds: new Set() });

    assert.ok((markup).includes('class="category-chip">Club</span>'));
  });
});
