import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { renderBoardToolbar } from "./sections/board-toolbar";
import { renderCluePanel } from "./sections/clue-panel";
import { renderCurriculum } from "./sections/curriculum";
import { renderGridWorkspace } from "./sections/grid-workspace";
import { renderPuzzleHeader } from "./sections/puzzle-header";

describe("puzzle UI sections", () => {
  it("announces puzzle status and displays its difficulty in the header", () => {
    const header = renderPuzzleHeader({ title: "Tournament Order", difficulty: "Level 3: Moderate", message: "Ready" });
    assert.ok((header).includes('<h1>Tournament Order</h1>'));
    assert.ok((header).includes('role="status">Ready</p>'));
    assert.ok((header).includes("Level 3: Moderate"));
  });

  it("[TB-ACCESS-05] gives board actions accessible names and groups them under a labelled control", () => {
    const toolbar = renderBoardToolbar({ matches: 2, total: 4, undoDisabled: false, resetDisabled: false, checkDisabled: true, hintDisabled: false, smartMarking: true });

    assert.match(toolbar, /<div[^>]*role="group"[^>]*aria-label="Board actions">/);
    assert.match(toolbar, /<button\b(?=[^>]*aria-label="Undo last mark")[^>]*>[\s\S]*?<span>Undo<\/span><\/button>/);
    assert.match(toolbar, /<button\b(?=[^>]*aria-label="Clear all board marks")[^>]*>[\s\S]*?<span>Clear board<\/span><\/button>/);
    assert.match(toolbar, /<button\b(?=[^>]*aria-label="Get a hint")[^>]*>[\s\S]*?<span>Hint<\/span><\/button>/);
    assert.match(toolbar, /<button\b(?=[^>]*aria-label="Check my solution")(?=[^>]*disabled)[^>]*>[\s\S]*?<span>Check my solution<\/span><\/button>/);
    assert.match(toolbar, /<button\b(?=[^>]*aria-label="Auto-mark is on\.[^"]*")(?=[^>]*aria-pressed="true")[^>]*>[\s\S]*?<span>Auto-mark on<\/span><\/button>/);
    assert.match(toolbar, /class="board-actions"[^>]*>[\s\S]*?<span>Undo<\/span>[\s\S]*?<span>Clear board<\/span>[\s\S]*?<span>Hint<\/span>[\s\S]*?<span>Auto-mark on<\/span>[\s\S]*?<span>Check my solution<\/span>/);
  });

  it("[TB-ACCESS-05] announces match progress and whether the solution is ready to check", () => {
    const incomplete = renderBoardToolbar({ matches: 2, total: 4, undoDisabled: false, resetDisabled: false, checkDisabled: true, hintDisabled: false, smartMarking: false });
    assert.match(incomplete, /2 of 4 matches found/);
    assert.match(incomplete, /Choose one match in each row and column, then check your solution\./);
    assert.match(incomplete, /<progress\b[^>]*aria-label="2 of 4 matches found"[^>]*max="4"[^>]*value="2"><\/progress>/);

    const ready = renderBoardToolbar({ matches: 4, total: 4, undoDisabled: false, resetDisabled: false, checkDisabled: false, hintDisabled: false, smartMarking: false });
    assert.match(ready, /Your solution is ready to check\./);
    assert.match(ready, /<button\b(?=[^>]*aria-label="Check my solution")(?!(?:[^>]*\sdisabled))[^>]*>/);
  });

  it("labels the grid workspace for assistive technology", () => {
    const workspace = renderGridWorkspace({ categories: [{ id: "weight", label: "Weight" }], activeGridId: "weight", grids: "<section>Grid</section>" });

    assert.ok((workspace).includes('aria-label="Logic grids"'));
    assert.ok((workspace).includes('class="legend legend--quiet"'));
  });

  it("offers an action to mark a used clue as unused", () => {
    const markup = renderCluePanel({ clues: [{ id: "one", text: "Aki was associated with Lions." }], activeCategory: { id: "club", label: "Club", values: ["Lions"] }, cluesOpen: true, usedClueIds: new Set(["one"]), clueFilter: "used" });

    assert.ok((markup).includes('aria-label="Mark clue 1 as not reviewed"'));
  });

  it("labels a clue with its reasoning strategy when one is available", () => {
    const markup = renderCluePanel({ clues: [{ id: "one", text: "Aki was associated with Lions.", strategy: "direct_match" }], activeCategory: { id: "club", label: "Club", values: ["Lions"] }, cluesOpen: true, usedClueIds: new Set() });

    assert.ok((markup).includes('class="clue-strategy" title="Reasoning strategy">Direct match</span>'));
  });

  it("escapes clue and category text before rendering it as markup", () => {
    const markup = renderCluePanel({ clues: [{ id: "one", text: "<script>unsafe()</script>" }], activeCategory: { id: "club", label: "<Club & Team>", values: ["Lions"] }, cluesOpen: false, usedClueIds: new Set() });

    assert.ok(markup.includes("&lt;script&gt;unsafe()&lt;/script&gt;"));
    assert.ok(markup.includes("&lt;Club &amp; Team&gt;"));
    assert.doesNotMatch(markup, /<script>/);
  });

  it("[TB-ACCESS-03] offers focused clue views without changing the original clue numbering", () => {
    const clues = [{ id: "one", text: "Aki was associated with Lions." }, { id: "two", text: "Hana was associated with Wolves." }];
    const markup = renderCluePanel({ clues, activeCategory: { id: "club", label: "Club", values: ["Lions", "Wolves"] }, cluesOpen: true, usedClueIds: new Set(["two"]), clueFilter: "remaining" });

    assert.ok((markup).includes('data-clue-filter="remaining"'));
    assert.ok((markup).includes('>To review</button>'));
    assert.ok((markup).includes('>Reviewed</button>'));
    assert.ok((markup).includes('Mark clue 1 as reviewed'));
    assert.ok(!(markup).includes('Mark clue 2 as not reviewed'));
    assert.ok((markup).includes('class="clue-item clue-item--related"'));
  });

  it("shows completed, current, and locked course states in the Puzzle Challenge path", () => {
    const markup = renderCurriculum({ completed: new Set(["beginner-1"]), currentCourseId: "beginner-2" });

    assert.ok((markup).includes('Your Puzzle Challenge'));
    assert.match(markup, /<button\b(?=[^>]*aria-label="Beginner Level 1, complete")(?=[^>]*data-course="beginner-1")(?![^>]*disabled)[^>]*>/);
    assert.match(markup, /<button\b(?=[^>]*aria-label="Beginner Level 2, current")(?=[^>]*disabled)[^>]*>/);
    assert.match(markup, /<button\b(?=[^>]*aria-label="Beginner Level 3, locked")(?=[^>]*disabled)[^>]*>/);
    assert.match(markup, /<summary aria-label="More information about Beginner"/);
    assert.ok((markup).includes('A compact 4×4 introduction with no-guess beginner puzzles.'));
  });

  it("[TB-ACCESS-06] identifies the active grid and explains which clues are highlighted", () => {
    const markup = renderCluePanel({ clues: [{ id: "one", text: "Aki was associated with Lions." }], activeCategory: { id: "club", label: "Club", values: ["Lions"] }, cluesOpen: true, usedClueIds: new Set() });

    assert.match(markup, /Club<\/span> clues that mention this grid are highlighted\./);
  });
});
