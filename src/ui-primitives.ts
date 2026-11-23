export type UiStackDirection = "horizontal" | "vertical";
export type UiTextVariant = "body" | "caption";
export type UiBadgeTone = "neutral" | "success" | "warning";

function appendChildren(target: HTMLElement, children: readonly Node[]): void {
  for (const child of children) target.appendChild(child);
}

/** A reusable semantic card primitive for app-owned, data-driven surfaces. */
export function createUiCard(document: Document, children: readonly Node[]): HTMLElement {
  const card = document.createElement("article");
  card.className = "ui-card";
  appendChildren(card, children);
  return card;
}

/** A reusable layout primitive for vertical and horizontal content groups. */
export function createUiStack(document: Document, direction: UiStackDirection, children: readonly Node[]): HTMLDivElement {
  const stack = document.createElement("div");
  stack.className = `ui-stack ui-stack--${direction}`;
  appendChildren(stack, children);
  return stack;
}

/** A text primitive that treats all supplied content as text, never markup. */
export function createUiText(
  document: Document,
  value: string,
  { variant = "body", inline = false }: { variant?: UiTextVariant; inline?: boolean } = {},
): HTMLElement {
  const text = document.createElement(inline ? "span" : "p");
  text.className = `ui-text ui-text--${variant}`;
  text.textContent = value;
  return text;
}

/** A compact visual label that remains ordinary, readable text. */
export function createUiBadge(document: Document, label: string, tone: UiBadgeTone = "neutral"): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = `ui-badge ui-badge--${tone}`;
  badge.textContent = label;
  return badge;
}

/** A native button primitive with an explicit host-owned activation callback. */
export function createUiButton(
  document: Document,
  label: string,
  onActivate: () => void | Promise<void>,
  { disabled = false, className = "" }: { disabled?: boolean; className?: string } = {},
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `ui-button${className ? ` ${className}` : ""}`;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", () => { void onActivate(); });
  return button;
}

/** A semantic divider shared by composable UI surfaces. */
export function createUiDivider(document: Document): HTMLHRElement {
  const divider = document.createElement("hr");
  divider.className = "ui-divider";
  return divider;
}
