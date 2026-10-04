import { answerFromBoard, boardSolveProgress, markBoard, squareKey } from "./puzzle-board";
import { activeGridForPuzzle, renderApp } from "./app-view";
import { routeFromUrl, updatedPuzzleUrl, type PlayMode } from "./app-routing";
import { parseAnswerVerification } from "./answer-verification";
import { createHintRequestBody, parseHintResponse, type HintRequestBody, type ParsedHintResponse } from "./hint-request";
import { buildGameEventPayload, clampElapsedMs } from "./events";
import { postGameEvent } from "./events";
import { loadBoard, loadUsedClues, saveBoard, saveUsedClues } from "./puzzle-storage";
import type { Board, Puzzle } from "./puzzle";
import { DifficultyUnavailableError, loadPuzzle } from "./puzzle-loader";
import { dailySeed } from "./daily";
import { DEFAULT_SCENARIO_ID, scenarioIdFromUrl, type ScenarioId } from "./scenarios";
import { courseFor, firstAvailableCourse, nextCourse, puzzleParametersForCourse, type Course } from "./curriculum";
import { completeCourse, loadProgress, resetProgress, saveProgress, shouldAdvanceProgress } from "./progress";
import { parseSharedPuzzleInput, type SharedPuzzleInput } from "./shared-puzzle";
import { parseClueStrategyResults } from "./clue-strategy-results";
import type { ClueStrategy } from "./clue-strategy-catalog";
import { type ClueFilter } from "./sections";
import { trapDialogTab } from "./ui-dialog";
import { gridCellLabel, nextGridCellKey } from "./ui-grid";
import { nextTabId } from "./ui-tabs";
import type { StatusTone } from "./ui-types";

export interface AppAssets {
  mascotUrl: string;
  markUrl: string;
}

export function mountApp({ mascotUrl, markUrl }: AppAssets): void {
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing");
const root = app;

let puzzle: Puzzle | null = null;
let board: Board = {};
let loading = false;
let message = "Choose your next puzzle when you are ready.";
let messageTone: StatusTone = "neutral";
let difficultyUnavailable = false;
let undoStack: Board[] = [];
const SMART_MARKING_STORAGE_KEY = "tako-bako.smart-marking";
// Preserve the previous preference during this terminology migration.
let smartMarking = (localStorage.getItem(SMART_MARKING_STORAGE_KEY) ?? localStorage.getItem("tako-bako.assist")) === "on";
let progress = loadProgress(localStorage);
const initialRoute = routeFromUrl(new URL(window.location.href), progress.completed);
let playMode: PlayMode = initialRoute.playMode;
let activeCourse: Course = initialRoute.activeCourse;
let difficultyLevel = initialRoute.difficultyLevel;
let templateId: ScenarioId = initialRoute.templateId;
let activeGridId: string | undefined;
let usedClueIds = new Set<string>();
let clueStrategies: Record<string, ClueStrategy> = {};
let pendingResetGridId: string | undefined;
let pendingBoardReset = false;
let pendingNewChallenge = false;
let pendingProgressReset = false;
let pendingCelebration = false;
let resetReturnFocusSelector: string | undefined;
let cluesOpen = !window.matchMedia("(max-width: 860px)").matches;
let clueFilter: ClueFilter = "all";
let activeCellKey: string | undefined;
let challengeOptionsOpen = false;
let sharedPuzzleOpen = false;
let puzzleStartedAt = 0;
let hintsUsed = 0;
let mistakes = 0;

function setMessage(text: string, tone: StatusTone = "neutral"): void {
  message = text;
  messageTone = tone;
}

function newSeed(): string {
  return crypto.randomUUID();
}

function recordOutcome(event: "puzzle_started" | "puzzle_completed" | "hint_used" | "mistake" | "puzzle_abandoned"): void {
  if (!puzzle) return;
  postGameEvent(buildGameEventPayload({
    schemaVersion: 1,
    event,
    templateId: puzzle.templateId,
    requestedDifficultyLevel: difficultyLevel,
    assessedDifficultyLevel: puzzle.difficulty.level,
    clueCount: puzzle.clues.length,
    elapsedMs: clampElapsedMs(puzzleStartedAt),
    hintsUsed,
    mistakes,
    smartMarkingEnabled: smartMarking,
  }));
}

function startCourse(course: Course, seed = newSeed(), urlMode: "push" | "replace" | "none" = "push"): void {
  challengeOptionsOpen = false;
  activeCourse = course;
  playMode = "challenge";
  ({ templateId, difficultyLevel } = puzzleParametersForCourse(course));
  void fetchPuzzle(seed, urlMode);
}

function openSharedPuzzle(input: SharedPuzzleInput): void {
  challengeOptionsOpen = false;
  playMode = "shared";
  const course = input.tier && input.level ? courseFor(input.tier, input.level) : undefined;
  if (course) ({ templateId, difficultyLevel } = puzzleParametersForCourse(course));
  else {
    templateId = scenarioIdFromUrl(input.templateId ?? null) ?? DEFAULT_SCENARIO_ID;
    difficultyLevel = input.difficultyLevel;
  }
  void fetchPuzzle(input.seed, "push");
}

function seedFromUrl(): string | undefined {
  return routeFromUrl(new URL(window.location.href), progress.completed).seed;
}

function setPuzzleUrl(seed: string, mode: "push" | "replace" | "none", requestedPlayMode: PlayMode, requestedTemplateId: ScenarioId, requestedDifficultyLevel: number | undefined, requestedCourse: Course): void {
  const url = updatedPuzzleUrl(window.location.href, mode, requestedPlayMode, requestedTemplateId, requestedDifficultyLevel, requestedCourse, seed);
  if (url) window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
}

let currentFetchId = 0;
let puzzleLoadFailed = false;
let activePuzzleRequest: AbortController | undefined;
let verificationGeneration = 0;
let activeVerificationRequest: AbortController | undefined;
let hintGeneration = 0;
let activeHintRequest: AbortController | undefined;
let clueStrategyGeneration = 0;
let activeClueStrategyRequest: AbortController | undefined;

function showLandingPage(): void {
  invalidateVerification();
  invalidateHint();
  invalidateClueStrategies();
  currentFetchId += 1;
  activePuzzleRequest?.abort();
  activePuzzleRequest = undefined;
  puzzle = null;
  board = {};
  loading = false;
  difficultyUnavailable = false;
  puzzleLoadFailed = false;
  undoStack = [];
  activeGridId = undefined;
  usedClueIds = new Set();
  clueStrategies = {};
  pendingResetGridId = undefined;
  pendingBoardReset = false;
  pendingNewChallenge = false;
  pendingProgressReset = false;
  pendingCelebration = false;
  resetReturnFocusSelector = undefined;
  activeCellKey = undefined;
  clueFilter = "all";
  challengeOptionsOpen = false;
  sharedPuzzleOpen = false;
  puzzleStartedAt = 0;
  hintsUsed = 0;
  mistakes = 0;
  setMessage("Choose your next puzzle when you are ready.");
  render();
}

function invalidateVerification(): void {
  verificationGeneration += 1;
  activeVerificationRequest?.abort();
  activeVerificationRequest = undefined;
}

function invalidateHint(): void {
  hintGeneration += 1;
  activeHintRequest?.abort();
  activeHintRequest = undefined;
}

function invalidateClueStrategies(): void {
  clueStrategyGeneration += 1;
  activeClueStrategyRequest?.abort();
  activeClueStrategyRequest = undefined;
}

async function loadClueStrategies(requestedPuzzle: Puzzle): Promise<void> {
  const unresolved = requestedPuzzle.clues.filter(clue => !clue.strategy);
  if (unresolved.length === 0 || !requestedPuzzle.puzzleToken) return;
  const requestGeneration = ++clueStrategyGeneration;
  activeClueStrategyRequest?.abort();
  const requestController = new AbortController();
  activeClueStrategyRequest = requestController;
  try {
    const result = await fetch("/api/clue-strategies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ puzzleToken: requestedPuzzle.puzzleToken, clues: unresolved.map(({ id, text, constraintKind }) => ({ id, text, ...(constraintKind ? { constraintKind } : {}) })) }),
      signal: requestController.signal,
    });
    if (!result.ok) return;
    const strategies = parseClueStrategyResults(await result.json(), unresolved.map(clue => clue.id));
    if (requestGeneration !== clueStrategyGeneration || puzzle?.id !== requestedPuzzle.id) return;
    clueStrategies = { ...clueStrategies, ...Object.fromEntries(strategies) };
    render();
  } catch {
    // Clue labels are optional and must not block puzzle play.
  } finally {
    if (requestGeneration === clueStrategyGeneration) activeClueStrategyRequest = undefined;
  }
}

async function fetchPuzzle(seed = newSeed(), urlMode: "push" | "replace" | "none" = "replace"): Promise<void> {
  invalidateVerification();
  invalidateHint();
  invalidateClueStrategies();
  const requestedSeed = seed;
  const requestedTemplateId = templateId;
  const requestedDifficultyLevel = difficultyLevel;
  const requestedPlayMode = playMode;
  const requestedCourse = activeCourse;
  if (puzzle) recordOutcome("puzzle_abandoned");
  loading = true;
  difficultyUnavailable = false;
  puzzleLoadFailed = false;
  setMessage("Tako is setting the puzzle tiles…");
  const fetchId = ++currentFetchId;
  activePuzzleRequest?.abort();
  const requestController = new AbortController();
  activePuzzleRequest = requestController;
  render();
  try {
    const data = await loadPuzzle(
      { seed: requestedSeed, templateId: requestedTemplateId, difficultyLevel: requestedDifficultyLevel },
      { storage: sessionStorage, signal: requestController.signal, isCurrent: () => fetchId === currentFetchId },
    );
    if (fetchId !== currentFetchId) return;
    activatePuzzle(data, requestedSeed, urlMode, requestedPlayMode, requestedTemplateId, requestedDifficultyLevel, requestedCourse);
  } catch (error) {
    if (fetchId !== currentFetchId) return;
    puzzle = null;
    puzzleLoadFailed = true;
    difficultyUnavailable = error instanceof DifficultyUnavailableError;
    setMessage(error instanceof Error ? error.message : "The puzzle could not be collected. Please try again.", "error");
  } finally {
    if (fetchId === currentFetchId) {
      activePuzzleRequest = undefined;
      loading = false;
      render();
    }
  }
}

function activatePuzzle(data: Puzzle, requestedSeed: string, urlMode: "push" | "replace" | "none", requestedPlayMode: PlayMode, requestedTemplateId: ScenarioId, requestedDifficultyLevel: number | undefined, requestedCourse: Course): void {
  puzzle = data;
  clueStrategies = Object.fromEntries(data.clues.flatMap(clue => clue.strategy ? [[clue.id, clue.strategy] as const] : []));
  puzzleLoadFailed = false;
  puzzleStartedAt = Date.now();
  hintsUsed = 0;
  mistakes = 0;
  recordOutcome("puzzle_started");
  board = loadBoard(data.id);
  undoStack = [];
  activeGridId = data.spec.categories.find(category => category.id !== data.spec.baseCategory)?.id;
  const base = data.spec.categories.find(category => category.id === data.spec.baseCategory);
  const active = data.spec.categories.find(category => category.id === activeGridId);
  activeCellKey = base && active ? squareKey(active.id, base.values[0]!, active.values[0]!) : undefined;
  usedClueIds = loadUsedClues(data.id, data.clues.map(clue => clue.id));
  void loadClueStrategies(data);
  // Keep the requested seed in the URL: Yokaiba may derive a different
  // internal seed while searching for the chosen difficulty level.
  setPuzzleUrl(requestedSeed, urlMode, requestedPlayMode, requestedTemplateId, requestedDifficultyLevel, requestedCourse);
  setMessage("Mark each square: leave it blank, confirm a match ✓, or rule it out ×.");
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
  setMessage("Board restored.");
  render();
}

function resetGrid(categoryId: string): void {
  if (!puzzle) return;
  const next = Object.fromEntries(Object.entries(board).filter(([key]) => key.split("|")[0] !== categoryId)) as Board;
  if (Object.keys(next).length === Object.keys(board).length) return;
  saveCurrentBoard(next);
  pendingResetGridId = undefined;
  setMessage("Grid reset. Your previous marks are available with Undo.");
  render();
  restoreResetFocus();
}

function resetBoard(): void {
  if (!puzzle || Object.keys(board).length === 0) return;
  saveCurrentBoard({});
  pendingBoardReset = false;
  setMessage("Board reset. Your previous marks are available with Undo.");
  render();
  restoreResetFocus();
}

function restoreResetFocus(): void {
  const selector = resetReturnFocusSelector;
  resetReturnFocusSelector = undefined;
  if (!selector) return;
  requestAnimationFrame(() => {
    const trigger = root.querySelector<HTMLButtonElement>(selector);
    if (trigger && !trigger.disabled) trigger.focus();
    else root.querySelector<HTMLButtonElement>("#undo")?.focus();
  });
}

function openResetDialog(categoryId: string, returnFocusId: string): void {
  pendingResetGridId = categoryId;
  pendingBoardReset = false;
  resetReturnFocusSelector = `#${CSS.escape(returnFocusId)}`;
  render();
  root.querySelector<HTMLButtonElement>("#cancel-grid-reset")?.focus();
}

function openResetBoardDialog(): void {
  pendingResetGridId = undefined;
  pendingBoardReset = true;
  resetReturnFocusSelector = "#reset-board";
  render();
  root.querySelector<HTMLButtonElement>("#cancel-board-reset")?.focus();
}

function dismissResetDialog(): void {
  pendingResetGridId = undefined;
  pendingBoardReset = false;
  render();
  restoreResetFocus();
}

async function checkAnswer(): Promise<void> {
  if (!puzzle) return;
  const requestedPuzzle = puzzle;
  const requestedPuzzleId = requestedPuzzle.id;
  const requestedPuzzleToken = requestedPuzzle.puzzleToken;
  const requestedPlayMode = playMode;
  const requestedCourse = activeCourse;
  const requestGeneration = ++verificationGeneration;
  activeVerificationRequest?.abort();
  const requestController = new AbortController();
  activeVerificationRequest = requestController;
  const isActiveRequest = () => requestGeneration === verificationGeneration
    && puzzle?.id === requestedPuzzleId
    && puzzle.puzzleToken === requestedPuzzleToken;
  const answer = answerFromBoard(board, requestedPuzzle.spec);
  if (!answer) {
    setMessage("Choose one ✓ in each row and column before checking your solution.", "warning");
    render();
    return;
  }
  if (!requestedPuzzleToken) {
    setMessage("Solution checking is temporarily unavailable for this dojo puzzle.", "error");
    render();
    return;
  }
  loading = true;
  setMessage("Tako is checking your solution…");
  render();
  try {
    const correct = await requestAnswerVerification(requestedPuzzleToken, answer, requestController.signal, isActiveRequest);
    if (correct !== undefined) applyAnswerResult(correct, requestedPlayMode, requestedCourse);
  } catch {
    if (!isActiveRequest()) return;
    setMessage("Tako can’t check your solution just now. Your marks are safely saved—please try again in a moment.", "error");
  } finally {
    if (isActiveRequest()) {
      activeVerificationRequest = undefined;
      loading = false;
      render();
    }
  }
}

async function requestAnswerVerification(token: string, answer: NonNullable<ReturnType<typeof answerFromBoard>>, signal: AbortSignal, isActive: () => boolean): Promise<boolean | undefined> {
  const result = await fetch("/api/puzzle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ puzzleToken: token, answer }),
    signal,
  });
  if (!isActive()) return undefined;
  if (!result.ok) throw new Error("Verification is unavailable");
  const correct = parseAnswerVerification(await result.json());
  if (!isActive()) return undefined;
  if (correct === undefined) throw new Error("Invalid verification response");
  return correct;
}

function applyAnswerResult(correct: boolean, requestedPlayMode: PlayMode, requestedCourse: Course): void {
  if (!correct) {
    mistakes = Math.min(100, mistakes + 1);
    recordOutcome("mistake");
    setMessage("Not quite yet. Your notes are saved, so keep refining the grid.", "warning");
    return;
  }
  recordOutcome("puzzle_completed");
  if (!shouldAdvanceProgress(requestedPlayMode)) {
    setMessage("Beautifully solved — this shared puzzle is complete. Start Puzzle Challenge to advance your course.", "success");
    pendingCelebration = true;
    return;
  }
  progress = completeCourse(progress, requestedCourse.id);
  saveProgress(localStorage, progress);
  const next = nextCourse(requestedCourse);
  setMessage(next ? `Beautifully solved — ${requestedCourse.label} is complete. ${next.label} is now ready!` : "Beautifully solved — you have completed every Puzzle Challenge level!", "success");
  pendingCelebration = true;
}

async function requestHint(): Promise<void> {
  if (!puzzle) return;
  const requestedPuzzle = puzzle;
  const requestedPuzzleId = requestedPuzzle.id;
  const requestedPuzzleToken = requestedPuzzle.puzzleToken;
  if (!requestedPuzzleToken) return;
  const requestedBoard = { ...board };
  const requestedUsedClueIds = new Set(usedClueIds);
  const requestedDifficultyLevel = difficultyLevel;
  const requestedPuzzleStartedAt = puzzleStartedAt;
  const requestedHintsUsed = hintsUsed;
  const requestGeneration = ++hintGeneration;
  activeHintRequest?.abort();
  const requestController = new AbortController();
  activeHintRequest = requestController;
  const isActiveRequest = () => requestGeneration === hintGeneration
    && puzzle?.id === requestedPuzzleId
    && puzzle.puzzleToken === requestedPuzzleToken;
  const body = createHintRequestBody({
    puzzle: { ...requestedPuzzle, puzzleToken: requestedPuzzleToken },
    board: requestedBoard,
    usedClueIds: requestedUsedClueIds,
    clueStrategies,
    hintsUsed: requestedHintsUsed,
    mistakes,
    difficultyLevel: requestedDifficultyLevel,
    puzzleStartedAt: requestedPuzzleStartedAt,
    now: Date.now(),
    smartMarking,
  });
  loading = true;
  setMessage("Tako is finding the next helpful nudge…");
  render();
  try {
    const hint = await requestHintResponse(body, requestController.signal, isActiveRequest);
    if (!hint) return;
    applyHintResponse(hint, requestedPuzzleId, requestedBoard, requestedUsedClueIds);
    hintsUsed = requestedHintsUsed + 1;
    recordHintUsage(requestedPuzzle, requestedDifficultyLevel, requestedPuzzleStartedAt, hintsUsed, mistakes);
  } catch {
    if (!isActiveRequest()) return;
    setMessage("Tako can’t offer a hint just now. Please try again in a moment.", "error");
  } finally {
    if (isActiveRequest()) {
      activeHintRequest = undefined;
      loading = false;
      render();
    }
  }
}

async function requestHintResponse(body: HintRequestBody, signal: AbortSignal, isActive: () => boolean): Promise<ParsedHintResponse | undefined> {
  const response = await fetch("/api/hint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!isActive()) return undefined;
  const hint = parseHintResponse(await response.json());
  if (!isActive()) return undefined;
  if (!response.ok || !hint) throw new Error("Hint unavailable");
  return hint;
}

function applyHintResponse(hint: ParsedHintResponse, puzzleId: string, previousBoard: Board, previousUsedClueIds: ReadonlySet<string>): void {
  if (hint.kind === "placement") {
    board = { ...previousBoard, [squareKey(hint.placement.category, hint.placement.subject, hint.placement.value)]: "yes" };
    saveBoard(puzzleId, board);
    setMessage(`Hint: ${hint.placement.subject} matches ${hint.placement.value}.`);
    return;
  }
  if (hint.clue.id !== undefined) {
    usedClueIds = new Set(previousUsedClueIds).add(hint.clue.id);
    saveUsedClues(puzzleId, usedClueIds);
  }
  setMessage(`Hint: ${hint.clue.text}`);
}

function recordHintUsage(requestedPuzzle: Puzzle, requestedDifficultyLevel: number | undefined, requestedPuzzleStartedAt: number, usedHints: number, currentMistakes: number): void {
  postGameEvent(buildGameEventPayload({
    schemaVersion: 1,
    event: "hint_used",
    templateId: requestedPuzzle.templateId,
    requestedDifficultyLevel,
    assessedDifficultyLevel: requestedPuzzle.difficulty.level,
    clueCount: requestedPuzzle.clues.length,
    elapsedMs: clampElapsedMs(requestedPuzzleStartedAt),
    hintsUsed: usedHints,
    mistakes: currentMistakes,
  }));
}

async function sharePuzzle(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href);
    setMessage("Puzzle link copied — share this exact dojo challenge.", "success");
  } catch {
    setMessage("Copy this page’s address to share the current puzzle.");
  }
  render();
}

function render(): void {
  if (puzzle) activeGridId = activeGridForPuzzle(puzzle, activeGridId);
  root.innerHTML = renderApp({
    mascotUrl,
    markUrl,
    puzzle,
    board,
    loading,
    message,
    messageTone,
    difficultyUnavailable,
    puzzleLoadFailed,
    undoCount: undoStack.length,
    smartMarking,
    playMode,
    progress,
    activeCourse,
    activeGridId,
    activeCellKey,
    usedClueIds,
    clueStrategies,
    pendingResetGridId,
    pendingBoardReset,
    pendingNewChallenge,
    pendingProgressReset,
    pendingCelebration,
    cluesOpen,
    clueFilter,
    challengeOptionsOpen,
    sharedPuzzleOpen,
  });
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

function changedBoardCell(key: string, current: Puzzle, base: Puzzle["spec"]["categories"][number]): { cell: HTMLButtonElement; row: string; column: string } | undefined {
  const [categoryId, encodedRow, encodedColumn] = key.split("|");
  if (!categoryId || !encodedRow || !encodedColumn) return undefined;
  const category = current.spec.categories.find(candidate => candidate.id === categoryId);
  if (!category || category.id === base.id) return undefined;
  const cell = root.querySelector<HTMLButtonElement>(`[data-square="${CSS.escape(key)}"]`);
  if (!cell) return undefined;
  return { cell, row: decodeURIComponent(encodedRow), column: decodeURIComponent(encodedColumn) };
}

/** Updates only the cells and board controls changed by a mark, preserving the live grid DOM. */
function updateBoardCell(key: string, current: Puzzle, base: Puzzle["spec"]["categories"][number]): void {
  const target = changedBoardCell(key, current, base);
  if (!target) return;
  const mark = board[key] ?? "unknown";
  target.cell.className = `mark mark-${mark}`;
  target.cell.setAttribute("aria-label", gridCellLabel(target.row, target.column, mark));
  const symbol = target.cell.querySelector("span") ?? target.cell;
  symbol.textContent = mark === "yes" ? "✓" : mark === "no" ? "×" : "";
}

function updateChangedBoardCells(previous: Board, current: Puzzle, base: Puzzle["spec"]["categories"][number]): void {
  const changedKeys = [...new Set([...Object.keys(previous), ...Object.keys(board)])]
    .filter(key => previous[key] !== board[key]);
  for (const key of changedKeys) updateBoardCell(key, current, base);
}

function updateProgressDisplay(progress: ReturnType<typeof boardSolveProgress>): void {
  const progressElement = root.querySelector<HTMLElement>(".progress");
  if (progressElement) progressElement.textContent = `${progress.matches} of ${progress.total} matches found`;
  const readinessMeter = root.querySelector<HTMLElement>(".readiness-meter");
  if (readinessMeter) readinessMeter.setAttribute("aria-label", `${progress.matches} of ${progress.total} matches found`);
  const readinessFill = root.querySelector<HTMLElement>(".readiness-meter__bar > span");
  if (readinessFill) readinessFill.style.width = `${progress.total === 0 ? 0 : Math.round((progress.matches / progress.total) * 100)}%`;
}

function updateBoardActionControls(current: Puzzle): void {
  const check = root.querySelector<HTMLButtonElement>("#check-solution");
  if (check) check.disabled = loading || !current.puzzleToken || !answerFromBoard(board, current.spec);
  const undo = root.querySelector<HTMLButtonElement>("#undo");
  if (undo) undo.disabled = loading || undoStack.length === 0;
  const reset = root.querySelector<HTMLButtonElement>("#reset-board");
  if (reset) reset.disabled = loading || Object.keys(board).length === 0;
}

function updateBoardProgressControls(current: Puzzle): void {
  updateProgressDisplay(boardSolveProgress(board, current.spec));
  updateBoardActionControls(current);
}

function updateGridResetControls(current: Puzzle, base: Puzzle["spec"]["categories"][number]): void {
  for (const category of current.spec.categories) {
    if (category.id === base.id) continue;
    const reset = root.querySelector<HTMLButtonElement>(`#grid-reset-${CSS.escape(category.id)}`);
    if (reset) reset.disabled = !Object.keys(board).some(key => key.split("|")[0] === category.id);
  }
}

function updateBoardView(previous: Board, current: Puzzle): void {
  const base = current.spec.categories.find(category => category.id === current.spec.baseCategory);
  if (!base) return;
  updateChangedBoardCells(previous, current, base);
  updateBoardProgressControls(current);
  updateGridResetControls(current, base);
}

function selectGrid(gridId: string, focus = false): void {
  if (!puzzle || activeGridId === gridId) return;
  activeGridId = gridId;
  const base = puzzle.spec.categories.find(category => category.id === puzzle!.spec.baseCategory);
  const category = puzzle.spec.categories.find(candidate => candidate.id === gridId);
  activeCellKey = base && category ? squareKey(category.id, base.values[0]!, category.values[0]!) : undefined;
  setMessage("Grid selected and ready for marking.");
  render();
  if (focus) root.querySelector<HTMLButtonElement>(`[data-grid-tab="${CSS.escape(gridId)}"]`)?.focus();
}

function handlePuzzleNavigationClick(button: HTMLButtonElement): boolean {
  if (button.id === "start-puzzle") startCourse(activeCourse);
  else if (button.id === "try-another-puzzle") void fetchPuzzle(newSeed(), "push");
  else if (button.id === "new-puzzle") {
    if (Object.keys(board).length === 0) {
      if (playMode === "challenge") startCourse(activeCourse); else void fetchPuzzle(newSeed(), "push");
    } else {
      pendingNewChallenge = true;
      render();
      root.querySelector<HTMLButtonElement>("#cancel-new-challenge")?.focus();
    }
  } else if (button.id === "daily-puzzle") startCourse(activeCourse, dailySeed());
  else return false;
  return true;
}

function handleBoardActionClick(button: HTMLButtonElement): boolean {
  if (button.id === "check-solution") void checkAnswer();
  else if (button.id === "hint") void requestHint();
  else if (button.id === "undo") restoreBoard();
  else if (button.id === "reset-board") openResetBoardDialog();
  else return false;
  return true;
}

function handleGridResetClick(button: HTMLButtonElement): boolean {
  if (button.id === "cancel-grid-reset") dismissResetDialog();
  else if (button.id === "confirm-grid-reset" && pendingResetGridId) resetGrid(pendingResetGridId);
  else if (button.id === "cancel-board-reset") dismissResetDialog();
  else if (button.id === "confirm-board-reset" && pendingBoardReset) resetBoard();
  else return false;
  return true;
}

function confirmProgressReset(): void {
  invalidateVerification();
  invalidateHint();
  currentFetchId += 1;
  loading = false;
  difficultyUnavailable = false;
  progress = resetProgress();
  saveProgress(localStorage, progress);
  activeCourse = firstAvailableCourse(progress.completed);
  ({ templateId, difficultyLevel } = puzzleParametersForCourse(activeCourse));
  puzzle = null;
  board = {};
  undoStack = [];
  usedClueIds = new Set();
  playMode = "challenge";
  challengeOptionsOpen = false;
  pendingProgressReset = false;
  window.history.pushState({}, "", window.location.pathname);
  setMessage("Your dojo route has been reset. Beginner Level 1 is ready.");
  render();
}

function handleProgressResetClick(button: HTMLButtonElement): boolean {
  if (button.id === "open-progress-reset") {
    pendingProgressReset = true;
    render();
    root.querySelector<HTMLButtonElement>("#cancel-progress-reset")?.focus();
  } else if (button.id === "cancel-progress-reset") {
    pendingProgressReset = false;
    render();
    root.querySelector<HTMLButtonElement>("#open-progress-reset")?.focus();
  } else if (button.id === "confirm-progress-reset") confirmProgressReset();
  else return false;
  return true;
}

function handleNewChallengeClick(button: HTMLButtonElement): boolean {
  if (button.id === "cancel-new-challenge") {
    pendingNewChallenge = false;
    render();
    root.querySelector<HTMLButtonElement>("#new-puzzle")?.focus();
  } else if (button.id === "confirm-new-challenge") {
    pendingNewChallenge = false;
    if (playMode === "challenge") startCourse(activeCourse); else void fetchPuzzle(newSeed(), "push");
  } else return false;
  return true;
}

function handleSharedPuzzleDialogClick(button: HTMLButtonElement): boolean {
  if (button.id === "open-shared-puzzle") {
    sharedPuzzleOpen = true;
    render();
    root.querySelector<HTMLInputElement>("#landing-seed-input")?.focus();
  } else if (button.id === "close-shared-puzzle") {
    sharedPuzzleOpen = false;
    render();
    root.querySelector<HTMLButtonElement>("#open-shared-puzzle")?.focus();
  } else return false;
  return true;
}

function handleCelebrationClick(button: HTMLButtonElement): boolean {
  if (button.id === "celebration-close") {
    pendingCelebration = false;
    render();
  } else if (button.id === "celebration-continue") {
    pendingCelebration = false;
    const next = nextCourse(activeCourse);
    if (next) startCourse(next);
  } else return false;
  return true;
}

function handleChallengeOptionsClick(button: HTMLButtonElement): boolean {
  if (button.id === "share-puzzle") void sharePuzzle();
  else if (button.id === "challenge-menu") {
    challengeOptionsOpen = true;
    render();
    root.querySelector<HTMLButtonElement>("#close-challenge-menu")?.focus();
  } else if (button.id === "close-challenge-menu") {
    challengeOptionsOpen = false;
    render();
    root.querySelector<HTMLButtonElement>("#challenge-menu")?.focus();
  } else if (button.id === "smart-marking-toggle") {
    smartMarking = !smartMarking;
    localStorage.setItem(SMART_MARKING_STORAGE_KEY, smartMarking ? "on" : "off");
    setMessage(smartMarking ? "Smart marking is on. New ✓ marks will rule out the other squares in their row and column." : "Smart marking is off. You are in full control of every mark.");
    render();
    root.querySelector<HTMLButtonElement>("#smart-marking-toggle")?.focus();
  } else return false;
  return true;
}

function handleGridControlClick(button: HTMLButtonElement): boolean {
  if (button.dataset.gridTab) selectGrid(button.dataset.gridTab);
  else if (button.dataset.gridReset) openResetDialog(button.dataset.gridReset, button.id);
  else return false;
  return true;
}

function handleClueClick(button: HTMLButtonElement): boolean {
  if (button.dataset.clueId) {
    const clueId = button.dataset.clueId;
    if (usedClueIds.has(clueId)) usedClueIds.delete(clueId); else usedClueIds.add(clueId);
    if (puzzle) saveUsedClues(puzzle.id, usedClueIds);
    render();
  } else if (button.dataset.clueFilter) {
    clueFilter = button.dataset.clueFilter as ClueFilter;
    render();
    root.querySelector<HTMLButtonElement>(`[data-clue-filter="${CSS.escape(clueFilter)}"]`)?.focus();
  } else return false;
  return true;
}

function handleSharedPuzzleSubmit(button: HTMLButtonElement): boolean {
  if (button.id !== "open-landing-seed") return false;
  const input = parseSharedPuzzleInput(root.querySelector<HTMLInputElement>("#landing-seed-input")?.value ?? "");
  if (!input) {
    setMessage("Paste a shared puzzle link or a code using 1–128 letters, numbers, or hyphens.", "warning");
    render();
  } else {
    sharedPuzzleOpen = false;
    openSharedPuzzle(input);
  }
  return true;
}

function handleCourseClick(button: HTMLButtonElement): boolean {
  if (!button.dataset.course) return false;
  const [tier, rawLevel] = button.dataset.course.split("-");
  const course = courseFor(tier, Number(rawLevel));
  if (course) startCourse(course);
  return true;
}

function handleBoardSquareClick(button: HTMLButtonElement): boolean {
  const current = puzzle;
  const key = button.dataset.square;
  if (!key || !current) return false;
  const categoryId = key.split("|")[0];
  const category = current.spec.categories.find(candidate => candidate.id === categoryId);
  const base = current.spec.categories.find(candidate => candidate.id === current.spec.baseCategory);
  if (!category || !base) return true;
  const previous = board;
  saveCurrentBoard(markBoard(board, key, category, base, smartMarking));
  updateBoardView(previous, current);
  focusGridCell(key);
  return true;
}

const clickActions: ((button: HTMLButtonElement) => boolean)[] = [
  handlePuzzleNavigationClick,
  handleBoardActionClick,
  handleGridResetClick,
  handleNewChallengeClick,
  handleProgressResetClick,
  handleSharedPuzzleDialogClick,
  handleCelebrationClick,
  handleChallengeOptionsClick,
  handleGridControlClick,
  handleClueClick,
  handleSharedPuzzleSubmit,
  handleCourseClick,
  handleBoardSquareClick,
];

function handleClick(event: MouseEvent): void {
  const button = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!button || button.disabled) return;
  for (const handleAction of clickActions) if (handleAction(button)) return;
}

root.addEventListener("click", handleClick);

function activeDialogSelector(): string | undefined {
  if (challengeOptionsOpen) return "#challenge-menu-dialog";
  if (sharedPuzzleOpen) return "#shared-puzzle";
  if (pendingBoardReset) return "#reset-board-dialog";
  if (pendingResetGridId) return "#reset-grid";
  if (pendingNewChallenge) return "#new-challenge";
  if (pendingProgressReset) return "#reset-progress";
  return undefined;
}

function handleDialogEscape(): void {
  if (challengeOptionsOpen) {
    challengeOptionsOpen = false;
    render();
    root.querySelector<HTMLButtonElement>("#challenge-menu")?.focus();
    return;
  }
  if (sharedPuzzleOpen) {
    sharedPuzzleOpen = false;
    render();
    root.querySelector<HTMLButtonElement>("#open-shared-puzzle")?.focus();
  }
  if (pendingResetGridId || pendingBoardReset) dismissResetDialog();
  if (pendingNewChallenge) {
    pendingNewChallenge = false;
    render();
    root.querySelector<HTMLButtonElement>("#new-puzzle")?.focus();
  }
  if (pendingProgressReset) {
    pendingProgressReset = false;
    render();
    root.querySelector<HTMLButtonElement>("#open-progress-reset")?.focus();
  }
}

function handleDialogKeydown(event: KeyboardEvent): boolean {
  const dialogSelector = activeDialogSelector();
  if (!dialogSelector || (event.key !== "Escape" && event.key !== "Tab")) return false;
  if (event.key === "Escape") {
    event.preventDefault();
    handleDialogEscape();
    return true;
  }
  trapDialogTab(event, root.querySelector<HTMLDialogElement>(dialogSelector), document.activeElement, event.shiftKey);
  return true;
}

function handleGridCellKeydown(event: KeyboardEvent): boolean {
  const cell = (event.target as Element).closest<HTMLButtonElement>("button[data-square]");
  if (!cell || !puzzle || cell.disabled || !cell.dataset.square) return false;
  const category = puzzle.spec.categories.find(candidate => candidate.id === cell.dataset.square!.split("|")[0]);
  const base = puzzle.spec.categories.find(candidate => candidate.id === puzzle!.spec.baseCategory);
  if (!category || !base) return false;
  const nextKey = nextGridCellKey({ categoryId: category.id, rows: base.values, columns: category.values, key: cell.dataset.square, keyName: event.key });
  if (!nextKey) return false;
  event.preventDefault();
  focusGridCell(nextKey);
  return true;
}

function handleGridTabKeydown(event: KeyboardEvent): void {
  const tab = (event.target as Element).closest<HTMLButtonElement>("button[data-grid-tab]");
  if (!tab || !puzzle || !tab.dataset.gridTab) return;
  const categories = puzzle.spec.categories.filter(category => category.id !== puzzle!.spec.baseCategory);
  const nextGridId = nextTabId(categories, tab.dataset.gridTab, event.key);
  if (!nextGridId) return;
  event.preventDefault();
  selectGrid(nextGridId, true);
}

function handleGridKeydown(event: KeyboardEvent): void {
  if (handleGridCellKeydown(event)) return;
  handleGridTabKeydown(event);
}

root.addEventListener("keydown", event => {
  if (handleDialogKeydown(event)) return;
  handleGridKeydown(event);
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
  const route = routeFromUrl(new URL(window.location.href), progress.completed);
  playMode = route.playMode;
  activeCourse = route.activeCourse;
  difficultyLevel = route.difficultyLevel;
  templateId = route.templateId;
  if (route.seed) void fetchPuzzle(route.seed, "none");
  else showLandingPage();
});

render();
const initialSeed = seedFromUrl();
if (initialSeed) void fetchPuzzle(initialSeed, "none");
}
