import "./style.css";
import { answerFromBoard, boardProgress, loadBoard, markBoard, parsePuzzle, saveBoard, squareKey, type Board, type Mark, type Puzzle } from "./puzzle";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing");
const root = app;

let puzzle: Puzzle | null = null;
let board: Board = {};
let loading = false;
let message = "Preparing a new dojo puzzle…";
let undoStack: Board[] = [];
let redoStack: Board[] = [];
let assist = localStorage.getItem("tako-bako.assist") === "on";
let difficultyLevel = difficultyFromUrl();
let activeGridId: string | undefined;
let usedClueIds = new Set<string>();

const markSymbol: Record<Mark, string> = { unknown: "", yes: "✓", no: "×" };
const markName: Record<Mark, string> = { unknown: "unknown", yes: "yes", no: "no" };
const escapeHtml = (value: string) => value.replace(/[&<>'"`]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;", "`": "&#96;" })[character]!);

function newSeed(): string {
  return crypto.randomUUID();
}

function dailySeed(): string {
  return `daily-${new Date().toISOString().slice(0, 10)}`;
}

function seedFromUrl(): string | undefined {
  const seed = new URL(window.location.href).searchParams.get("seed");
  return seed && /^[a-zA-Z0-9-]{1,128}$/.test(seed) ? seed : undefined;
}

function difficultyFromUrl(): number | undefined {
  const level = new URL(window.location.href).searchParams.get("difficulty");
  return level && /^[1-5]$/.test(level) ? Number(level) : undefined;
}

function setPuzzleUrl(seed: string, mode: "push" | "replace" | "none"): void {
  if (mode === "none") return;
  const url = new URL(window.location.href);
  url.searchParams.set("seed", seed);
  if (difficultyLevel) url.searchParams.set("difficulty", String(difficultyLevel)); else url.searchParams.delete("difficulty");
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
}

let currentFetchId = 0;

async function fetchPuzzle(seed = newSeed(), urlMode: "push" | "replace" | "none" = "replace"): Promise<void> {
  loading = true;
  message = "Sensei is arranging the puzzle tiles…";
  const fetchId = ++currentFetchId;
  render();
  try {
    const parameters = new URLSearchParams({ seed, ...(difficultyLevel ? { difficultyLevel: String(difficultyLevel) } : {}) });
    const endpoint = `/api/puzzle?${parameters}`;
    const result = await fetch(endpoint);
    if (!result.ok) throw new Error(result.status === 429 ? "The dojo is busy. Please wait a moment, then try again." : "The puzzle could not be collected. Please try again.");
    const data = parsePuzzle(await result.json());
    if (fetchId !== currentFetchId) return;
    puzzle = data;
    board = loadBoard(puzzle.id);
    undoStack = [];
    redoStack = [];
    activeGridId = data.spec.categories.find(category => category.id !== data.spec.baseCategory)?.id;
    usedClueIds = new Set();
    setPuzzleUrl(data.seed, urlMode);
    message = "Mark each possibility: blank, yes, or no.";
  } catch (error) {
    if (fetchId !== currentFetchId) return;
    puzzle = null;
    message = error instanceof Error ? error.message : "The puzzle could not be collected. Please try again.";
  } finally {
    if (fetchId === currentFetchId) {
      loading = false;
      render();
    }
  }
}

function saveCurrentBoard(next: Board): void {
  if (!puzzle) return;
  undoStack.push(board);
  redoStack = [];
  board = next;
  saveBoard(puzzle.id, board);
}

function restoreBoard(source: Board[], destination: Board[]): void {
  if (!puzzle || source.length === 0) return;
  destination.push(board);
  board = source.pop()!;
  saveBoard(puzzle.id, board);
  message = "Board restored.";
  render();
}

function resetBoard(): void {
  if (!puzzle || Object.keys(board).length === 0) return;
  saveCurrentBoard({});
  message = "Board reset. Your previous marks are available with Undo.";
  render();
}

async function checkAnswer(): Promise<void> {
  if (!puzzle) return;
  const answer = answerFromBoard(board, puzzle.spec);
  if (!answer) {
    message = "Finish one ✓ in every row and column before checking your solution.";
    render();
    return;
  }
  if (!puzzle.puzzleToken) {
    message = "Solution checking is temporarily unavailable for this dojo puzzle.";
    render();
    return;
  }
  loading = true;
  message = "Sensei is checking your deductions…";
  render();
  try {
    const result = await fetch("/api/puzzle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ puzzleToken: puzzle.puzzleToken, answer }),
    });
    if (!result.ok) throw new Error("Verification is unavailable");
    const response: unknown = await result.json();
    if (!response || typeof response !== "object" || typeof (response as { correct?: unknown }).correct !== "boolean") throw new Error("Invalid verification response");
    message = (response as { correct: boolean }).correct
      ? "Perfect deduction — the dojo puzzle is solved!"
      : "Not quite yet. Your notes are saved, so keep refining the grid.";
  } catch {
    message = "The dojo could not check this answer. Your board is still saved.";
  } finally {
    loading = false;
    render();
  }
}

async function sharePuzzle(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href);
    message = "Puzzle link copied — share this exact dojo challenge.";
  } catch {
    message = "Copy this page’s address to share the current puzzle.";
  }
  render();
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
  return `<section id="grid-${escapeHtml(category.id)}" role="tabpanel" aria-labelledby="grid-tab-${escapeHtml(category.id)}" class="grid-card ${category.id === activeGridId ? "is-active" : ""}" data-grid-card="${escapeHtml(category.id)}"><h3>${escapeHtml(base.label)} <span>×</span> ${escapeHtml(category.label)}</h3><div class="table-wrap"><table><thead><tr><th scope="col">${escapeHtml(base.label)}</th>${header}</tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function clueIsRelated(clue: string, category: Puzzle["spec"]["categories"][number]): boolean {
  const normalised = clue.toLocaleLowerCase();
  return category.values.some(value => normalised.includes(value.toLocaleLowerCase()));
}

function renderClues(current: Puzzle, activeCategory: Puzzle["spec"]["categories"][number]): string {
  return `<aside class="clues" aria-labelledby="clues-title"><details class="clue-drawer"><summary><span><span class="eyebrow">Sensei’s notes</span><strong>Clues</strong></span><span class="clue-count">${current.clues.length} clues</span></summary><div class="clue-content"><p class="eyebrow">Sensei’s notes</p><h2 id="clues-title">Clues</h2><p class="clue-hint">Clues mentioning ${escapeHtml(activeCategory.label)} are highlighted.</p><ol>${current.clues.map((clue, index) => `<li class="${clueIsRelated(clue.text, activeCategory) ? "is-related" : ""}"><button class="clue-used ${usedClueIds.has(clue.id) ? "is-used" : ""}" data-clue-id="${escapeHtml(clue.id)}" aria-pressed="${usedClueIds.has(clue.id)}" aria-label="Mark clue ${index + 1} as ${usedClueIds.has(clue.id) ? "unused" : "used"}">${usedClueIds.has(clue.id) ? "✓" : index + 1}</button><span>${escapeHtml(clue.text)}</span></li>`).join("")}</ol></div></details></aside>`;
}

function renderPuzzle(current: Puzzle): string {
  const base = current.spec.categories.find(category => category.id === current.spec.baseCategory);
  if (!base) throw new Error("Puzzle has no base category");
  const categories = current.spec.categories.filter(category => category.id !== base.id);
  const activeCategory = categories.find(category => category.id === activeGridId) ?? categories[0];
  activeGridId = activeCategory.id;
  const grids = categories.map(category => boardGrid(category, base)).join("");
  const canCheck = Boolean(current.puzzleToken && answerFromBoard(board, current.spec));
  const progress = boardProgress(board, current.spec);
  return `<main><section class="puzzle-heading"><div><p class="eyebrow">Yokaiba logic dojo</p><h1>${escapeHtml(current.spec.title)}</h1><p class="status" role="status">${escapeHtml(message)}</p></div><span class="difficulty" title="${escapeHtml(current.difficulty.modelVersion)}">Level ${current.difficulty.level}: ${escapeHtml(current.difficulty.label)}</span></section><section class="workspace"><div class="board-workspace"><div class="workspace-bar"><p class="progress" aria-label="Board progress">${progress.marked} / ${progress.total} squares marked</p><div class="workspace-actions"><div class="history-controls" aria-label="Board history"><button id="undo" class="icon-button" aria-label="Undo" title="Undo" ${undoStack.length === 0 || loading ? "disabled" : ""}>↶</button><button id="redo" class="icon-button" aria-label="Redo" title="Redo" ${redoStack.length === 0 || loading ? "disabled" : ""}>↷</button></div><button id="check-solution" class="primary-action" ${loading || !canCheck ? "disabled" : ""}>Check solution</button></div></div><div class="grid-tabs" role="tablist" aria-label="Choose working grid">${categories.map(category => `<button role="tab" id="grid-tab-${escapeHtml(category.id)}" aria-selected="${category.id === activeCategory.id}" aria-controls="grid-${escapeHtml(category.id)}" data-grid-tab="${escapeHtml(category.id)}">${escapeHtml(category.label)}</button>`).join("")}</div><p class="legend"><span class="legend-mark yes">✓</span> yes <span class="legend-mark no">×</span> no <span class="legend-mark unknown"></span> unknown · click or press Enter/Space to cycle</p><section class="grids" aria-label="Logic grids">${grids}</section></div>${renderClues(current, activeCategory)}</section><details class="puzzle-settings"><summary>Puzzle settings</summary><div><label class="difficulty-select">Difficulty <select id="difficulty-select"><option value="">Any</option>${[1, 2, 3, 4, 5].map(level => `<option value="${level}" ${difficultyLevel === level ? "selected" : ""}>Level ${level}</option>`).join("")}</select></label><label class="seed-entry">Seed <input id="seed-input" value="${escapeHtml(current.seed)}" maxlength="128" pattern="[a-zA-Z0-9-]+"><button id="open-seed">Open</button></label><label class="assist"><input id="assist-toggle" type="checkbox" ${assist ? "checked" : ""}> Auto-eliminate on ✓</label><button id="reset-board" class="reset-board" ${Object.keys(board).length === 0 || loading ? "disabled" : ""}>Reset board</button></div></details></main>`;
}

function render(): void {
  root.innerHTML = `<div class="page-shell"><header><a class="brand" href="/" aria-label="Tako Bako home"><span class="brand-mark" aria-hidden="true">竹</span><span>TAKO<br>BAKO</span></a><div class="header-copy"><p>Judo logic puzzles</p><small>Blank → tick → cross</small></div><div class="header-actions">${puzzle ? `<button class="share-button" id="share-puzzle" aria-label="Share puzzle" title="Share puzzle">↗</button>` : ""}<button class="new-puzzle" id="daily-puzzle" ${loading ? "disabled" : ""}>Daily dojo</button><button class="new-puzzle" id="new-puzzle" ${loading ? "disabled" : ""}>${loading ? "Setting up…" : "New puzzle"}</button></div></header>${puzzle ? renderPuzzle(puzzle) : `<main class="empty-state"><div class="pixel-knot" aria-hidden="true">柔</div><h1>Dojo doors are open</h1><p>${escapeHtml(message)}</p><button class="new-puzzle" id="retry" ${loading ? "disabled" : ""}>${loading ? "Loading…" : "Try again"}</button></main>`}<footer><span>TAKO BAKO · a cosy Yokaiba puzzle table</span><span>Shareable puzzles, gentle assists, and optional solution checking.</span></footer></div>`;
}

root.addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  if (button.id === "new-puzzle" || button.id === "retry") void fetchPuzzle(newSeed(), "push");
  if (button.id === "daily-puzzle") void fetchPuzzle(dailySeed(), "push");
  if (button.id === "check-solution") void checkAnswer();
  if (button.id === "undo") restoreBoard(undoStack, redoStack);
  if (button.id === "redo") restoreBoard(redoStack, undoStack);
  if (button.id === "reset-board") resetBoard();
  if (button.id === "share-puzzle") void sharePuzzle();
  if (button.dataset.gridTab) {
    activeGridId = button.dataset.gridTab;
    render();
  }
  if (button.dataset.clueId) {
    const clueId = button.dataset.clueId;
    if (usedClueIds.has(clueId)) usedClueIds.delete(clueId); else usedClueIds.add(clueId);
    render();
  }
  if (button.id === "open-seed") {
    const seed = root.querySelector<HTMLInputElement>("#seed-input")?.value.trim() ?? "";
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(seed)) {
      message = "Use 1–128 letters, numbers, or hyphens for a challenge seed.";
      render();
    } else void fetchPuzzle(seed, "push");
  }
  const current = puzzle;
  if (button.dataset.square && current) {
    const categoryId = button.dataset.square.split("|")[0];
    const category = current.spec.categories.find(candidate => candidate.id === categoryId);
    const base = current.spec.categories.find(candidate => candidate.id === current.spec.baseCategory);
    if (!category || !base) return;
    const key = button.dataset.square;
    saveCurrentBoard(markBoard(board, key, category, base, assist));
    render();
    root.querySelector<HTMLButtonElement>(`[data-square="${CSS.escape(key)}"]`)?.focus();
  }
});

root.addEventListener("change", event => {
  const input = event.target as HTMLInputElement;
  if (input.id !== "assist-toggle" && input.id !== "difficulty-select") return;
  if (input.id === "difficulty-select") {
    difficultyLevel = input.value ? Number(input.value) : undefined;
    message = difficultyLevel ? `Level ${difficultyLevel} selected for your next puzzle.` : "Any difficulty selected for your next puzzle.";
  } else {
    assist = input.checked;
    localStorage.setItem("tako-bako.assist", assist ? "on" : "off");
    message = assist ? "Auto-elimination is on for new ✓ marks." : "Auto-elimination is off.";
  }
  render();
});

window.addEventListener("popstate", () => {
  difficultyLevel = difficultyFromUrl();
  void fetchPuzzle(seedFromUrl() ?? newSeed(), "none");
});

render();
void fetchPuzzle(seedFromUrl() ?? newSeed(), seedFromUrl() ? "none" : "replace");
