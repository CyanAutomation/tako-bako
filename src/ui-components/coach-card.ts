import { createUiCard } from "../ui-primitives.js";

/** Shared semantic card wrapper for A2UI coaching and learning surfaces. */
export function createUiCoachCard(document: Document, children: readonly Node[]): HTMLElement {
  const card = createUiCard(document, children);
  card.classList.add("ui-coach-card");
  card.setAttribute("role", "note");
  return card;
}
