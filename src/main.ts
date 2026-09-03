import "./style.css";
import "./expert-grid.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
import "@fontsource/roboto-slab/latin-600.css";
import "@fontsource/roboto-slab/latin-700.css";
import { answerFromBoard, boardProgress, loadBoard, loadUsedClues, markBoard, parsePuzzle, saveBoard, saveUsedClues, squareKey, type Board, type Puzzle } from "./puzzle";
import { loadPuzzleFromCache, puzzleCacheKey, savePuzzleToCache } from "./puzzle-cache";
import { dailySeed } from "./daily";
import { DEFAULT_SCENARIO_ID, scenarioIdFromUrl, type ScenarioId } from "./scenarios";
import { courseFor, courseProgressLabel, firstAvailableCourse, nextCourse, puzzleParametersForCourse, type Course } from "./curriculum";
import { completeCourse, loadProgress, saveProgress, shouldAdvanceProgress } from "./progress";
import { renderBoardToolbar, renderCluePanel, renderCurriculum, renderGridWorkspace, renderPuzzleHeader, type ClueFilter } from "./sections";
import { gridCellLabel, nextGridCellKey, nextTabId, renderBadge, renderButton, renderDialog, renderGridCard, renderGridCell, renderStatus } from "./ui";
import mascotUrl from "./brand/tako-bako-mascot-512.png";
import markUrl from "./brand/tako-bako-mark-512.png";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing");
const root = app;

let puzzle: Puzzle | null = null;
let board: Board = {};
let loading = false;
let message = "Choose a challenge when you are ready.";
let undoStack: Board[] = [];
let assist = localStorage.getItem("tako-bako.assist") === "on";
type PlayMode = "challenge" | "shared";

let progress = loadProgress(localStorage);
let playMode: PlayMode = modeFromUrl();
let activeCourse: Course = courseFromUrl() ?? firstAvailableCourse(progress.completed);
let difficultyLevel = playMode === "challenge" ? activeCourse.difficultyLevel : difficultyFromUrl();
let templateId: ScenarioId = playMode === "challenge" ? activeCourse.templateId : templateFromUrl();
let activeGridId: string | undefined;
let usedClueIds = new Set<string>();
let pendingResetGridId: string | undefined;
let pendingNewChallenge = false;
let pendingCelebration = false;
let resetReturnFocusSelector: string | undefined;
let cluesOpen = !window.matchMedia("(max-width: 860px)").matches;
let clueFilter: ClueFilter = "all";
let activeCellKey: string | undefined;
let challengeOptionsOpen = false;

const escapeHtml = (value: string) => value.replace(/[&<>'"`]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;", "`": "&#96;" })[character]!);

function newSeed(): string {
  return crypto.randomUUID();
}

function startCourse(course: Course, seed = newSeed(), urlMode: "push" | "replace" | "none" = "push"): void {
  challengeOptionsOpen = false;
  activeCourse = course;
  playMode = "challenge";
  ({ templateId, difficultyLevel } = puzzleParametersForCourse(course));
  void fetchPuzzle(seed, urlMode);
}

function openSharedPuzzle(seed: string): void {
  challengeOptionsOpen = false;
  playMode = "shared";
  templateId = templateFromUrl();
  difficultyLevel = difficultyFromUrl();
  void fetchPuzzle(seed, "push");
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
  return scenarioIdFromUrl(template) ?? DEFAULT_SCENARIO_ID;
}

function modeFromUrl(): PlayMode {
  const parameters = new URL(window.location.href).searchParams;
  if (parameters.get("mode") === "challenge") return "challenge";
  return parameters.has("seed") ? "shared" : "challenge";
}

function courseFromUrl(): Course | undefined {
  const parameters = new URL(window.location.href).searchParams;
  return courseFor(parameters.get("tier") ?? undefined, Number(parameters.get("level")) || undefined);
}

function setPuzzleUrl(seed: string, mode: "push" | "replace" | "none"): void {
  if (mode === "none") return;
  const url = new URL(window.location.href);
  url.searchParams.set("seed", seed);
  url.searchParams.set("mode", playMode);
  if (playMode === "challenge") {
    url.searchParams.set("tier", activeCourse.tier);
    url.searchParams.set("level", String(activeCourse.level));
    url.searchParams.delete("template");
    url.searchParams.delete("difficulty");
  } else {
    url.searchParams.delete("tier");
    url.searchParams.delete("level");
    if (templateId === DEFAULT_SCENARIO_ID) url.searchParams.delete("template"); else url.searchParams.set("template", templateId);
    if (difficultyLevel) url.searchParams.set("difficulty", String(difficultyLevel)); else url.searchParams.delete("difficulty");
  }
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
    if ((response as { correct: boolean }).correct) {
      if (shouldAdvanceProgress(playMode)) {
        progress = completeCourse(progress, activeCourse.id);
        saveProgress(localStorage, progress);
        const next = nextCourse(activeCourse);
        message = next ? `Perfect deduction — ${activeCourse.label} complete. ${next.label} is now unlocked!` : "Perfect deduction — you have completed every Puzzle Challenge level!";
      } else message = "Perfect deduction — this shared puzzle is solved! Start Puzzle Challenge to advance your course.";
      pendingCelebration = true;
    } else message = "Not quite yet. Your notes are saved, so keep refining the grid.";
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

function renderMascotNote({ title, copy, mood = "ready" }: { title: string; copy: string; mood?: "ready" | "celebrate" }): string {
  return `<aside class="mascot-note mascot-note--${mood}" aria-label="Tako Bako note"><img src="${mascotUrl}" alt="Tako Bako mascot"><div><p class="eyebrow">Tako Bako says</p><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p></div></aside>`;
}

function renderCelebrationModal(): string {
  if (!pendingCelebration) return "";
  const next = playMode === "challenge" ? nextCourse(activeCourse) : undefined;
  const title = playMode === "challenge" ? "A fresh stamp for your book!" : "Puzzle solved!";
  const copy = next ? `${next.label} is ready whenever you are.` : playMode === "challenge" ? "Your Puzzle Challenge course is complete. Wonderful work!" : "Your deductions were spot on. Share the puzzle or try a new one.";
  const actions = next ? `${renderButton({ id: "celebration-close", label: "Keep exploring" })}${renderButton({ id: "celebration-continue", label: `Start ${next.label}`, variant: "primary" })}` : renderButton({ id: "celebration-close", label: "Keep exploring", variant: "primary" });
  return `<div class="modal-backdrop celebration-backdrop">${renderDialog({ id: "celebration", className: "celebration-dialog", eyebrow: "Solved!", title, description: copy, content: renderMascotNote({ title: "Excellent deduction!", copy: "A little focus, a little logic, and every tile found its place.", mood: "celebrate" }), actions })}</div>`;
}

function renderChallengeOptions(): string {
  if (!challengeOptionsOpen) return "";
  const content = `${renderCurriculum({ completed: new Set(progress.completed), currentCourseId: activeCourse.id, showHeading: false })}<div class="challenge-extras"><p>Today’s Puzzle Challenge uses your current course level and can unlock the next one.</p>${renderButton({ id: "daily-puzzle", label: "Play today’s challenge", disabled: loading })}<label class="seed-entry">Open a shared puzzle <input id="landing-seed-input" maxlength="128" pattern="[a-zA-Z0-9-]+">${renderButton({ id: "open-landing-seed", label: "Open" })}</label></div>`;
  return `<div class="modal-backdrop course-menu-backdrop">${renderDialog({ id: "challenge-menu-dialog", className: "course-dialog", eyebrow: "Your route through the dojo", title: "Puzzle Challenge", description: "Complete each level to unlock the next.", content, actions: `${renderButton({ id: "close-challenge-menu", label: "Close" })}` })}</div>`;
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
  const title = playMode === "challenge" ? activeCourse.label : current.spec.title;
  const courseLabel = playMode === "challenge" ? `${activeCourse.tier[0]!.toUpperCase()}${activeCourse.tier.slice(1)} · Level ${activeCourse.level}` : `Shared · Level ${current.difficulty.level}`;
  return `<main>${renderPuzzleHeader({ title, difficulty: courseLabel, message })}<section class="workspace">${renderGridWorkspace({ categories, activeGridId: activeCategory.id, toolbar: renderBoardToolbar({ marked: progress.marked, total: progress.total, undoDisabled: undoStack.length === 0 || loading, checkDisabled: loading || !canCheck, assist }), grids })}${renderCluePanel({ clues: current.clues, activeCategory, cluesOpen, usedClueIds, clueFilter })}</section></main>${renderResetModal(current)}${renderNewChallengeModal()}${renderCelebrationModal()}`;
}

function render(): void {
  root.innerHTML = `<div class="page-shell"><header><a class="brand" href="/" aria-label="Tako Bako home"><span class="brand-mark"><img src="${mascotUrl}" alt="" aria-hidden="true"></span><span class="brand-lockup"><strong>Tako Bako</strong><span>Logic puzzles</span><small>Mark · Deduce · Solve</small></span></a>${puzzle ? `<div class="header-actions">${playMode === "challenge" ? renderBadge(courseProgressLabel(activeCourse, new Set(progress.completed)), "course-status") : ""}${renderButton({ id: "challenge-menu", label: "Course", expanded: challengeOptionsOpen })}<details class="action-menu"><summary>Actions</summary><div>${renderButton({ id: "share-puzzle", label: "Share puzzle", icon: "share" })}${renderButton({ id: "new-puzzle", label: loading ? "Setting up…" : playMode === "challenge" ? `Restart ${activeCourse.label}` : "New shared puzzle", variant: "secondary", disabled: loading })}</div></details></div>` : ""}</header>${puzzle ? renderPuzzle(puzzle) : `<main class="landing-state"><section class="landing-copy"><p class="eyebrow">Yokaiba logic dojo</p><h1>A small puzzle.<br>A satisfying solve.</h1><p>Work through a clear course of logic puzzles, from your first mark to advanced multi-grid deduction.</p>${renderStatus({ message, tone: message.includes("could not") || message.includes("busy") ? "error" : "neutral" })}${renderButton({ id: "start-puzzle", label: loading ? "Preparing challenge…" : `Start ${activeCourse.label}`, variant: "primary", disabled: loading })}${renderMascotNote({ title: "Ready for a tiny triumph?", copy: "Start with one thoughtful mark. I’ll be cheering from the dojo shelf." })}</section>${renderCurriculum({ completed: new Set(progress.completed), currentCourseId: activeCourse.id })}</main>`}<footer><span class="footer-brand"><img src="${markUrl}" alt="" aria-hidden="true"><span>TAKO BAKO · Yokaiba logic puzzles</span></span><span>Shareable puzzles, optional assists, and solution checking.</span></footer></div>${renderChallengeOptions()}`;
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
  if (progressElement) progressElement.textContent = `${progress.marked} / ${progress.total} possibilities noted`;
  const readinessMeter = root.querySelector<HTMLElement>(".readiness-meter");
  if (readinessMeter) readinessMeter.setAttribute("aria-label", `${progress.marked} of ${progress.total} possibilities noted`);
  const readinessFill = root.querySelector<HTMLElement>(".readiness-meter__bar > span");
  if (readinessFill) readinessFill.style.width = `${Math.round((progress.marked / progress.total) * 100)}%`;
  const check = root.querySelector<HTMLButtonElement>("#check-solution");
  if (check) check.disabled = loading || !current.puzzleToken || !answerFromBoard(board, current.spec);
  const undo = root.querySelector<HTMLButtonElement>("#undo");
  if (undo) undo.disabled = loading || undoStack.length === 0;
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
  if (button.id === "start-puzzle") startCourse(activeCourse);
  if (button.id === "new-puzzle") {
    if (Object.keys(board).length === 0) {
      if (playMode === "challenge") startCourse(activeCourse); else void fetchPuzzle(newSeed(), "push");
    }
    else {
      pendingNewChallenge = true;
      render();
      root.querySelector<HTMLButtonElement>("#cancel-new-challenge")?.focus();
    }
  }
  if (button.id === "daily-puzzle") startCourse(activeCourse, dailySeed());
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
    if (playMode === "challenge") startCourse(activeCourse); else void fetchPuzzle(newSeed(), "push");
  }
  if (button.id === "celebration-close") {
    pendingCelebration = false;
    render();
    return;
  }
  if (button.id === "celebration-continue") {
    pendingCelebration = false;
    const next = nextCourse(activeCourse);
    if (next) startCourse(next);
    return;
  }
  if (button.id === "share-puzzle") void sharePuzzle();
  if (button.id === "challenge-menu") {
    challengeOptionsOpen = true;
    render();
    root.querySelector<HTMLButtonElement>("#close-challenge-menu")?.focus();
    return;
  }
  if (button.id === "close-challenge-menu") {
    challengeOptionsOpen = false;
    render();
    root.querySelector<HTMLButtonElement>("#challenge-menu")?.focus();
    return;
  }
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
  if (button.dataset.clueFilter) {
    clueFilter = button.dataset.clueFilter as ClueFilter;
    render();
    root.querySelector<HTMLButtonElement>(`[data-clue-filter="${CSS.escape(clueFilter)}"]`)?.focus();
    return;
  }
  if (button.id === "open-landing-seed") {
    const seed = root.querySelector<HTMLInputElement>("#landing-seed-input")?.value.trim() ?? "";
    if (!/^[a-zA-Z0-9-]{1,128}$/.test(seed)) {
      message = "Use 1–128 letters, numbers, or hyphens for a challenge seed.";
      render();
    } else openSharedPuzzle(seed);
  }
  if (button.dataset.course) {
    const [tier, rawLevel] = button.dataset.course.split("-");
    const course = courseFor(tier, Number(rawLevel));
    if (course) startCourse(course);
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
  if (challengeOptionsOpen && event.key === "Escape") {
    event.preventDefault();
    challengeOptionsOpen = false;
    render();
    root.querySelector<HTMLButtonElement>("#challenge-menu")?.focus();
    return;
  }
  if (challengeOptionsOpen && event.key === "Tab") {
    const dialog = root.querySelector<HTMLDialogElement>("#challenge-menu-dialog");
    const focusable = [...(dialog?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])") ?? [])];
    if (focusable.length > 0) {
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1) : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
      event.preventDefault();
      focusable[nextIndex]?.focus();
    }
    return;
  }
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
}, true);

root.addEventListener("change", event => {
  const input = event.target as HTMLInputElement;
  if (input.id === "grid-select") {
    selectGrid(input.value);
    return;
  }
});

window.addEventListener("popstate", () => {
  playMode = modeFromUrl();
  activeCourse = courseFromUrl() ?? firstAvailableCourse(progress.completed);
  difficultyLevel = playMode === "challenge" ? activeCourse.difficultyLevel : difficultyFromUrl();
  templateId = playMode === "challenge" ? activeCourse.templateId : templateFromUrl();
  void fetchPuzzle(seedFromUrl() ?? newSeed(), "none");
});

render();
if (seedFromUrl()) void fetchPuzzle(seedFromUrl()!, "none");
