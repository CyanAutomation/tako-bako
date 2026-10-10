import type { StatusTone } from "../ui-types";
import { escapeHtml } from "../ui-escape";
import { renderBadge, renderStatus } from "../ui-feedback";

export function renderPuzzleHeader({ title, difficulty, message, tone = "neutral" }: { title: string; difficulty: string; message: string; tone?: StatusTone }): string {
  return `<section class="puzzle-heading"><div><p class="eyebrow">Yokaiba Logic Dojo</p><h1>${escapeHtml(title)}</h1>${renderStatus({ message, tone })}</div>${renderBadge(difficulty, "difficulty")}</section>`;
}
