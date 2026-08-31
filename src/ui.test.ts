import { describe, expect, it } from "vitest";
import { nextTabId, renderButton, renderGridCard, renderSelect, renderTabs } from "./ui";

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

  it("provides standard controls for both compact mobile and wider layouts", () => {
    const markup = renderTabs(tabs, "weight");

    expect(markup).toContain('class="grid-picker"');
    expect(markup).toContain('class="grid-tabs"');
    expect(markup).not.toContain("hidden");
  });

  it("moves through tabs with the standard arrow, Home, and End keys", () => {
    expect(nextTabId(tabs, "weight", "ArrowRight")).toBe("tatami");
    expect(nextTabId(tabs, "weight", "ArrowLeft")).toBe("club");
    expect(nextTabId(tabs, "club", "ArrowLeft")).toBe("tatami");
    expect(nextTabId(tabs, "weight", "Home")).toBe("club");
    expect(nextTabId(tabs, "weight", "End")).toBe("tatami");
  });

  it("uses a shared button primitive for regular and icon actions", () => {
    expect(renderButton({ id: "new", label: "New puzzle" })).toContain('class="button button--secondary"');
    expect(renderButton({ id: "undo", label: "Undo", icon: "↶" })).toContain('class="button button--icon"');
  });

  it("uses a shared labelled select control for compact settings", () => {
    const markup = renderSelect({ id: "difficulty", label: "Difficulty", ariaLabel: "Puzzle difficulty", selectedId: "3", options: [
      { id: "", label: "Any" }, { id: "3", label: "Level 3" },
    ] });

    expect(markup).toContain('<label class="select-control">Difficulty');
    expect(markup).toContain('id="difficulty" aria-label="Puzzle difficulty"');
    expect(markup).toContain('<option value="3" selected>Level 3</option>');
  });

  it("uses a shared grid-card primitive without hiding desktop panels", () => {
    const markup = renderGridCard({ id: "weight", label: "Judoka × Weight", active: true, locked: false, controls: "<button>Lock</button>", content: "<table></table>" });

    expect(markup).toContain('id="grid-weight"');
    expect(markup).toContain('class="grid-card is-active is-unlocked"');
    expect(markup).toContain('class="grid-card-controls"');
    expect(markup).toContain('is-unlocked');
    expect(markup).not.toContain("hidden");
  });
});
