import { basicCatalog } from "@a2ui/web_core/catalogs/basic/v1";
import { MessageProcessor, STRICT_VALIDATION } from "@a2ui/web_core/processing";
import type { SurfaceModel } from "@a2ui/web_core/state";
import { A2UI_BASIC_CATALOG_ID } from "./messages";
import {
  createUiBadge,
  createUiButton,
  createUiCard,
  createUiDivider,
  createUiStack,
  createUiText,
} from "../ui-primitives";

const MAX_MESSAGE_BYTES = 16_384;
const MAX_COMPONENTS = 32;
const MAX_DEPTH = 8;
const COMPONENTS = new Set(["Card", "Column", "Row", "Text", "Button", "Divider"]);
const SURFACE_DATA_KEYS = new Set(["label", "description", "title", "body", "dismissLabel"]);
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

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasForbiddenCall(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenCall);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    key === "@call" || key === "functionCall" || key === "callRendererFunction" || key === "callAgentFunction" || hasForbiddenCall(child));
}

function validateSurfaceEnvelope(message: unknown, expectedSurfaceId: string): { surfaceId: string; components: unknown[] } | undefined {
  if (!isRecord(message) || Object.keys(message).some(key => key !== "version" && key !== "createSurface")) return undefined;
  if (message.version !== "1.0" || !isRecord(message.createSurface)) return undefined;
  const surface = message.createSurface;
  if (Object.keys(surface).some(key => !["surfaceId", "catalogId", "sendDataModel", "components", "dataModel"].includes(key))) return undefined;
  if (surface.surfaceId !== expectedSurfaceId || surface.catalogId !== A2UI_BASIC_CATALOG_ID || surface.sendDataModel !== false) return undefined;
  if (!Array.isArray(surface.components) || surface.components.length === 0 || surface.components.length > MAX_COMPONENTS) return undefined;
  if (!isRecord(surface.dataModel) || Object.keys(surface.dataModel).some(key => !SURFACE_DATA_KEYS.has(key))) return undefined;
  if (Object.values(surface.dataModel).some(value => typeof value !== "string" || value.length > 2_048)) return undefined;
  if (hasForbiddenCall(message)) return undefined;
  return { surfaceId: expectedSurfaceId, components: surface.components };
}

function validateComponentAllowlist(components: unknown[], surfaceId: string): boolean {
  for (const component of components) {
    if (!isRecord(component) || typeof component.id !== "string" || !COMPONENT_IDS.test(component.id)) return false;
    if (typeof component.component !== "string" || !COMPONENTS.has(component.component)) return false;
    if (component.component === "Text" && component.variant !== undefined && component.variant !== "body" && component.variant !== "caption") return false;
    if (component.component === "Button") {
      if (surfaceId !== "tako-hint-coach" || !isRecord(component.action) || !isRecord(component.action.event)) return false;
      const event = component.action.event;
      if (event.name !== "dismiss_hint" || !isRecord(event.context) || Object.keys(event.context).length !== 0) return false;
    } else if (component.action !== undefined) {
      return false;
    }
  }
  return true;
}

/** Applies the application's narrow A2UI contract before the official protocol validator. */
export function validateA2uiMessages(messages: unknown, expectedSurfaceId: string): A2uiValidationResult {
  try {
    if (!Array.isArray(messages) || messages.length !== 1) return { ok: false, reason: "A2UI surfaces accept one createSurface message." };
    const serialized = JSON.stringify(messages);
    if (typeof serialized !== "string" || new TextEncoder().encode(serialized).byteLength > MAX_MESSAGE_BYTES) {
      return { ok: false, reason: "A2UI surface exceeds the message size limit." };
    }
    const envelope = validateSurfaceEnvelope(messages[0], expectedSurfaceId);
    if (!envelope || !validateComponentAllowlist(envelope.components, envelope.surfaceId)) {
      return { ok: false, reason: "A2UI surface is outside the supported catalog, component, or action contract." };
    }

    const processor = new MessageProcessor([basicCatalog as never], undefined, {
      version: "1.0",
      validationConfig: { ...STRICT_VALIDATION, targetVersion: "1.0", maxDepth: MAX_DEPTH, allowedMessages: ["createSurface"] },
    });
    try {
      processor.processMessages(messages as never);
      const surface = processor.getSurface(envelope.surfaceId);
      if (!surface || processor.getSurfaces().size !== 1 || surface.componentsModel.size !== envelope.components.length) {
        return { ok: false, reason: "A2UI surface has an invalid component graph." };
      }
      surface.componentsModel.validateTopology({ rootId: "root", maxDepth: MAX_DEPTH });
      return { ok: true, surfaceId: envelope.surfaceId, componentCount: surface.componentsModel.size };
    } finally {
      processor.dispose();
    }
  } catch {
    return { ok: false, reason: "A2UI surface failed protocol validation." };
  }
}

function resolveString(value: unknown, surface: SurfaceModel): string {
  if (isRecord(value) && typeof value["@path"] === "string" && Object.keys(value).length === 1) {
    value = surface.dataModel.get(value["@path"]);
  }
  if (typeof value !== "string") throw new Error("A2UI text did not resolve to a string.");
  return value;
}

function componentFor(surface: SurfaceModel, id: string): A2uiComponent {
  const component = surface.componentsModel.get(id);
  if (!component) throw new Error("A2UI component reference is missing.");
  return { id: component.id, type: component.type, properties: component.properties };
}

/** Native DOM adapter for the small A2UI Basic Catalog subset used by Tako Bako. */
export class A2uiDomRenderer {
  private processor: MessageProcessor | undefined;
  private readonly document: Document;

  constructor(
    private readonly target: HTMLElement,
    private readonly onAction: (action: A2uiHostAction) => void | Promise<void>,
  ) {
    this.document = target.ownerDocument;
  }

  render(messages: unknown, expectedSurfaceId: string): void {
    const validation = validateA2uiMessages(messages, expectedSurfaceId);
    if (!validation.ok || !validation.surfaceId) throw new Error(validation.reason ?? "A2UI surface is invalid.");

    const processor = new MessageProcessor([basicCatalog as never], action => {
      void this.onAction({ name: action.name, context: action.context });
    }, {
      version: "1.0",
      validationConfig: { ...STRICT_VALIDATION, targetVersion: "1.0", maxDepth: MAX_DEPTH, allowedMessages: ["createSurface"] },
    });
    try {
      processor.processMessages(messages as never);
      const surface = processor.getSurface(validation.surfaceId);
      if (!surface) throw new Error("A2UI surface could not be created.");
      const root = this.renderComponent(surface, "root", new Set());
      const previousProcessor = this.processor;
      this.target.replaceChildren(root);
      previousProcessor?.dispose();
      this.processor = processor;
    } catch (error) {
      processor.dispose();
      throw error;
    }
  }

  clear(): void {
    this.target.replaceChildren();
    this.processor?.dispose();
    this.processor = undefined;
  }

  dispose(): void {
    this.clear();
  }

  private renderComponent(surface: SurfaceModel, id: string, ancestry: Set<string>, inline = false): HTMLElement {
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
        return createUiCard(this.document, [this.renderComponent(surface, component.properties.child, nextAncestry)]);
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
        if (typeof component.properties.child !== "string" || !isRecord(action)) throw new Error("A2UI button contract is invalid.");
        const label = this.renderComponent(surface, component.properties.child, nextAncestry, true).textContent ?? "";
        return createUiButton(this.document, label,
          () => surface.dispatchAction(action, component.id),
          { className: "ui-button--a2ui" });
      }
      case "Divider":
        return createUiDivider(this.document);
      default:
        throw new Error("A2UI component is outside the renderer's supported subset.");
    }
  }
}
