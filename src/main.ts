import "./style.css";
import "./expert-grid.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
import "@fontsource/roboto-slab/latin-600.css";
import "@fontsource/roboto-slab/latin-700.css";
import { answerFromBoard, boardProgress, loadBoard, loadUsedClues, markBoard, parsePuzzle, saveBoard, saveUsedClues, squareKey, type Board, type Puzzle } from "./puzzle";
import { loadPuzzleFromCache, puzzleCacheKey, savePuzzleToCache } from "./puzzle-cache";
import { dailySeed } from "./daily";
import { DEFAULT_SCENARIO_ID, isScenarioId, scenarios, type ScenarioId } from "./scenarios";
import { renderBoardToolbar, renderCluePanel, renderGridWorkspace, renderPuzzleHeader, renderPuzzleSettings } from "./sections";
import { gridCellLabel, nextGridCellKey, nextTabId, renderButton, renderDialog, renderGridCard, renderGridCell, renderSelect, renderStatus } from "./ui";
import mascotUrl from "./brand/tako-bako-mascot.png";
import markUrl from "./brand/tako-bako-mark.png";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing");
const root = app;

let puzzle: Puzzle | null = null;
let board: Board = {};
let loading = false;
let message = "Choose a challenge when you are ready.";
let undoStack: Board[] = [];
let assist = localStorage.getItem("tako-bako.assist") === "on";
let difficultyLevel = difficultyFromUrl();
let templateId: ScenarioId = templateFromUrl();
let activeGridId: string | undefined;
let usedClueIds = new Set<string>();
let pendingResetGridId: string | undefined;
let pendingNewChallenge = false;
let resetReturnFocusSelector: string | undefined;
let cluesOpen = !window.matchMedia("(max-width: 860px)").matches;
let settingsOpen = false;
let activeCellKey: string | undefined;
let challengeOptionsOpen = false;

const escapeHtml = (value: string) => value.replace(/[&<>'"`]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;", "`": "&#96;" })[character]!);

function newSeed(): string {
  return crypto.randomUUID();
}

function seedFromUrl(): string | undefined {
  const seed = new URL(window.location.href).searchParams.get("seed");
  return seed && /^[a-zA-Z0-9-]{1,128}$/.test(seed) ? seed : undefined;
}

function difficultyFromUrl(): number | undefined {
  const level = new URL(window.location.href).searchParams.get("difficulty");
  return level && /^[1-5]$/.test(level) ? Number(level) : undefined;
}

function templateFromUrl(): ScenarioId {
  const template = new URL(window.location.href).searchParams.get("template");
  return isScenarioId(template) ? template : DEFAULT_SCENARIO_ID;
}

function setPuzzleUrl(seed: string, mode: "push" | "replace" | "none"): void {
  if (mode === "none") return;
  const url = new URL(window.location.href);
  url.searchParams.set("seed", seed);
  if (templateId === DEFAULT_SCENARIO_ID) url.searchParams.delete("template"); else url.searchParams.set("template", templateId);
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
    const parameters = new URLSearchParams({ seed, templateId, ...(difficultyLevel ? { difficultyLevel: String(difficultyLevel) } : {}) });
    const endpoint = `/api/puzzle?${parameters}`;
    let data: Puzzle | undefined;
    const cached = loadPuzzleFromCache<unknown>(sessionStorage, seed, difficultyLevel, Date.now(), templateId);
    if (cached) {
      try {
        data = parsePuzzle(cached);
      } catch {
        sessionStorage.removeItem(puzzleCacheKey(seed, difficultyLevel, templateId));
      }
    }
    if (!data) {
      const result = await fetch(endpoint);
      if (!result.ok) throw new Error(result.status === 429 ? retryAfterMessage(result.headers.get("retry-after")) : "The puzzle could not be collected. Please try again.");
      try {
        data = parsePuzzle(await result.json());
        savePuzzleToCache(sessionStorage, seed, difficultyLevel, data, Date.now(), templateId);
      } catch (error) {
        console.error("tako_bako_client_metric", { event: "puzzle_parse_failed", error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
    if (fetchId !== currentFetchId) return;
    puzzle = data;
    board = loadBoard(puzzle.id);
    undoStack = [];
    activeGridId = data.spec.categories.find(category => category.id !== data.spec.baseCategory)?.id;
    const base = data.spec.categories.find(category => category.id === data.spec.baseCategory);
    const active = data.spec.categories.find(category => category.id === activeGridId);
    activeCellKey = base && active ? squareKey(active.id, base.values[0]!, active.values[0]!) : undefined;
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

function retryAfterMessage(value: string | null): string {
  if (!value) return "The dojo is busy. Please wait a moment, then try again.";
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return `The dojo is busy. Try again in ${Math.ceil(seconds)} second${Math.ceil(seconds) === 1 ? "" : "s"}.`;
  const retryAt = Date.parse(value);
  if (Number.isFinite(retryAt)) {
    const remaining = Math.max(1, Math.ceil((retryAt - Date.now()) / 1_000));
    return `The dojo is busy. Try again in ${remaining} second${remaining === 1 ? "" : "s"}.`;
  }
  return "The dojo is busy. Please wait a moment, then try again.";
}

function saveCurrentBoard(next: Board): void {
  if (!puzzle) return;
  undoStack.push(board);
  board = next;
  saveBoard(puzzle.id, board);
}

function restoreBoard(): void {
  if (!puzzle || undoStack.length === 0) return;
  board = undoStack.pop()!;
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
  const header = category.values.map(value => `<th scope="col">${escapeHtml(value)}</th>`).join("");
  const rows = base.values.map(row => {
    const cells = category.values.map(column => {
      const key = squareKey(category.id, row, column);
      const mark = board[key] ?? "unknown";
      return renderGridCell({ key, row, column, mark, tabIndex: key === activeCellKey ? 0 : -1 });
    }).join("");
    return `<tr><th scope="row">${escapeHtml(row)}</th>${cells}</tr>`;
  }).join("");
  return renderGridCard({
    id: category.id,
    label: `${base.label} × ${category.label}`,
    active: category.id === activeGridId,
    locked: false,
    controls: renderButton({ id: `grid-reset-${category.id}`, label: `Reset ${category.label} grid`, icon: "reset", disabled: !Object.keys(board).some(key => key.split("|")[0] === category.id), data: { gridReset: category.id } }),
    content: `<div class="table-wrap"><table><thead><tr><th scope="col">${escapeHtml(base.label)}</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>`,
  });
}

function renderResetModal(current: Puzzle): string {
  if (!pendingResetGridId) return "";
  const category = current.spec.categories.find(candidate => candidate.id === pendingResetGridId);
  if (!category) return "";
  return `<div class="modal-backdrop">${renderDialog({ id: "reset-grid", eyebrow: "Reset grid", title: `Clear ${category.label}?`, description: "This clears every tick and cross in this grid. You can still use Undo afterwards.", actions: `${renderButton({ id: "cancel-grid-reset", label: "Cancel" })}${renderButton({ id: "confirm-grid-reset", label: "Reset grid", variant: "danger" })}` })}</div>`;
}

function renderNewChallengeModal(): string {
  if (!pendingNewChallenge) return "";
  return `<div class="modal-backdrop">${renderDialog({ id: "new-challenge", eyebrow: "New challenge", title: "Leave this puzzle?", description: "Your marks are saved, but you will start a different puzzle.", actions: `${renderButton({ id: "cancel-new-challenge", label: "Keep solving" })}${renderButton({ id: "confirm-new-challenge", label: "Start new challenge", variant: "primary" })}` })}</div>`;
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

function renderScenarioPicker(): string {
  return renderSelect({
    id: "scenario-select",
    label: "Puzzle scenario",
    ariaLabel: "Puzzle scenario",
    options: scenarios.map(scenario => ({ id: scenario.id, label: scenario.label })),
    selectedId: templateId,
    className: "difficulty-select",
  });
}

function renderChallengeOptions(): string {
  return `<details class="challenge-options" ${challengeOptionsOpen ? "open" : ""}><summary>Choose challenge</summary><div>${renderScenarioPicker()}${renderDifficultyPicker()}${renderButton({ id: "daily-puzzle", label: "Play today’s challenge", disabled: loading })}<label class="seed-entry">Open a shared puzzle <input id="landing-seed-input" maxlength="128" pattern="[a-zA-Z0-9-]+">${renderButton({ id: "open-landing-seed", label: "Open" })}</label></div></details>`;
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
  return `<main>${renderPuzzleHeader({ title: current.spec.title, difficulty: `Level ${current.difficulty.level}: ${current.difficulty.label}`, message })}<section class="workspace">${renderGridWorkspace({ categories, activeGridId: activeCategory.id, toolbar: renderBoardToolbar({ marked: progress.marked, total: progress.total, undoDisabled: undoStack.length === 0 || loading, checkDisabled: loading || !canCheck }), grids })}${renderCluePanel({ clues: current.clues, activeCategory, cluesOpen, usedClueIds })}</section>${renderPuzzleSettings({ seed: current.requestedSeed, settingsOpen, assist })}</main>${renderResetModal(current)}${renderNewChallengeModal()}`;
}

function render(): void {
  root.innerHTML = `<div class="page-shell"><header><a class="brand" href="/" aria-label="Tako Bako home"><span class="brand-mark"><img src="${mascotUrl}" alt="" aria-hidden="true"></span><span class="brand-lockup"><strong>Tako Bako</strong><span>Logic puzzles</span><small>Mark · Deduce · Solve</small></span></a>${puzzle ? `<div class="header-actions">${renderButton({ id: "share-puzzle", label: "Share puzzle", icon: "share" })}${renderChallengeOptions()}${renderButton({ id: "new-puzzle", label: loading ? "Setting up…" : "New challenge", variant: "secondary", disabled: loading })}</div>` : ""}</header>${puzzle ? renderPuzzle(puzzle) : `<main class="landing-state"><section class="landing-copy"><p class="eyebrow">Yokaiba logic dojo</p><h1>A small puzzle.<br>A satisfying solve.</h1><p>Mark possibilities, eliminate the impossible, and uncover the one arrangement that fits every clue.</p>${renderStatus({ message, tone: message.includes("could not") || message.includes("busy") ? "error" : "neutral" })}${renderButton({ id: "start-puzzle", label: loading ? "Preparing challenge…" : "Start a challenge", variant: "primary", disabled: loading })}${renderChallengeOptions()}</section><aside class="landing-preview" aria-label="Puzzle preview"><p class="eyebrow">What you’ll solve</p><h2>Tournament Order</h2><div class="preview-grid" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span class="yes">✓</span><span></span><span></span><span></span><span></span><span class="no">×</span><span></span><span></span><span></span><span></span><span></span></div><p>3–8 minutes <span>Level 3 · Moderate</span></p></aside></main>`}<footer><span class="footer-brand"><img src="${markUrl}" alt="" aria-hidden="true"><span>TAKO BAKO · Yokaiba logic puzzles</span></span><span>Shareable puzzles, optional assists, and solution checking.</span></footer></div>`;
}

function focusGridCell(key: string): void {
  const current = root.querySelector<HTMLButtonElement>(`[data-square="${CSS.escape(activeCellKey ?? "")}"]`);
  const next = root.querySelector<HTMLButtonElement>(`[data-square="${CSS.escape(key)}"]`);
  if (!next || next.disabled) return;
  current?.setAttribute("tabindex", "-1");
  next.setAttribute("tabindex", "0");
  activeCellKey = key;
  next.focus();
}

/** Updates only the cells and board controls changed by a mark, preserving the live grid DOM. */
function updateBoardView(previous: Board, current: Puzzle): void {
  const base = current.spec.categories.find(category => category.id === current.spec.baseCategory);
  if (!base) return;
  const changedKeys = new Set([...Object.keys(previous), ...Object.keys(board)].filter(key => previous[key] !== board[key]));
  for (const key of changedKeys) {
    const [, encodedRow, encodedColumn] = key.split("|");
    const category = current.spec.categories.find(candidate => candidate.id === key.split("|")[0]);
    if (!category || !encodedRow || !encodedColumn || category.id === base.id) continue;
    const row = decodeURIComponent(encodedRow);
    const column = decodeURIComponent(encodedColumn);
    const mark = board[key] ?? "unknown";
    const cell = root.querySelector<HTMLButtonElement>(`[data-square="${CSS.escape(key)}"]`);
    if (!cell) continue;
    cell.className = `mark mark-${mark}`;
    cell.setAttribute("aria-label", gridCellLabel(row, column, mark));
    const symbol = cell.querySelector("span");
    if (symbol) symbol.textContent = mark === "yes" ? "✓" : mark === "no" ? "×" : "";
  }
  const progress = boardProgress(board, current.spec);
  const progressElement = root.querySelector<HTMLElement>(".progress");
  if (progressElement) progressElement.textContent = `${progress.marked} / ${progress.total} squares marked`;
  const check = root.querySelector<HTMLButtonElement>("#check-solution");
  if (check) check.disabled = loading || !current.puzzleToken || !answerFromBoard(board, current.spec);
  for (const category of current.spec.categories) {
    if (category.id === base.id) continue;
    const reset = root.querySelector<HTMLButtonElement>(`#grid-reset-${CSS.escape(category.id)}`);
    if (reset) reset.disabled = !Object.keys(board).some(key => key.split("|")[0] === category.id);
  }
}

function selectGrid(gridId: string, focus = false): void {
  if (!puzzle || activeGridId === gridId) return;
  activeGridId = gridId;
  const base = puzzle.spec.categories.find(category => category.id === puzzle!.spec.baseCategory);
  const category = puzzle.spec.categories.find(candidate => candidate.id === gridId);
  activeCellKey = base && category ? squareKey(category.id, base.values[0]!, category.values[0]!) : undefined;
  message = "Grid selected and ready for marking.";
  render();
  if (focus) root.querySelector<HTMLButtonElement>(`[data-grid-tab="${CSS.escape(gridId)}"]`)?.focus();
}

root.addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  if (button.id === "start-puzzle") void fetchPuzzle(newSeed(), "push");
  if (button.id === "new-puzzle") {
    if (Object.keys(board).length === 0) void fetchPuzzle(newSeed(), "push");
    else {
      pendingNewChallenge = true;
      render();
      root.querySelector<HTMLButtonElement>("#cancel-new-challenge")?.focus();
    }
  }
  if (button.id === "daily-puzzle") void fetchPuzzle(dailySeed(), "push");
  if (button.id === "check-solution") void checkAnswer();
  if (button.id === "undo") restoreBoard();
  if (button.id === "cancel-grid-reset") {
    dismissResetDialog();
  }
  if (button.id === "confirm-grid-reset" && pendingResetGridId) resetGrid(pendingResetGridId);
  if (button.id === "cancel-new-challenge") {
    pendingNewChallenge = false;
    render();
    root.querySelector<HTMLButtonElement>("#new-puzzle")?.focus();
  }
  if (button.id === "confirm-new-challenge") {
    pendingNewChallenge = false;
    void fetchPuzzle(newSeed(), "push");
  }
  if (button.id === "share-puzzle") void sharePuzzle();
  if (button.id === "assist-toggle") {
    assist = !assist;
    localStorage.setItem("tako-bako.assist", assist ? "on" : "off");
    message = assist ? "Auto-elimination is on for new ✓ marks." : "Auto-elimination is off.";
    render();
    root.querySelector<HTMLButtonElement>("#assist-toggle")?.focus();
    return;
  }
  if (button.dataset.gridTab) {
    selectGrid(button.dataset.gridTab);
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
  if (button.id === "open-seed" || button.id === "open-landing-seed") {
    const seed = root.querySelector<HTMLInputElement>(button.id === "open-seed" ? "#seed-input" : "#landing-seed-input")?.value.trim() ?? "";
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
    const previous = board;
    saveCurrentBoard(markBoard(board, key, category, base, assist));
    updateBoardView(previous, current);
    focusGridCell(key);
  }
});

root.addEventListener("keydown", event => {
  if (pendingResetGridId || pendingNewChallenge) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (pendingResetGridId) dismissResetDialog();
      if (pendingNewChallenge) {
        pendingNewChallenge = false;
        render();
        root.querySelector<HTMLButtonElement>("#new-puzzle")?.focus();
      }
      return;
    }
    if (event.key === "Tab") {
      const dialog = root.querySelector<HTMLDialogElement>(pendingResetGridId ? "#reset-grid" : "#new-challenge");
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
  const cell = (event.target as Element).closest<HTMLButtonElement>("button[data-square]");
  if (cell && puzzle && !cell.disabled && cell.dataset.square) {
    const category = puzzle.spec.categories.find(candidate => candidate.id === cell.dataset.square!.split("|")[0]);
    const base = puzzle.spec.categories.find(candidate => candidate.id === puzzle!.spec.baseCategory);
    if (category && base) {
      const nextKey = nextGridCellKey({ categoryId: category.id, rows: base.values, columns: category.values, key: cell.dataset.square, keyName: event.key });
      if (nextKey) {
        event.preventDefault();
        focusGridCell(nextKey);
        return;
      }
    }
  }
  const tab = (event.target as Element).closest<HTMLButtonElement>("button[data-grid-tab]");
  if (!tab || !puzzle || !tab.dataset.gridTab) return;
  const categories = puzzle.spec.categories.filter(category => category.id !== puzzle!.spec.baseCategory);
  const nextGridId = nextTabId(categories, tab.dataset.gridTab, event.key);
  if (!nextGridId) return;
  event.preventDefault();
  selectGrid(nextGridId, true);
});

root.addEventListener("toggle", event => {
  const details = event.target as HTMLDetailsElement;
  if (details.classList.contains("clue-drawer")) cluesOpen = details.open;
  if (details.classList.contains("puzzle-settings")) settingsOpen = details.open;
  if (details.classList.contains("challenge-options")) challengeOptionsOpen = details.open;
}, true);

root.addEventListener("change", event => {
  const input = event.target as HTMLInputElement;
  if (input.id === "grid-select") {
    selectGrid(input.value);
    return;
  }
  if (input.id === "scenario-select") {
    if (!isScenarioId(input.value)) return;
    templateId = input.value;
    void fetchPuzzle(seedFromUrl() ?? newSeed(), "push");
    return;
  }
  if (input.id !== "difficulty-select") return;
  if (input.id === "difficulty-select") {
    difficultyLevel = input.value ? Number(input.value) : undefined;
    // Reuse the shareable seed rather than Yokaiba's derived internal seed.
    void fetchPuzzle(seedFromUrl() ?? newSeed(), "push");
    return;
  }
});

window.addEventListener("popstate", () => {
  difficultyLevel = difficultyFromUrl();
  templateId = templateFromUrl();
  void fetchPuzzle(seedFromUrl() ?? newSeed(), "none");
});

render();
if (seedFromUrl()) void fetchPuzzle(seedFromUrl()!, "none");
