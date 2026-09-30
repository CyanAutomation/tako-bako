export interface TabItem {
  id: string;
  label: string;
}

export type IconName = "share" | "undo" | "reset" | "lock" | "unlock" | "check" | "sparkle" | "fast-forward" | "arrow-left" | "arrow-right";

export interface ButtonOptions {
  id?: string;
  label: string;
  ariaLabel?: string;
  icon?: IconName;
  /** Icon-only controls are reserved for compact, familiar navigation actions. */
  iconOnly?: boolean;
  variant?: "primary" | "secondary" | "danger" | "toggle" | "efficiency";
  disabled?: boolean;
  /** State exposed by toggle-like controls. */
  pressed?: boolean;
  /** State exposed by controls that open or close a related region. */
  expanded?: boolean;
  /** Application data hooks, emitted as escaped kebab-case data attributes. */
  data?: Record<string, string>;
}

export interface DialogOptions {
  id: string;
  eyebrow?: string;
  title: string;
  description: string;
  /** Optional dialog body for richer, reusable picker dialogs. */
  content?: string;
  actions: string;
  className?: string;
}

export interface DisclosureOptions {
  className: string;
  summary: string;
  content: string;
  open?: boolean;
}

export interface InfoDisclosureOptions {
  id: string;
  label: string;
  content: string;
}

export interface SelectOptions {
  id: string;
  label: string;
  ariaLabel?: string;
  options: TabItem[];
  selectedId: string;
  className?: string;
}

export interface GridCardOptions {
  id: string;
  label: string;
  active: boolean;
  locked: boolean;
  controls: string;
  content: string;
}

export interface StatusOptions {
  message: string;
  tone?: "neutral" | "success" | "warning" | "error";
}

export interface PanelOptions {
  tag?: "aside" | "section";
  className: string;
  labelledBy?: string;
  content: string;
}

export interface GridCellOptions {
  key: string;
  row: string;
  column: string;
  mark: "unknown" | "yes" | "no";
  disabled?: boolean;
  tabIndex?: number;
}

export interface LevelCardOptions {
  courseId: string;
  label: string;
  level: number;
  state: "complete" | "current" | "available" | "locked";
}

export interface SegmentedControlOptions {
  label: string;
  items: readonly { id: string; label: string; selected: boolean; data: Record<string, string> }[];
  className?: string;
}
