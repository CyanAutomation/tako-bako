import { describe, expect, it } from "vitest";
import { nextTabId, renderButton, renderTabs } from "./ui";

describe("shared UI primitives", () => {
  const tabs = [
    { id: "club", label: "Club" },
    { id: "weight", label: "Weight" },
    { id: "tatami", label: "Tatami" },
  ];

  it("renders a semantic tablist with one keyboard-focusable active tab", () => {
    const markup = renderTabs(tabs, "weight");

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('id="grid-tab-weight" aria-selected="true" aria-controls="grid-weight" tabindex="0"');
    expect(markup).toContain('id="grid-tab-club" aria-selected="false" aria-controls="grid-club" tabindex="-1"');
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
});
