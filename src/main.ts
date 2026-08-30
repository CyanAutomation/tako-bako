import "./style.css";
import { cycleMark, loadBoard, parsePuzzle, saveBoard, squareKey, type Board, type Mark, type Puzzle } from "./puzzle";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing");
const root = app;

let puzzle: Puzzle | null = null;
let board: Board = {};
let loading = false;
let message = "Preparing a new dojo puzzle…";

const markSymbol: Record<Mark, string> = { unknown: "", yes: "✓", no: "×" };
const markName: Record<Mark, string> = { unknown: "unknown", yes: "yes", no: "no" };
const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);

function newSeed(): string {
  return crypto.randomUUID();
}

async function fetchPuzzle(): Promise<void> {
  loading = true;
  message = "Sensei is arranging the puzzle tiles…";
  render();
  try {
    const seed = newSeed();
    const endpoint = import.meta.env.DEV ? `/api/puzzle/${seed}` : `/api/puzzle?${new URLSearchParams({ seed })}`;
    const result = await fetch(endpoint);
    if (!result.ok) throw new Error(result.status === 429 ? "The dojo is busy. Please wait a moment, then try again." : "The puzzle could not be collected. Please try again.");
    puzzle = parsePuzzle(await result.json());
    board = loadBoard(puzzle.id);
    message = "Mark each possibility: blank, yes, or no.";
  } catch (error) {
    puzzle = null;
    message = error instanceof Error ? error.message : "The puzzle could not be collected. Please try again.";
  } finally {
    loading = false;
    render();
  }
}

function boardGrid(category: Puzzle["spec"]["categories"][number], base: Puzzle["spec"]["categories"][number]): string {
  const header = category.values.map(value => `<th scope="col">${escapeHtml(value)}</th>`).join("");
  const rows = base.values.map(row => {
    const cells = category.values.map(column => {
      const key = squareKey(category.id, row, column);
      const mark = board[key] ?? "unknown";
      return `<td><button class="mark mark-${mark}" data-square="${escapeHtml(key)}" aria-label="${escapeHtml(`${row}, ${column}: ${markName[mark]}. Activate to change.`)}" aria-pressed="${mark === "yes"}"><span aria-hidden="true">${markSymbol[mark]}</span></button></td>`;
    }).join("");
    return `<tr><th scope="row">${escapeHtml(row)}</th>${cells}</tr>`;
  }).join("");
  return `<section class="grid-card"><h3>${escapeHtml(base.label)} <span>×</span> ${escapeHtml(category.label)}</h3><div class="table-wrap"><table><thead><tr><th scope="col">${escapeHtml(base.label)}</th>${header}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderPuzzle(current: Puzzle): string {
  const base = current.spec.categories.find(category => category.id === current.spec.baseCategory);
  if (!base) throw new Error("Puzzle has no base category");
  const grids = current.spec.categories.filter(category => category.id !== base.id).map(category => boardGrid(category, base)).join("");
  return `<main><section class="puzzle-heading"><div><p class="eyebrow">Yokaiba logic dojo</p><h1>${escapeHtml(current.spec.title)}</h1><p class="status" role="status">${escapeHtml(message)}</p></div><span class="difficulty" title="${escapeHtml(current.difficulty.modelVersion)}">Level ${current.difficulty.level}: ${escapeHtml(current.difficulty.label)}</span></section><section class="clues" aria-labelledby="clues-title"><div class="note-pin" aria-hidden="true"></div><p class="eyebrow">Sensei’s notes</p><h2 id="clues-title">Clues</h2><ol>${current.clues.map(clue => `<li>${escapeHtml(clue.text)}</li>`).join("")}</ol></section><p class="legend"><span class="legend-mark yes">✓</span> yes <span class="legend-mark no">×</span> no <span class="legend-mark unknown"></span> unknown · click or press Enter/Space to cycle</p><section class="grids" aria-label="Logic grids">${grids}</section></main>`;
}

function render(): void {
  root.innerHTML = `<div class="page-shell"><header><a class="brand" href="/" aria-label="Tako Bako home"><span class="brand-mark" aria-hidden="true">竹</span><span>TAKO<br>BAKO</span></a><div class="header-copy"><p>Judo logic puzzles</p><small>Blank → tick → cross</small></div><button class="new-puzzle" id="new-puzzle" ${loading ? "disabled" : ""}>${loading ? "Setting up…" : "New puzzle"}</button></header>${puzzle ? renderPuzzle(puzzle) : `<main class="empty-state"><div class="pixel-knot" aria-hidden="true">柔</div><h1>Dojo doors are open</h1><p>${escapeHtml(message)}</p><button class="new-puzzle" id="retry" ${loading ? "disabled" : ""}>${loading ? "Loading…" : "Try again"}</button></main>`}<footer><span>TAKO BAKO · a cosy Yokaiba puzzle table</span><span>No solution checking—just peaceful deduction.</span></footer></div>`;
}

root.addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  if (button.id === "new-puzzle" || button.id === "retry") void fetchPuzzle();
  if (button.dataset.square && puzzle) {
    const key = button.dataset.square;
    const next = cycleMark(board[key] ?? "unknown");
    if (next === "unknown") delete board[key]; else board[key] = next;
    saveBoard(puzzle.id, board);
    render();
    root.querySelector<HTMLButtonElement>(`[data-square="${CSS.escape(key)}"]`)?.focus();
  }
});

render();
void fetchPuzzle();
