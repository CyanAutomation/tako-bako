import "./style.css";
import { answerFromBoard, boardProgress, loadBoard, loadUsedClues, markBoard, parsePuzzle, saveBoard, saveUsedClues, squareKey, type Board, type Mark, type Puzzle } from "./puzzle";
import { nextTabId, renderButton, renderDialog, renderGridCard, renderSelect, renderTabs } from "./ui";

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
let unlockedGridId: string | undefined;
let usedClueIds = new Set<string>();
let pendingResetGridId: string | undefined;
let resetReturnFocusSelector: string | undefined;
let cluesOpen = true;
let settingsOpen = false;

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
    unlockedGridId = activeGridId;
    usedClueIds = loadUsedClues(data.id, data.clues.map(clue => clue.id));
    // Keep the requested seed in the URL: Yokaiba may derive a different
    // internal seed while searching for the chosen difficulty level.
    setPuzzleUrl(seed, urlMode);
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

function resetGrid(categoryId: string): void {
  if (!puzzle) return;
  const next = Object.fromEntries(Object.entries(board).filter(([key]) => key.split("|")[0] !== categoryId)) as Board;
  if (Object.keys(next).length === Object.keys(board).length) return;
  saveCurrentBoard(next);
  pendingResetGridId = undefined;
  message = "Grid reset. Your previous marks are available with Undo.";
  render();
  restoreResetFocus();
}

function restoreResetFocus(): void {
  const selector = resetReturnFocusSelector;
  resetReturnFocusSelector = undefined;
  if (!selector) return;
  requestAnimationFrame(() => root.querySelector<HTMLButtonElement>(selector)?.focus());
}

function openResetDialog(categoryId: string, returnFocusId: string): void {
  pendingResetGridId = categoryId;
  resetReturnFocusSelector = `#${CSS.escape(returnFocusId)}`;
  render();
  root.querySelector<HTMLButtonElement>("#cancel-grid-reset")?.focus();
}

function dismissResetDialog(): void {
  pendingResetGridId = undefined;
  render();
  restoreResetFocus();
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
  const locked = category.id !== unlockedGridId;
  const header = category.values.map(value => `<th scope="col">${escapeHtml(value)}</th>`).join("");
  const rows = base.values.map(row => {
    const cells = category.values.map(column => {
      const key = squareKey(category.id, row, column);
      const mark = board[key] ?? "unknown";
      return `<td><button class="mark mark-${mark}" data-square="${escapeHtml(key)}" aria-label="${escapeHtml(`${row}, ${column}: ${markName[mark]}.${locked ? " Grid locked." : " Select to change."}`)}"${locked ? " disabled" : ""}><span aria-hidden="true">${markSymbol[mark]}</span></button></td>`;
    }).join("");
    return `<tr><th scope="row">${escapeHtml(row)}</th>${cells}</tr>`;
  }).join("");
  return renderGridCard({
    id: category.id,
    label: `${base.label} × ${category.label}`,
    active: category.id === activeGridId,
    locked,
    controls: `${renderButton({ id: `grid-lock-${category.id}`, label: locked ? `Unlock ${category.label} grid` : `Lock ${category.label} grid`, icon: locked ? "🔒" : "🔓", pressed: !locked, data: { gridLock: category.id } })}${renderButton({ id: `grid-reset-${category.id}`, label: `Reset ${category.label} grid`, icon: "↺", disabled: !Object.keys(board).some(key => key.split("|")[0] === category.id), data: { gridReset: category.id } })}`,
    content: `<div class="table-wrap"><table><thead><tr><th scope="col">${escapeHtml(base.label)}</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>`,
  });
}

function renderResetModal(current: Puzzle): string {
  if (!pendingResetGridId) return "";
  const category = current.spec.categories.find(candidate => candidate.id === pendingResetGridId);
  if (!category) return "";
  return `<div class="modal-backdrop">${renderDialog({ id: "reset-grid", eyebrow: "Reset grid", title: `Clear ${category.label}?`, description: "This clears every tick and cross in this grid. You can still use Undo afterwards.", actions: `${renderButton({ id: "cancel-grid-reset", label: "Cancel" })}${renderButton({ id: "confirm-grid-reset", label: "Reset grid", variant: "danger" })}` })}</div>`;
}

function clueIsRelated(clue: string, category: Puzzle["spec"]["categories"][number]): boolean {
  const normalised = clue.toLocaleLowerCase();
  return category.values.some(value => normalised.includes(value.toLocaleLowerCase()));
}

function renderClues(current: Puzzle, activeCategory: Puzzle["spec"]["categories"][number]): string {
  return `<aside class="clues" aria-labelledby="clues-title"><details class="clue-drawer" ${cluesOpen ? "open" : ""}><summary><span><span class="eyebrow">Sensei’s notes</span><strong>Clues</strong></span><span class="clue-count">${current.clues.length} clues</span></summary><div class="clue-content"><p class="eyebrow">Sensei’s notes</p><h2 id="clues-title">Clues</h2><p class="clue-hint">Clues mentioning ${escapeHtml(activeCategory.label)} are highlighted.</p><ol>${current.clues.map((clue, index) => `<li class="${clueIsRelated(clue.text, activeCategory) ? "is-related" : ""}"><button class="clue-used ${usedClueIds.has(clue.id) ? "is-used" : ""}" data-clue-id="${escapeHtml(clue.id)}" aria-pressed="${usedClueIds.has(clue.id)}" aria-label="Mark clue ${index + 1} as ${usedClueIds.has(clue.id) ? "unused" : "used"}">${usedClueIds.has(clue.id) ? "✓" : index + 1}</button><span>${escapeHtml(clue.text)}</span></li>`).join("")}</ol></div></details></aside>`;
}

function renderDifficultyPicker(): string {
  return renderSelect({
    id: "difficulty-select",
    label: "Difficulty",
    ariaLabel: "Puzzle difficulty",
    options: [{ id: "", label: "Any" }, ...[1, 2, 3, 4, 5].map(level => ({ id: String(level), label: `Level ${level}` }))],
    selectedId: difficultyLevel ? String(difficultyLevel) : "",
    className: "difficulty-select",
  });
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
  return `<main><section class="puzzle-heading"><div><p class="eyebrow">Yokaiba logic dojo</p><h1>${escapeHtml(current.spec.title)}</h1><p class="status" role="status">${escapeHtml(message)}</p></div><span class="difficulty" title="${escapeHtml(current.difficulty.modelVersion)}">Level ${current.difficulty.level}: ${escapeHtml(current.difficulty.label)}</span></section><section class="workspace"><div class="board-workspace"><div class="workspace-bar"><p class="progress" aria-label="Board progress">${progress.marked} / ${progress.total} squares marked</p><div class="workspace-actions"><div class="history-controls" aria-label="Board history">${renderButton({ id: "undo", label: "Undo", icon: "↶", disabled: undoStack.length === 0 || loading })}${renderButton({ id: "redo", label: "Redo", icon: "↷", disabled: redoStack.length === 0 || loading })}</div>${renderButton({ id: "check-solution", label: "Check solution", variant: "primary", disabled: loading || !canCheck })}</div></div>${renderTabs(categories, activeCategory.id)}<p class="legend"><span class="legend-mark yes">✓</span> yes <span class="legend-mark no">×</span> no <span class="legend-mark unknown"></span> unknown · choose or unlock a grid to mark it</p><section class="grids" aria-label="Logic grids">${grids}</section></div>${renderClues(current, activeCategory)}</section><details class="puzzle-settings" ${settingsOpen ? "open" : ""}><summary>Puzzle settings</summary><div><label class="seed-entry">Seed <input id="seed-input" value="${escapeHtml(current.seed)}" maxlength="128" pattern="[a-zA-Z0-9-]+">${renderButton({ id: "open-seed", label: "Open" })}</label><label class="assist"><input id="assist-toggle" type="checkbox" ${assist ? "checked" : ""}> Auto-eliminate on ✓</label></div></details></main>${renderResetModal(current)}`;
}

function render(): void {
  root.innerHTML = `<div class="page-shell"><header><a class="brand" href="/" aria-label="Tako Bako home"><span class="brand-mark" aria-hidden="true">竹</span><span>TAKO<br>BAKO</span></a><div class="header-copy"><p>Judo logic puzzles</p><small>Blank → tick → cross</small></div><div class="header-actions">${puzzle ? renderButton({ id: "share-puzzle", label: "Share puzzle", icon: "↗" }) : ""}${renderDifficultyPicker()}${renderButton({ id: "daily-puzzle", label: "Daily dojo", disabled: loading })}${renderButton({ id: "new-puzzle", label: loading ? "Setting up…" : "New puzzle", disabled: loading })}</div></header>${puzzle ? renderPuzzle(puzzle) : `<main class="empty-state"><div class="pixel-knot" aria-hidden="true">柔</div><h1>Dojo doors are open</h1><p>${escapeHtml(message)}</p>${renderButton({ id: "retry", label: loading ? "Loading…" : "Try again", disabled: loading })}</main>`}<footer><span>TAKO BAKO · a cosy Yokaiba puzzle table</span><span>Shareable puzzles, gentle assists, and optional solution checking.</span></footer></div>`;
}

function selectGrid(gridId: string, focus = false): void {
  if (!puzzle || activeGridId === gridId) return;
  activeGridId = gridId;
  unlockedGridId = gridId;
  message = "Grid selected and ready for marking.";
  render();
  if (focus) root.querySelector<HTMLButtonElement>(`[data-grid-tab="${CSS.escape(gridId)}"]`)?.focus();
}

root.addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  if (button.id === "new-puzzle" || button.id === "retry") void fetchPuzzle(newSeed(), "push");
  if (button.id === "daily-puzzle") void fetchPuzzle(dailySeed(), "push");
  if (button.id === "check-solution") void checkAnswer();
  if (button.id === "undo") restoreBoard(undoStack, redoStack);
  if (button.id === "redo") restoreBoard(redoStack, undoStack);
  if (button.id === "cancel-grid-reset") {
    dismissResetDialog();
  }
  if (button.id === "confirm-grid-reset" && pendingResetGridId) resetGrid(pendingResetGridId);
  if (button.id === "share-puzzle") void sharePuzzle();
  if (button.dataset.gridTab) {
    selectGrid(button.dataset.gridTab);
  }
  if (button.dataset.gridLock) {
    const gridId = button.dataset.gridLock;
    unlockedGridId = unlockedGridId === gridId ? undefined : gridId;
    activeGridId = gridId;
    message = unlockedGridId ? "Grid unlocked for marking." : "All grids are locked.";
    render();
  }
  if (button.dataset.gridReset) {
    openResetDialog(button.dataset.gridReset, button.id);
  }
  if (button.dataset.clueId) {
    const clueId = button.dataset.clueId;
    if (usedClueIds.has(clueId)) usedClueIds.delete(clueId); else usedClueIds.add(clueId);
    if (puzzle) saveUsedClues(puzzle.id, usedClueIds);
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
    if (!category || !base || category.id !== unlockedGridId) return;
    const key = button.dataset.square;
    saveCurrentBoard(markBoard(board, key, category, base, assist));
    render();
    root.querySelector<HTMLButtonElement>(`[data-square="${CSS.escape(key)}"]`)?.focus();
  }
});

root.addEventListener("keydown", event => {
  if (pendingResetGridId) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismissResetDialog();
      return;
    }
    if (event.key === "Tab") {
      const dialog = root.querySelector<HTMLDialogElement>("#reset-grid");
      const focusable = [...(dialog?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])") ?? [])];
      if (focusable.length > 0) {
        const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
        const nextIndex = event.shiftKey ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1) : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
        event.preventDefault();
        focusable[nextIndex]?.focus();
      }
      return;
    }
  }
  const button = (event.target as Element).closest<HTMLButtonElement>("button[data-grid-tab]");
  if (!button || !puzzle || !button.dataset.gridTab) return;
  const categories = puzzle.spec.categories.filter(category => category.id !== puzzle!.spec.baseCategory);
  const nextGridId = nextTabId(categories, button.dataset.gridTab, event.key);
  if (!nextGridId) return;
  event.preventDefault();
  selectGrid(nextGridId, true);
});

root.addEventListener("toggle", event => {
  const details = event.target as HTMLDetailsElement;
  if (details.classList.contains("clue-drawer")) cluesOpen = details.open;
  if (details.classList.contains("puzzle-settings")) settingsOpen = details.open;
}, true);

root.addEventListener("change", event => {
  const input = event.target as HTMLInputElement;
  if (input.id === "grid-select") {
    selectGrid(input.value);
    return;
  }
  if (input.id !== "assist-toggle" && input.id !== "difficulty-select") return;
  if (input.id === "difficulty-select") {
    difficultyLevel = input.value ? Number(input.value) : undefined;
    // Reuse the shareable seed rather than Yokaiba's derived internal seed.
    void fetchPuzzle(seedFromUrl() ?? newSeed(), "push");
    return;
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
