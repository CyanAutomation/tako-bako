import { renderButton } from "../ui-buttons";
import { renderControlGroup } from "../ui-form-controls";

export function renderBoardToolbar({ matches, total, undoDisabled, resetDisabled, checkDisabled, hintDisabled, smartMarking, smartMarkingToolsOpen = false }: { matches: number; total: number; undoDisabled: boolean; resetDisabled: boolean; checkDisabled: boolean; hintDisabled: boolean; smartMarking: boolean; smartMarkingToolsOpen?: boolean }): string {
  const checkHint = checkDisabled ? "Choose one match in each row and column, then check your solution." : "Your solution is ready to check.";
  const autoMarkLabel = `Auto-mark ${smartMarking ? "on" : "off"}`;
  // Keep reversible actions together, then assistance, then the primary solve action.
  const autoMark = renderButton({ id: "smart-marking-toggle", label: autoMarkLabel, ariaLabel: `Auto-mark is ${smartMarking ? "on" : "off"}. Automatically rules out the other squares in a row and column after a match.`, icon: "fast-forward", variant: "efficiency", pressed: smartMarking, data: { actionRole: "efficiency" } });
  const tools = `<details class="board-tools"${smartMarkingToolsOpen ? " open" : ""}><summary>Tools${smartMarking ? '<span class="board-tools__status">Auto-mark on</span>' : ""}</summary><div class="board-tools__content">${autoMark}</div></details>`;
  const actions = `${renderButton({ id: "undo", label: "Undo", ariaLabel: "Undo last mark", icon: "undo", disabled: undoDisabled, data: { actionRole: "utility" } })}${renderButton({ id: "reset-board", label: "Clear board", ariaLabel: "Clear all board marks", icon: "reset", disabled: resetDisabled, data: { actionRole: "utility" } })}${renderButton({ id: "hint", label: "Hint", ariaLabel: "Get a hint", icon: "sparkle", disabled: hintDisabled, data: { actionRole: "utility" } })}${renderButton({ id: "check-solution", label: "Check my solution", ariaLabel: "Check my solution", icon: "check", variant: "primary", disabled: checkDisabled, data: { actionRole: "primary" } })}${tools}`;
  const progressMax = Math.max(total, 1);
  const progressValue = Math.min(Math.max(matches, 0), progressMax);
  return `<div class="workspace-bar"><div class="readiness-meter"><div class="readiness-meter__copy"><p class="progress">${matches} of ${total} matches found</p><p class="check-hint">${checkHint}</p></div><progress class="readiness-meter__bar" aria-label="${matches} of ${total} matches found" max="${progressMax}" value="${progressValue}"></progress></div>${renderControlGroup("Board actions", actions, "board-actions")}</div>`;
}
