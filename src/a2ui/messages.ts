import { CLUE_STRATEGIES, type ClueStrategy } from "../clue-strategy-catalog";
import type { ParsedHintResponse } from "../hint-response";

export const A2UI_BASIC_CATALOG_ID = "https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json";
const A2UI_VERSION = "1.0";
const MAX_LABEL_LENGTH = 128;
const MAX_BODY_LENGTH = 1_024;

export type A2uiComponentMessage = Record<string, unknown> & { id: string; component: string };
export type A2uiSurfaceMessage = {
  version: "1.0";
  createSurface: {
    surfaceId: string;
    catalogId: string;
    sendDataModel: false;
    components: A2uiComponentMessage[];
    dataModel: Record<string, string>;
  };
};

function assertSurfaceId(surfaceId: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(surfaceId)) throw new RangeError("A2UI surface ID is invalid.");
}

function assertText(value: string, name: string, maxLength: number): void {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new RangeError(`A2UI ${name} is outside the supported length.`);
  }
}

export function a2uiColumn(id: string, children: readonly string[]): A2uiComponentMessage {
  return { id, component: "Column", children: [...children] };
}

export function a2uiRow(id: string, children: readonly string[]): A2uiComponentMessage {
  return { id, component: "Row", children: [...children] };
}

export function a2uiCard(id: string, child: string): A2uiComponentMessage {
  return { id, component: "Card", child };
}

export function a2uiText(id: string, path: string, variant: "body" | "caption" = "body"): A2uiComponentMessage {
  return { id, component: "Text", variant, text: { "@path": path } };
}

export function a2uiButton(id: string, textId: string, eventName: string, context: Record<string, unknown> = {}): A2uiComponentMessage {
  return { id, component: "Button", child: textId, action: { event: { name: eventName, context } } };
}

export function a2uiDivider(id: string): A2uiComponentMessage {
  return { id, component: "Divider" };
}

function createSurface(surfaceId: string, components: A2uiComponentMessage[], dataModel: Record<string, string>): A2uiSurfaceMessage[] {
  assertSurfaceId(surfaceId);
  return [{
    version: A2UI_VERSION,
    createSurface: {
      surfaceId,
      catalogId: A2UI_BASIC_CATALOG_ID,
      sendDataModel: false,
      components,
      dataModel,
    },
  }];
}

/** Creates a fixed, app-owned A2UI strategy explanation surface. */
export function buildStrategySurface({ surfaceId, strategy }: {
  surfaceId: string;
  strategy: ClueStrategy;
}): A2uiSurfaceMessage[] {
  const definition = CLUE_STRATEGIES[strategy];
  if (!definition) throw new TypeError("A2UI strategy is unsupported.");
  const components = [
    a2uiCard("root", "strategy_content"),
    a2uiColumn("strategy_content", ["strategy_label", "strategy_description"]),
    a2uiText("strategy_label", "/label", "caption"),
    a2uiText("strategy_description", "/description"),
  ];
  return createSurface(surfaceId, components, {
    label: definition.label,
    description: definition.description,
  });
}

/** Creates a fixed, app-owned learning focus from an allowlisted strategy ID. */
export function buildLearningRecommendationSurface({ surfaceId, strategy }: {
  surfaceId: string;
  strategy: ClueStrategy;
}): A2uiSurfaceMessage[] {
  const definition = CLUE_STRATEGIES[strategy];
  if (!definition) throw new TypeError("Learning strategy is unsupported.");
  const components = [
    a2uiCard("root", "learning_content"),
    a2uiColumn("learning_content", ["learning_label", "learning_body"]),
    a2uiText("learning_label", "/label", "caption"),
    a2uiText("learning_body", "/body"),
  ];
  return createSurface(surfaceId, components, {
    label: "For next time",
    body: `${definition.label}: ${definition.description} Look for this kind of reasoning in your next puzzle.`,
  });
}

export interface HintCoachContent {
  title: string;
  body: string;
}

export function hintCoachContent(hint: ParsedHintResponse, strategy?: ClueStrategy): HintCoachContent {
  const definition = strategy ? CLUE_STRATEGIES[strategy] : undefined;
  if (hint.kind === "clue") {
    return definition
      ? { title: definition.label, body: `“${hint.clue.text}” ${definition.description}` }
      : { title: "Think through the clue", body: `“${hint.clue.text}” Look for a relationship that rules out one of the remaining pairings.` };
  }
  return {
    title: "Build on this match",
    body: `Use the confirmed match between ${hint.placement.subject} and ${hint.placement.value} in ${hint.placement.category} to rule out conflicting options.`,
  };
}

/** Creates a fixed coaching surface with host-validated dismiss and optional matched-clue actions. */
export function buildHintCoachSurface({ surfaceId, title, body, focusClueId }: {
  surfaceId: string;
  title: string;
  body: string;
  focusClueId?: string;
}): A2uiSurfaceMessage[] {
  assertText(title, "title", MAX_LABEL_LENGTH);
  assertText(body, "body", MAX_BODY_LENGTH);
  if (focusClueId !== undefined) assertText(focusClueId, "clue ID", 128);
  const components = [
    a2uiCard("root", "coach_content"),
    a2uiColumn("coach_content", ["coach_title", "coach_body", "dismiss", ...(focusClueId ? ["review_clue"] : [])]),
    a2uiText("coach_title", "/title", "caption"),
    a2uiText("coach_body", "/body"),
    a2uiButton("dismiss", "dismiss_label", "dismiss_hint"),
    a2uiText("dismiss_label", "/dismissLabel"),
    ...(focusClueId ? [
      a2uiButton("review_clue", "review_clue_label", "focus_clue", { clueId: focusClueId }),
      a2uiText("review_clue_label", "/reviewClueLabel"),
    ] : []),
  ];
  return createSurface(surfaceId, components, {
    title,
    body,
    dismissLabel: "Dismiss note",
    ...(focusClueId ? { reviewClueLabel: "Review this clue" } : {}),
  });
}
