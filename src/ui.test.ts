import { describe, expect, it } from "vitest";
import { nextGridCellKey, nextTabId, renderButton, renderDialog, renderDisclosure, renderGridCard, renderGridCell, renderInfoDisclosure, renderLevelCard, renderSelect, renderTabs } from "./ui";

describe("shared UI primitives", () => {
  const tabs = [
    { id: "club", label: "Club" },
    { id: "weight", label: "Weight" },
    { id: "tatami", label: "Tatami" },
  ];

  it("renders a semantic tablist with one keyboard-focusable active tab", () => {
    const markup = renderTabs(tabs, "weight");

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('id="grid-select" aria-label="Choose working grid"');
    expect(markup).toContain('<option value="weight" selected>Weight</option>');
    expect(markup).toContain('id="grid-tab-weight" aria-selected="true" aria-controls="grid-weight" tabindex="0"');
    expect(markup).toContain('id="grid-tab-club" aria-selected="false" aria-controls="grid-club" tabindex="-1"');
  });

  it("uses tabs on wider layouts and one labelled selector on compact layouts", () => {
    const markup = renderTabs(tabs, "weight");

    expect(markup).toContain('class="grid-picker"');
    expect(markup).toContain('class="grid-navigation"');
    expect(markup).toContain('class="grid-tabs"');
    expect(markup).not.toContain('id="previous-grid"');
    expect(markup).not.toContain('id="next-grid"');
    expect(markup).not.toContain(" hidden");
  });

  it("moves through tabs with the standard arrow, Home, and End keys", () => {
    expect(nextTabId(tabs, "weight", "ArrowRight")).toBe("tatami");
    expect(nextTabId(tabs, "weight", "ArrowLeft")).toBe("club");
    expect(nextTabId(tabs, "club", "ArrowLeft")).toBe("tatami");
    expect(nextTabId(tabs, "weight", "Home")).toBe("club");
    expect(nextTabId(tabs, "weight", "End")).toBe("tatami");
  });

  it("moves a grid cell with arrow keys while staying within its grid", () => {
    const options = { categoryId: "club", rows: ["Aki", "Ben"], columns: ["Lions", "Wolves"] };

    expect(nextGridCellKey({ ...options, key: "club|Aki|Lions", keyName: "ArrowRight" })).toBe("club|Aki|Wolves");
    expect(nextGridCellKey({ ...options, key: "club|Aki|Lions", keyName: "ArrowUp" })).toBe("club|Aki|Lions");
    expect(nextGridCellKey({ ...options, key: "club|Ben|Wolves", keyName: "ArrowDown" })).toBe("club|Ben|Wolves");
    expect(nextGridCellKey({ ...options, key: "club|Ben|Lions", keyName: "ArrowUp" })).toBe("club|Aki|Lions");
    expect(nextGridCellKey({ ...options, key: "club|Aki|Lions", keyName: "Enter" })).toBeUndefined();
  });

  it("does not navigate grids without rows or columns", () => {
    expect(nextGridCellKey({ categoryId: "club", rows: [], columns: ["Lions"], key: "club|Aki|Lions", keyName: "ArrowDown" })).toBeUndefined();
    expect(nextGridCellKey({ categoryId: "club", rows: ["Aki"], columns: [], key: "club|Aki|Lions", keyName: "ArrowRight" })).toBeUndefined();
  });

  it("uses a shared button primitive that keeps icon-action labels visible by default", () => {
    expect(renderButton({ id: "new", label: "New puzzle" })).toContain('class="button button--secondary"');
    const iconButton = renderButton({ id: "undo", label: "Undo", icon: "undo" });
    expect(iconButton).toContain('class="button button--with-icon button--secondary"');
    expect(iconButton).toContain('<svg');
    expect(iconButton).toContain('<span>Undo</span>');
    expect(iconButton).toContain('aria-hidden="true"');
    expect(iconButton).not.toContain("↶");
    const labelledIconButton = renderButton({ id: "assist", label: "Smart marking: on", icon: "sparkle", pressed: true });
    expect(labelledIconButton).toContain('class="button button--with-icon button--secondary"');
    expect(labelledIconButton).toContain('<span>Smart marking: on</span>');
  });

  it("renders each Puzzle Challenge level through one stateful card primitive", () => {
    const markup = renderLevelCard({ courseId: "beginner-2", label: "Beginner Level 2", level: 2, state: "locked" });

    expect(markup).toContain('class="course course--locked"');
    expect(markup).toContain('data-course="beginner-2"');
    expect(markup).toContain('aria-label="Beginner Level 2, locked"');
    expect(markup).toContain('disabled');
    expect(markup).toContain('>Locked</span>');
  });

  it("makes the current Puzzle Challenge level informational rather than restartable", () => {
    const markup = renderLevelCard({ courseId: "beginner-2", label: "Beginner Level 2", level: 2, state: "current" });

    expect(markup).toContain('aria-label="Beginner Level 2, current"');
    expect(markup).toContain("disabled");
    expect(markup).toContain(">Current</span>");
  });

  it("renders typed state and data attributes without a raw attribute string", () => {
    const markup = renderButton({ id: "lock", label: "Unlock grid", icon: "lock", pressed: false, data: { gridLock: "weight" } });

    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('data-grid-lock="weight"');
    expect(markup).not.toContain("attributes=");
  });

  it("renders a reusable accessible dialog with labelled actions", () => {
    const markup = renderDialog({
      id: "reset-grid",
      eyebrow: "Reset grid",
      title: "Clear Weight?",
      description: "This clears every mark.",
      actions: '<button id="cancel">Cancel</button>',
    });

    expect(markup).toContain('<dialog id="reset-grid" class="confirm-modal" open');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-labelledby="reset-grid-title"');
    expect(markup).toContain('aria-describedby="reset-grid-description"');
    const picker = renderDialog({ id: "picker", title: "Pick", description: "Choose one.", content: "<section>choices</section>", actions: "<button>Close</button>", className: "course-dialog" });
    expect(picker).toContain('class="confirm-modal course-dialog"');
    expect(picker).toContain('<div class="dialog-content"><section>choices</section></div>');
  });

  it("uses a shared disclosure shell for expandable controls and panels", () => {
    const markup = renderDisclosure({ className: "challenge-options", summary: "Choose challenge", content: "Choices", open: true });

    expect(markup).toBe('<details class="disclosure challenge-options" open><summary>Choose challenge</summary><div class="disclosure-content">Choices</div></details>');
  });

  it("renders a compact, accessible information disclosure", () => {
    const markup = renderInfoDisclosure({ id: "beginner-info", label: "More information about Beginner", content: "A compact introduction." });

    expect(markup).toContain('class="info-disclosure"');
    expect(markup).toContain('<summary aria-label="More information about Beginner" title="More information about Beginner">i</summary>');
    expect(markup).toContain('<div class="info-disclosure__content">A compact introduction.</div>');
  });

  it("uses a shared labelled select control for compact settings", () => {
    const markup = renderSelect({ id: "difficulty", label: "Difficulty", ariaLabel: "Puzzle difficulty", selectedId: "3", options: [
      { id: "", label: "Any" }, { id: "3", label: "Level 3" },
    ] });

    expect(markup).toContain('<label class="select-control">Difficulty');
    expect(markup).toContain('id="difficulty" aria-label="Puzzle difficulty"');
    expect(markup).toContain('<option value="3" selected>Level 3</option>');
  });

  it("uses a shared grid-card primitive with an explicit active state", () => {
    const markup = renderGridCard({ id: "weight", label: "Judoka × Weight", active: true, locked: false, controls: "<button>Lock</button>", content: "<table></table>" });

    expect(markup).toContain('id="grid-weight"');
    expect(markup).toContain('class="grid-card is-active is-unlocked"');
    expect(markup).toContain('class="grid-card-controls"');
    expect(markup).toContain('is-unlocked');
    expect(markup).not.toContain("hidden");
  });

  it("gives grid cells an accessible name, a roving tab stop, and disabled semantics", () => {
    const activeCell = renderGridCell({ key: "club|Aki|Lions", row: "Aki", column: "Lions", mark: "yes", tabIndex: 0 });
    expect(activeCell).toContain('aria-label="Aki, Lions: yes. Select to change."');
    expect(activeCell).toContain('tabindex="0"');

    const disabledCell = renderGridCell({ key: "club|Aki|Lions", row: "Aki", column: "Lions", mark: "unknown", disabled: true });
    expect(disabledCell).toContain('aria-label="Aki, Lions: unknown. Grid locked."');
    expect(disabledCell).toContain(" disabled");
    expect(disabledCell).not.toContain("tabindex=");
  });
});
