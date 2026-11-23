import { A2UI_BASIC_CATALOG_ID } from "./messages";
import {
  createUiBadge,
  createUiButton,
  createUiCard,
  createUiDivider,
  createUiStack,
  createUiText,
} from "../ui-primitives";
import { createUiCoachCard } from "../ui-components/coach-card";

const MAX_MESSAGE_BYTES = 16_384;
const MAX_COMPONENTS = 32;
const MAX_DEPTH = 8;
const COMPONENTS = new Set(["Card", "Column", "Row", "Text", "Button", "Divider"]);
const SURFACE_DATA_KEYS = new Set(["label", "description", "title", "body", "dismissLabel", "reviewClueLabel"]);
const COMPONENT_IDS = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

export interface A2uiHostAction {
  name: string;
  context: Record<string, unknown>;
}

export interface A2uiValidationResult {
  ok: boolean;
  reason?: string;
  surfaceId?: string;
  componentCount?: number;
}

type RecordValue = Record<string, unknown>;
type A2uiComponent = { id: string; type: string; properties: RecordValue };
interface A2uiSurface {
  id: string;
  dataModel: Record<string, string>;
  components: Map<string, A2uiComponent>;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasForbiddenCall(value: unknown, depth = 0): boolean {
  if (depth > MAX_DEPTH) return true;
  if (Array.isArray(value)) return value.some(child => hasForbiddenCall(child, depth + 1));
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    key === "@call" || key === "functionCall" || key === "callRendererFunction" || key === "callAgentFunction" || hasForbiddenCall(child, depth + 1));
}

function validateSurfaceEnvelope(message: unknown, expectedSurfaceId: string): { surfaceId: string; components: unknown[]; dataModel: Record<string, string> } | undefined {
  if (!isRecord(message) || Object.keys(message).some(key => key !== "version" && key !== "createSurface")) return undefined;
  if (message.version !== "1.0" || !isRecord(message.createSurface)) return undefined;
  const surface = message.createSurface;
  if (Object.keys(surface).some(key => !["surfaceId", "catalogId", "sendDataModel", "components", "dataModel"].includes(key))) return undefined;
  if (surface.surfaceId !== expectedSurfaceId || surface.catalogId !== A2UI_BASIC_CATALOG_ID || surface.sendDataModel !== false) return undefined;
  if (!Array.isArray(surface.components) || surface.components.length === 0 || surface.components.length > MAX_COMPONENTS) return undefined;
  if (!isRecord(surface.dataModel) || Object.keys(surface.dataModel).some(key => !SURFACE_DATA_KEYS.has(key))) return undefined;
  if (Object.values(surface.dataModel).some(value => typeof value !== "string" || value.length > 2_048)) return undefined;
  return { surfaceId: expectedSurfaceId, components: surface.components, dataModel: surface.dataModel as Record<string, string> };
}

function validateComponent(value: unknown, dataModel: Record<string, string>): value is RecordValue & { id: string; component: string } {
  if (!isRecord(value) || typeof value.id !== "string" || !COMPONENT_IDS.test(value.id)) return false;
  if (typeof value.component !== "string" || !COMPONENTS.has(value.component)) return false;

  const fields: Record<string, readonly string[]> = {
    Card: ["child"],
    Column: ["children"],
    Row: ["children"],
    Text: ["variant", "text"],
    Button: ["child", "action"],
    Divider: [],
  };
  const allowedFields = new Set(["id", "component", ...fields[value.component]!]);
  if (Object.keys(value).some(key => !allowedFields.has(key))) return false;

  if (value.component === "Card") return typeof value.child === "string";
  if (value.component === "Column" || value.component === "Row") {
    return Array.isArray(value.children) && value.children.length > 0 && value.children.every(child => typeof child === "string");
  }
  if (value.component === "Text") {
    if (value.variant !== undefined && value.variant !== "body" && value.variant !== "caption") return false;
    if (!isRecord(value.text) || Object.keys(value.text).length !== 1 || typeof value.text["@path"] !== "string") return false;
    const path = value.text["@path"] as string;
    return path.startsWith("/") && Object.hasOwn(dataModel, path.slice(1));
  }
  if (value.component === "Button") {
    if (typeof value.child !== "string" || !isRecord(value.action)) return false;
    if (Object.keys(value.action).length !== 1 || !isRecord(value.action.event)) return false;
    const event = value.action.event;
    if (Object.keys(event).length !== 2 || !isRecord(event.context)) return false;
    if (event.name === "dismiss_hint") return Object.keys(event.context).length === 0;
    return event.name === "focus_clue"
      && Object.keys(event.context).length === 1
      && typeof event.context.clueId === "string"
      && event.context.clueId.length > 0
      && event.context.clueId.length <= 128;
  }
  return true;
}

function childIds(component: A2uiComponent): string[] {
  if (component.type === "Card" || component.type === "Button") {
    const child = component.properties.child;
    return typeof child === "string" ? [child] : [];
  }
  if (component.type === "Column" || component.type === "Row") {
    const children = component.properties.children;
    return Array.isArray(children) ? children.filter((child): child is string => typeof child === "string") : [];
  }
  return [];
}

function validateTopology(surfaceId: string, components: Map<string, A2uiComponent>): boolean {
  if (components.get("root")?.type !== "Card") return false;
  const visited = new Set<string>();
  function visit(id: string, ancestry: Set<string>): boolean {
    if (ancestry.size >= MAX_DEPTH || ancestry.has(id)) return false;
    const component = components.get(id);
    if (!component) return false;
    visited.add(id);
    const nextAncestry = new Set(ancestry).add(id);
    return childIds(component).every(child => visit(child, nextAncestry));
  }
  return surfaceId.length > 0 && visit("root", new Set()) && visited.size === components.size;
}

function validatedSurface(messages: unknown, expectedSurfaceId: string): A2uiSurface | undefined {
  if (!Array.isArray(messages) || messages.length !== 1) return undefined;
  const serialized = JSON.stringify(messages);
  if (typeof serialized !== "string" || new TextEncoder().encode(serialized).byteLength > MAX_MESSAGE_BYTES) return undefined;
  const envelope = validateSurfaceEnvelope(messages[0], expectedSurfaceId);
  if (!envelope || hasForbiddenCall(messages[0])) return undefined;
  const components = new Map<string, A2uiComponent>();
  for (const value of envelope.components) {
    if (!validateComponent(value, envelope.dataModel) || components.has(value.id)) return undefined;
    components.set(value.id, { id: value.id, type: value.component, properties: value });
  }
  if (!validateTopology(envelope.surfaceId, components)) return undefined;
  return { id: envelope.surfaceId, dataModel: envelope.dataModel, components };
}

/** Validates the app's small A2UI Basic Catalog subset before it reaches the DOM. */
export function validateA2uiMessages(messages: unknown, expectedSurfaceId: string): A2uiValidationResult {
  try {
    const surface = validatedSurface(messages, expectedSurfaceId);
    if (!surface) return { ok: false, reason: "A2UI surface is outside the supported catalog, component, data, action, or topology contract." };
    return { ok: true, surfaceId: surface.id, componentCount: surface.components.size };
  } catch {
    return { ok: false, reason: "A2UI surface failed protocol validation." };
  }
}

function resolveString(value: unknown, surface: A2uiSurface): string {
  if (isRecord(value) && typeof value["@path"] === "string" && Object.keys(value).length === 1) {
    const path = value["@path"].slice(1);
    value = surface.dataModel[path];
  }
  if (typeof value !== "string") throw new Error("A2UI text did not resolve to a string.");
  return value;
}

function componentFor(surface: A2uiSurface, id: string): A2uiComponent {
  const component = surface.components.get(id);
  if (!component) throw new Error("A2UI component reference is missing.");
  return component;
}

/** Native DOM adapter for the validated A2UI Basic Catalog subset used by Tako Bako. */
export class A2uiDomRenderer {
  private readonly document: Document;

  constructor(
    private readonly target: HTMLElement,
    private readonly onAction: (action: A2uiHostAction) => void | Promise<void>,
  ) {
    this.document = target.ownerDocument;
  }

  render(messages: unknown, expectedSurfaceId: string): void {
    const surface = validatedSurface(messages, expectedSurfaceId);
    if (!surface) throw new Error("A2UI surface is outside the supported rendering contract.");
    const root = this.renderComponent(surface, "root", new Set());
    this.target.replaceChildren(root);
  }

  clear(): void {
    this.target.replaceChildren();
  }

  dispose(): void {
    this.clear();
  }

  private renderComponent(surface: A2uiSurface, id: string, ancestry: Set<string>, inline = false): HTMLElement {
    if (ancestry.has(id) || ancestry.size >= MAX_DEPTH) throw new Error("A2UI component topology is invalid.");
    const component = componentFor(surface, id);
    const nextAncestry = new Set(ancestry).add(id);
    const children = component.properties.children;

    switch (component.type) {
      case "Column":
      case "Row": {
        if (!Array.isArray(children) || children.some(child => typeof child !== "string")) throw new Error("A2UI layout children are invalid.");
        return createUiStack(this.document, component.type === "Column" ? "vertical" : "horizontal",
          children.map(child => this.renderComponent(surface, child as string, nextAncestry)));
      }
      case "Card": {
        if (typeof component.properties.child !== "string") throw new Error("A2UI card child is invalid.");
        const children = [this.renderComponent(surface, component.properties.child, nextAncestry)];
        return id === "root" ? createUiCoachCard(this.document, children) : createUiCard(this.document, children);
      }
      case "Text": {
        const text = resolveString(component.properties.text, surface);
        const variant = component.properties.variant === "caption" ? "caption" : "body";
        return variant === "caption"
          ? createUiBadge(this.document, text)
          : createUiText(this.document, text, { variant, inline });
      }
      case "Button": {
        const action = component.properties.action;
        if (typeof component.properties.child !== "string" || !isRecord(action) || !isRecord(action.event)) throw new Error("A2UI button contract is invalid.");
        const label = this.renderComponent(surface, component.properties.child, nextAncestry, true).textContent ?? "";
        const event = action.event;
        return createUiButton(this.document, label,
          () => this.onAction({ name: event.name as string, context: event.context as Record<string, unknown> }),
          { className: "ui-button--a2ui" });
      }
      case "Divider":
        return createUiDivider(this.document);
      default:
        throw new Error("A2UI component is outside the renderer's supported subset.");
    }
  }
}
