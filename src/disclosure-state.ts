export interface DisclosureState {
  actionMenuOpen: boolean;
  feedbackEntryOpen: boolean;
  cluesOpen: boolean;
  clueFiltersOpen: boolean;
  smartMarkingToolsOpen: boolean;
}

const stateKeyByClassName: ReadonlyMap<string, keyof DisclosureState> = new Map([
  ["action-menu", "actionMenuOpen"],
  ["feedback-entry", "feedbackEntryOpen"],
  ["clue-drawer", "cluesOpen"],
  ["clue-filter-disclosure", "clueFiltersOpen"],
  ["board-tools", "smartMarkingToolsOpen"],
]);

export function applyDisclosureToggle(state: DisclosureState, classNames: Iterable<string>, open: boolean): void {
  for (const className of classNames) {
    const stateKey = stateKeyByClassName.get(className);
    if (stateKey) state[stateKey] = open;
  }
}
