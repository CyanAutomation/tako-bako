import { renderButton } from "../ui-buttons";
import { renderControlGroup } from "../ui-form-controls";

export function renderBoardToolbar({ matches, total, undoDisabled, resetDisabled, checkDisabled, hintDisabled, smartMarking }: { matches: number; total: number; undoDisabled: boolean; resetDisabled: boolean; checkDisabled: boolean; hintDisabled: boolean; smartMarking: boolean }): string {
  const checkHint = checkDisabled ? "Choose one match in each row and column, then check your solution." : "Your solution is ready to check.";
  const smartMarkingLabel = `Smart marking: ${smartMarking ? "on" : "off"}`;
  // Fixed board-action hierarchy: reversible utilities → efficiency control → primary solve action.
  const actions = `${renderButton({ id: "undo", label: "Undo", ariaLabel: "Undo last mark", icon: "undo", disabled: undoDisabled, data: { actionRole: "utility" } })}${renderButton({ id: "reset-board", label: "Reset board", ariaLabel: "Reset all board marks", icon: "reset", disabled: resetDisabled, data: { actionRole: "utility" } })}${renderButton({ id: "hint", label: "Hint", ariaLabel: "Get a hint", icon: "sparkle", disabled: hintDisabled, data: { actionRole: "utility" } })}${renderButton({ id: "smart-marking-toggle", label: smartMarkingLabel, ariaLabel: `${smartMarkingLabel}. An efficiency tool that rules out row and column peers after a match.`, icon: "fast-forward", variant: "efficiency", pressed: smartMarking, data: { actionRole: "efficiency" } })}${renderButton({ id: "check-solution", label: "Check my solution", ariaLabel: "Check my solution", icon: "check", variant: "primary", disabled: checkDisabled, data: { actionRole: "primary" } })}`;
  const progressMax = Math.max(total, 1);
  const progressValue = Math.min(Math.max(matches, 0), progressMax);
  return `<div class="workspace-bar"><div class="readiness-meter"><div class="readiness-meter__copy"><p class="progress">${matches} of ${total} matches found</p><p class="check-hint">${checkHint}</p></div><progress class="readiness-meter__bar" aria-label="${matches} of ${total} matches found" max="${progressMax}" value="${progressValue}"></progress></div>${renderControlGroup("Board actions", actions, "board-actions")}</div>`;
}
