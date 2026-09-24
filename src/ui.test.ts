import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { nextGridCellKey, nextTabId, renderButton, renderDialog, renderDisclosure, renderGridCard, renderGridCell, renderInfoDisclosure, renderLevelCard, renderSegmentedControl, renderSelect, renderTabs } from "./ui";

describe("shared UI primitives", () => {
  const tabs = [
    { id: "club", label: "Club" },
    { id: "weight", label: "Weight" },
    { id: "tatami", label: "Tatami" },
  ];

  it("renders a semantic tablist with one keyboard-focusable active tab", () => {
    const markup = renderTabs(tabs, "weight");

    assert.ok((markup).includes('role="tablist"'));
    assert.ok((markup).includes('id="grid-select" aria-label="Choose working grid"'));
    assert.ok((markup).includes('<option value="weight" selected>Weight</option>'));
    assert.ok((markup).includes('id="grid-tab-weight" aria-selected="true" aria-controls="grid-weight" tabindex="0"'));
    assert.ok((markup).includes('id="grid-tab-club" aria-selected="false" aria-controls="grid-club" tabindex="-1"'));
  });

  it("uses tabs on wider layouts and one labelled selector on compact layouts", () => {
    const markup = renderTabs(tabs, "weight");

    assert.ok((markup).includes('class="grid-picker"'));
    assert.ok((markup).includes('class="grid-navigation"'));
    assert.ok((markup).includes('class="grid-tabs"'));
    assert.ok(!(markup).includes('id="previous-grid"'));
    assert.ok(!(markup).includes('id="next-grid"'));
    assert.ok(!(markup).includes(" hidden"));
  });

  it("moves through tabs with the standard arrow, Home, and End keys", () => {
    assert.strictEqual(nextTabId(tabs, "weight", "ArrowRight"), "tatami");
    assert.strictEqual(nextTabId(tabs, "weight", "ArrowLeft"), "club");
    assert.strictEqual(nextTabId(tabs, "club", "ArrowLeft"), "tatami");
    assert.strictEqual(nextTabId(tabs, "weight", "Home"), "club");
    assert.strictEqual(nextTabId(tabs, "weight", "End"), "tatami");
  });

  it("moves a grid cell with arrow keys while staying within its grid", () => {
    const options = { categoryId: "club", rows: ["Aki", "Ben"], columns: ["Lions", "Wolves"] };

    assert.strictEqual(nextGridCellKey({ ...options, key: "club|Aki|Lions", keyName: "ArrowRight" }), "club|Aki|Wolves");
    assert.strictEqual(nextGridCellKey({ ...options, key: "club|Aki|Lions", keyName: "ArrowUp" }), "club|Aki|Lions");
    assert.strictEqual(nextGridCellKey({ ...options, key: "club|Ben|Wolves", keyName: "ArrowDown" }), "club|Ben|Wolves");
    assert.strictEqual(nextGridCellKey({ ...options, key: "club|Ben|Lions", keyName: "ArrowUp" }), "club|Aki|Lions");
    assert.strictEqual(nextGridCellKey({ ...options, key: "club|Aki|Lions", keyName: "Enter" }), undefined);
  });

  it("does not navigate grids without rows or columns", () => {
    assert.strictEqual(nextGridCellKey({ categoryId: "club", rows: [], columns: ["Lions"], key: "club|Aki|Lions", keyName: "ArrowDown" }), undefined);
    assert.strictEqual(nextGridCellKey({ categoryId: "club", rows: ["Aki"], columns: [], key: "club|Aki|Lions", keyName: "ArrowRight" }), undefined);
  });

  it("uses a shared button primitive for regular and custom SVG icon actions", () => {
    assert.ok((renderButton({ id: "new", label: "New puzzle" })).includes('class="button button--secondary"'));
    const iconButton = renderButton({ id: "undo", label: "Undo", icon: "undo" });
    assert.ok((iconButton).includes('class="button button--with-icon button--secondary"'));
    assert.ok((iconButton).includes('<svg'));
    assert.ok((iconButton).includes('<span>Undo</span>'));
    assert.ok((iconButton).includes('aria-hidden="true"'));
    assert.ok(!(iconButton).includes("↶"));
    const labelledIconButton = renderButton({ id: "smart-marking", label: "Smart marking: on", icon: "fast-forward", variant: "efficiency", pressed: true });
    assert.ok((labelledIconButton).includes('class="button button--with-icon button--efficiency"'));
    assert.ok((labelledIconButton).includes('<span>Smart marking: on</span>'));
  });

  it("renders filter choices through one labelled segmented-control primitive", () => {
    const markup = renderSegmentedControl({ label: "Filter clues", items: [
      { id: "all", label: "All", selected: true, data: { clueFilter: "all" } },
      { id: "used", label: "Used", selected: false, data: { clueFilter: "used" } },
    ] });
    assert.ok((markup).includes('class="segmented-control" role="group" aria-label="Filter clues"'));
    assert.ok((markup).includes('data-clue-filter="all"'));
    assert.ok((markup).includes('aria-pressed="true"'));
  });

  it("renders each Puzzle Challenge level through one stateful card primitive", () => {
    const markup = renderLevelCard({ courseId: "beginner-2", label: "Beginner Level 2", level: 2, state: "locked" });

    assert.ok((markup).includes('class="course course--locked"'));
    assert.ok((markup).includes('data-course="beginner-2"'));
    assert.ok((markup).includes('aria-label="Beginner Level 2, locked"'));
    assert.ok((markup).includes('disabled'));
    assert.ok((markup).includes('>Locked</span>'));
  });

  it("makes the current Puzzle Challenge level informational rather than restartable", () => {
    const markup = renderLevelCard({ courseId: "beginner-2", label: "Beginner Level 2", level: 2, state: "current" });

    assert.ok((markup).includes('aria-label="Beginner Level 2, current"'));
    assert.ok((markup).includes("disabled"));
    assert.ok((markup).includes(">Current</span>"));
  });

  it("exposes toggle-button state and safely encoded grid identifiers", () => {
    const markup = renderButton({ id: "lock", label: "Unlock grid", icon: "lock", pressed: false, data: { gridLock: 'weight & "open"' } });

    assert.ok((markup).includes('aria-pressed="false"'));
    assert.ok((markup).includes('data-grid-lock="weight &amp; &quot;open&quot;"'));
  });

  it("renders a reusable accessible dialog with labelled actions", () => {
    const markup = renderDialog({
      id: "reset-grid",
      eyebrow: "Reset grid",
      title: "Clear Weight?",
      description: "This clears every mark.",
      actions: '<button id="cancel">Cancel</button>',
    });

    assert.ok((markup).includes('<dialog id="reset-grid" class="confirm-modal" open'));
    assert.ok((markup).includes('aria-modal="true"'));
    assert.ok((markup).includes('aria-labelledby="reset-grid-title"'));
    assert.ok((markup).includes('aria-describedby="reset-grid-description"'));
    const picker = renderDialog({ id: "picker", title: "Pick", description: "Choose one.", content: "<section>choices</section>", actions: "<button>Close</button>", className: "course-dialog" });
    assert.ok((picker).includes('class="confirm-modal course-dialog"'));
    assert.ok((picker).includes('<div class="dialog-content"><section>choices</section></div>'));
  });

  it("renders a disclosure with its summary, content, and requested initial state", () => {
    const collapsed = renderDisclosure({ className: "challenge-options", summary: "Choose challenge", content: "Choices" });
    const expanded = renderDisclosure({ className: "challenge-options", summary: "Choose challenge", content: "Choices", open: true });

    assert.match(collapsed, /^<details[ >]/);
    assert.ok((collapsed).includes("<summary>Choose challenge</summary>"));
    assert.ok((collapsed).includes("Choices"));
    assert.doesNotMatch(collapsed, /^<details[^>]*\sopen(?:\s|>)/);
    assert.match(expanded, /^<details[^>]*\sopen(?:\s|>)/);
  });

  it("renders a compact, accessible information disclosure", () => {
    const markup = renderInfoDisclosure({ id: "beginner-info", label: "More information about Beginner", content: "A compact introduction." });

    assert.ok((markup).includes('class="info-disclosure"'));
    assert.ok((markup).includes('<summary aria-label="More information about Beginner" title="More information about Beginner">i</summary>'));
    assert.ok((markup).includes('<div class="info-disclosure__content">A compact introduction.</div>'));
  });

  it("uses a shared labelled select control for compact settings", () => {
    const markup = renderSelect({ id: "difficulty", label: "Difficulty", ariaLabel: "Puzzle difficulty", selectedId: "3", options: [
      { id: "", label: "Any" }, { id: "3", label: "Level 3" },
    ] });

    assert.ok((markup).includes('<label class="select-control">Difficulty'));
    assert.ok((markup).includes('id="difficulty" aria-label="Puzzle difficulty"'));
    assert.ok((markup).includes('<option value="3" selected>Level 3</option>'));
  });

  it("uses a shared grid-card primitive with an explicit active state", () => {
    const markup = renderGridCard({ id: "weight", label: "Judoka × Weight", active: true, locked: false, controls: "<button>Lock</button>", content: "<table></table>" });

    assert.ok((markup).includes('id="grid-weight"'));
    assert.ok((markup).includes('class="grid-card is-active is-unlocked"'));
    assert.ok((markup).includes('class="grid-card-controls"'));
    assert.ok((markup).includes('is-unlocked'));
    assert.ok(!(markup).includes("hidden"));
  });

  it("gives grid cells an accessible name, a roving tab stop, and disabled semantics", () => {
    const activeCell = renderGridCell({ key: "club|Aki|Lions", row: "Aki", column: "Lions", mark: "yes", tabIndex: 0 });
    assert.ok((activeCell).includes('aria-label="Aki, Lions: yes. Select to change."'));
    assert.ok((activeCell).includes('tabindex="0"'));

    const disabledCell = renderGridCell({ key: "club|Aki|Lions", row: "Aki", column: "Lions", mark: "unknown", disabled: true });
    assert.ok((disabledCell).includes('aria-label="Aki, Lions: unknown. Grid locked."'));
    assert.ok((disabledCell).includes(" disabled"));
    assert.ok(!(disabledCell).includes("tabindex="));
  });
});
