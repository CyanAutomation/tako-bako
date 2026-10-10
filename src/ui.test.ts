import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { nextGridCellKey, nextTabId, renderButton, renderDialog, renderDisclosure, renderGridCard, renderGridCell, renderInfoDisclosure, renderLevelCard, renderSegmentedControl, renderSelect, renderTabs, trapDialogTab } from "./ui";

describe("shared UI primitives", () => {
  const tabs = [
    { id: "club", label: "Club" },
    { id: "weight", label: "Weight" },
    { id: "tatami", label: "Tatami" },
  ];

  it("[TB-ACCESS-01] renders a labelled grid selector and one keyboard-focusable active tab", () => {
    const markup = renderTabs(tabs, "weight");

    assert.match(markup, /<label[^>]*>Working grid <select id="grid-select" aria-label="Choose working grid">/);
    assert.match(markup, /<option value="weight" selected>Weight<\/option>/);
    assert.match(markup, /role="tablist" aria-label="Choose working grid"/);
    assert.match(markup, /id="grid-tab-weight"[^>]*role="tab"[^>]*aria-controls="grid-weight"[^>]*aria-selected="true"[^>]*tabindex="0"/);
    assert.match(markup, /id="grid-tab-weight"[^>]*data-grid-tab="weight"/);
    assert.match(markup, /id="grid-tab-club"[^>]*role="tab"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
    assert.strictEqual((markup.match(/role="tab"[^>]*tabindex="0"/g) ?? []).length, 1);
  });

  it("[TB-ACCESS-01] moves through tabs with the standard arrow, Home, and End keys", () => {
    assert.strictEqual(nextTabId(tabs, "weight", "ArrowRight"), "tatami");
    assert.strictEqual(nextTabId(tabs, "weight", "ArrowLeft"), "club");
    assert.strictEqual(nextTabId(tabs, "club", "ArrowLeft"), "tatami");
    assert.strictEqual(nextTabId(tabs, "weight", "Home"), "club");
    assert.strictEqual(nextTabId(tabs, "weight", "End"), "tatami");
  });

  it("[TB-ACCESS-01] moves a grid cell with arrow keys while staying within its grid", () => {
    const options = { categoryId: "club", rows: ["Aki", "Ben"], columns: ["Lions", "Wolves"] };

    assert.strictEqual(nextGridCellKey({ ...options, key: "club|Aki|Lions", keyName: "ArrowRight" }), "club|Aki|Wolves");
    assert.strictEqual(nextGridCellKey({ ...options, key: "club|Aki|Lions", keyName: "ArrowUp" }), "club|Aki|Lions");
    assert.strictEqual(nextGridCellKey({ ...options, key: "club|Ben|Wolves", keyName: "ArrowDown" }), "club|Ben|Wolves");
    assert.strictEqual(nextGridCellKey({ ...options, key: "club|Ben|Lions", keyName: "ArrowUp" }), "club|Aki|Lions");
    assert.strictEqual(nextGridCellKey({ ...options, key: "club|Aki|Lions", keyName: "Enter" }), undefined);
  });

  it("[TB-ACCESS-01] does not navigate grids without rows or columns", () => {
    assert.strictEqual(nextGridCellKey({ categoryId: "club", rows: [], columns: ["Lions"], key: "club|Aki|Lions", keyName: "ArrowDown" }), undefined);
    assert.strictEqual(nextGridCellKey({ categoryId: "club", rows: ["Aki"], columns: [], key: "club|Aki|Lions", keyName: "ArrowRight" }), undefined);
  });

  it("[TB-ACCESS-02] gives icon actions an accessible name and hides decorative SVGs", () => {
    const iconButton = renderButton({ id: "undo", label: "Undo", ariaLabel: "Undo last mark", icon: "undo" });

    assert.match(iconButton, /^<button\b/);
    assert.match(iconButton, /aria-label="Undo last mark"/);
    assert.match(iconButton, /<svg[^>]*aria-hidden="true"/);
    assert.match(iconButton, /<span>Undo<\/span>/);
    assert.doesNotMatch(iconButton, /aria-hidden="true"[^>]*>Undo/);

    const toggle = renderButton({ label: "Smart marking: on", ariaLabel: "Smart marking: on", icon: "fast-forward", pressed: true });
    assert.match(toggle, /aria-label="Smart marking: on"/);
    assert.match(toggle, /aria-pressed="true"/);
    assert.match(toggle, /<span>Smart marking: on<\/span>/);
  });

  it("escapes every dynamic button attribute while retaining false and zero states", () => {
    const button = renderButton({
      id: 'button "one"',
      label: "Continue",
      role: 'tab" aria-hidden="true',
      ariaControls: "grid<&",
      selected: false,
      tabIndex: 0,
      ariaLabel: 'Continue "safely"',
      pressed: false,
      expanded: true,
      disabled: true,
      data: { gridTab: "club & weight" },
    });

    assert.ok(button.includes('id="button &quot;one&quot;"'));
    assert.ok(button.includes('role="tab&quot; aria-hidden=&quot;true"'));
    assert.ok(button.includes('aria-controls="grid&lt;&amp;"'));
    assert.ok(button.includes('aria-selected="false"'));
    assert.ok(button.includes('tabindex="0"'));
    assert.ok(button.includes('aria-label="Continue &quot;safely&quot;"'));
    assert.ok(button.includes('aria-pressed="false"'));
    assert.ok(button.includes('aria-expanded="true"'));
    assert.ok(button.includes(' disabled'));
    assert.ok(button.includes('data-grid-tab="club &amp; weight"'));
  });

  it("[TB-ACCESS-03] exposes clue filters as a labelled single-choice control", () => {
    const markup = renderSegmentedControl({ label: "Filter clues", items: [
      { id: "all", label: "All", selected: true, data: { clueFilter: "all" } },
      { id: "used", label: "Used", selected: false, data: { clueFilter: "used" } },
    ] });

    assert.match(markup, /role="group" aria-label="Filter clues"/);
    assert.match(markup, /<button(?=[^>]*data-clue-filter="all")(?=[^>]*aria-pressed="true")[^>]*>All<\/button>/);
    assert.match(markup, /<button(?=[^>]*data-clue-filter="used")(?=[^>]*aria-pressed="false")[^>]*>Used<\/button>/);
    assert.strictEqual((markup.match(/aria-pressed="true"/g) ?? []).length, 1);
  });

  it("disables locked and current courses with distinct accessible names", () => {
    const locked = renderLevelCard({ courseId: "beginner-2", label: "Beginner Level 2", level: 2, state: "locked" });
    const current = renderLevelCard({ courseId: "beginner-2", label: "Beginner Level 2", level: 2, state: "current" });

    assert.match(locked, /<button\b[^>]*aria-label="Beginner Level 2, locked"[^>]*disabled/);
    assert.match(current, /<button\b[^>]*aria-label="Beginner Level 2, current"[^>]*disabled/);
  });

  it("[TB-ACCESS-04] renders a dialog with an accessible title, description, and supplied actions", () => {
    const markup = renderDialog({
      id: "reset-grid",
      eyebrow: "Reset grid",
      title: "Clear Weight?",
      description: "This clears every mark.",
      actions: '<button id="cancel">Cancel</button>',
    });

    assert.match(markup, /<dialog id="reset-grid" class="confirm-modal" open aria-modal="true" aria-labelledby="reset-grid-title" aria-describedby="reset-grid-description">/);
    assert.match(markup, /<h2 id="reset-grid-title">Clear Weight\?<\/h2>/);
    assert.match(markup, /<p id="reset-grid-description">This clears every mark\.<\/p>/);
    assert.match(markup, /<div class="modal-actions"><button id="cancel">Cancel<\/button><\/div>/);
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

  it("associates the visible Difficulty label with the selected option", () => {
    const markup = renderSelect({ id: "difficulty", label: "Difficulty", selectedId: "3", options: [
      { id: "", label: "Any" }, { id: "3", label: "Level 3" },
    ] });

    assert.match(markup, /<label[^>]*>Difficulty <select id="difficulty">/);
    assert.match(markup, /<option value="3" selected>Level 3<\/option>/);
    assert.strictEqual((markup.match(/\sselected(?:\s|>)/g) ?? []).length, 1);
  });

  it("[TB-ACCESS-01] renders a labelled tab panel with its active grid identity", () => {
    const markup = renderGridCard({ id: "weight", label: "Judoka × Weight", active: true, locked: false, controls: "<button>Lock</button>", content: "<table></table>" });
    const lockedMarkup = renderGridCard({ id: "weight", label: "Judoka × Weight", active: false, locked: true, controls: "<button>Unlock</button>", content: "<table></table>" });

    assert.match(markup, /<section id="grid-weight" role="tabpanel" aria-label="Judoka × Weight"/);
    assert.match(markup, /data-grid-card="weight"/);
    assert.match(markup, /class="grid-card[^"]*\bis-active\b/);
    assert.match(markup, /<div class="grid-card-controls"><button>Lock<\/button><\/div>/);
    assert.match(lockedMarkup, /<section id="grid-weight" role="tabpanel" aria-label="Judoka × Weight"/);
    assert.match(lockedMarkup, /class="grid-card[^"]*\bis-locked\b/);
    assert.doesNotMatch(lockedMarkup, /class="grid-card[^"]*\bis-active\b/);
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

  it("traps Tab and Shift+Tab within a dialog, including both ends", () => {
    const firstFocus = { count: 0 };
    const lastFocus = { count: 0 };
    const first = { focus: () => { firstFocus.count += 1; } } as HTMLElement;
    const last = { focus: () => { lastFocus.count += 1; } } as HTMLElement;
    const dialog = { querySelectorAll: () => [first, last] } as unknown as HTMLDialogElement;
    const event = { preventDefaultCount: 0, preventDefault() { this.preventDefaultCount += 1; } };

    assert.strictEqual(trapDialogTab(event as never, dialog, first), true);
    assert.strictEqual(lastFocus.count, 1);
    assert.strictEqual(event.preventDefaultCount, 1);
    assert.strictEqual(trapDialogTab(event as never, dialog, last, true), true);
    assert.strictEqual(firstFocus.count, 1);
    assert.strictEqual(event.preventDefaultCount, 2);
  });

  it("does not prevent Tab when a dialog has no focusable controls", () => {
    const event = { preventDefaultCount: 0, preventDefault() { this.preventDefaultCount += 1; } };
    const dialog = { querySelectorAll: () => [] } as unknown as HTMLDialogElement;

    assert.strictEqual(trapDialogTab(event as never, dialog, null), false);
    assert.strictEqual(event.preventDefaultCount, 0);
  });
});
