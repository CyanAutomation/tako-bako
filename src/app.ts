import { markBoard, squareKey } from "./puzzle-board/marks";
import { updateBoardView as updateBoardDom } from "./app-board-view";
import { activeGridForPuzzle, renderApp } from "./app-view";
import { routeFromUrl, updatedPuzzleUrl, type PlayMode } from "./app-routing";
import { fetchClueStrategies } from "./app-requests";
import { clampElapsedMs, postGameEvent } from "./events";
import { loadBoard, loadUsedClues, saveBoard, saveUsedClues } from "./puzzle-storage";
import type { Board, Puzzle } from "./puzzle";
import { DifficultyUnavailableError, loadPuzzle } from "./puzzle-loader";
import { dailySeed } from "./daily";
import { DEFAULT_SCENARIO_ID, scenarioIdFromUrl, type ScenarioId } from "./scenarios";
import { courseFor, defaultDifficultyModelForCourse, firstAvailableCourse, nextCourse, puzzleParametersForCourse, type Course } from "./curriculum";
import { resetProgress } from "./progress";
import { loadProgress, saveProgress } from "./progress-storage";
import { parseSharedPuzzleInput, type SharedPuzzleInput } from "./shared-puzzle";
import type { ClueStrategy } from "./clue-strategy-catalog";
import { type ClueFilter } from "./sections/clue-panel";
import { trapDialogTab } from "./ui-dialog";
import { handleGridCellKeydown, handleGridTabKeydown } from "./app-keyboard";
import type { StatusTone } from "./ui-types";
import { createAppGameplayActions } from "./app-gameplay";
import {
  hasSubmittedPuzzleFeedback,
  markPuzzleFeedbackSubmitted,
  postPuzzleFeedback,
  PUZZLE_FEEDBACK_RATINGS,
  PUZZLE_FEEDBACK_REASONS,
  type PuzzleFeedbackRating,
  type PuzzleFeedbackReason,
  type PuzzleFeedbackRequest,
} from "./feedback";
import { createOrReusePuzzleFeedbackRequest } from "./feedback-submission";
import { shouldRecordPuzzleAbandoned } from "./puzzle-lifecycle";

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
let difficultyModel = initialRoute.difficultyModel;
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
let puzzleStartedAt: number | undefined;
let hintsUsed = 0;
let mistakes = 0;
let puzzleCompleted = false;
let feedbackUi: { selectedRating?: PuzzleFeedbackRating; selectedReason?: PuzzleFeedbackReason; submitting: boolean; status?: "success" | "error" } = { submitting: false };
let feedbackEntryOpen = false;
let actionMenuOpen = false;
const submittedFeedbackFingerprints = new Set<string>();
const pendingFeedbackRequests = new Map<string, PuzzleFeedbackRequest>();

function setMessage(text: string, tone: StatusTone = "neutral"): void {
  message = text;
  messageTone = tone;
}

function newSeed(): string {
  return crypto.randomUUID();
}

function recordOutcome(event: "puzzle_started" | "puzzle_completed" | "hint_used" | "mistake" | "puzzle_abandoned"): void {
  if (!puzzle) return;
  if (event === "puzzle_completed") puzzleCompleted = true;
  postGameEvent({
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
  });
}

const gameplay = createAppGameplayActions({
  state: {
    get puzzle() { return puzzle; },
    set puzzle(value) { puzzle = value; },
    get board() { return board; },
    set board(value) { board = value; },
    get loading() { return loading; },
    set loading(value) { loading = value; },
    get playMode() { return playMode; },
    set playMode(value) { playMode = value; },
    get activeCourse() { return activeCourse; },
    set activeCourse(value) { activeCourse = value; },
    get progress() { return progress; },
    set progress(value) { progress = value; },
    get difficultyLevel() { return difficultyLevel; },
    set difficultyLevel(value) { difficultyLevel = value; },
    get puzzleStartedAt() { return puzzleStartedAt; },
    set puzzleStartedAt(value) { puzzleStartedAt = value; },
    get hintsUsed() { return hintsUsed; },
    set hintsUsed(value) { hintsUsed = value; },
    get mistakes() { return mistakes; },
    set mistakes(value) { mistakes = value; },
    get smartMarking() { return smartMarking; },
    set smartMarking(value) { smartMarking = value; },
    get pendingCelebration() { return pendingCelebration; },
    set pendingCelebration(value) { pendingCelebration = value; },
    get usedClueIds() { return usedClueIds; },
    set usedClueIds(value) { usedClueIds = value; },
    get clueStrategies() { return clueStrategies; },
    set clueStrategies(value) { clueStrategies = value; },
  },
  setMessage,
  render,
  recordOutcome,
});

function startCourse(course: Course, seed = newSeed(), urlMode: "push" | "replace" | "none" = "push"): void {
  challengeOptionsOpen = false;
  activeCourse = course;
  playMode = "challenge";
  difficultyModel = defaultDifficultyModelForCourse(course);
  ({ templateId, difficultyLevel } = puzzleParametersForCourse(course));
  void fetchPuzzle(seed, urlMode);
}

function openSharedPuzzle(input: SharedPuzzleInput): void {
  challengeOptionsOpen = false;
  playMode = "shared";
  difficultyModel = input.difficultyModel ?? "v5";
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

function setPuzzleUrl(seed: string, mode: "push" | "replace" | "none", requestedPlayMode: PlayMode, requestedTemplateId: ScenarioId, requestedDifficultyLevel: number | undefined, requestedCourse: Course, requestedDifficultyModel: "v4" | "v5" | "compare" | undefined): void {
  const url = updatedPuzzleUrl(window.location.href, mode, requestedPlayMode, requestedTemplateId, requestedDifficultyLevel, requestedCourse, seed, requestedDifficultyModel);
  if (url) window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
}

let currentFetchId = 0;
let puzzleLoadFailed = false;
let activePuzzleRequest: AbortController | undefined;
let clueStrategyGeneration = 0;
let activeClueStrategyRequest: AbortController | undefined;

function showLandingPage(): void {
  gameplay.invalidateVerification();
  gameplay.invalidateHint();
  invalidateClueStrategies();
  currentFetchId += 1;
  activePuzzleRequest?.abort();
  activePuzzleRequest = undefined;
  puzzle = null;
  pendingFeedbackRequests.clear();
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
  puzzleCompleted = false;
  feedbackUi = { submitting: false };
  feedbackEntryOpen = false;
  actionMenuOpen = false;
  resetReturnFocusSelector = undefined;
  activeCellKey = undefined;
  clueFilter = "all";
  challengeOptionsOpen = false;
  sharedPuzzleOpen = false;
  puzzleStartedAt = undefined;
  hintsUsed = 0;
  mistakes = 0;
  setMessage("Choose your next puzzle when you are ready.");
  render();
}

function invalidateClueStrategies(): void {
  clueStrategyGeneration += 1;
  activeClueStrategyRequest?.abort();
  activeClueStrategyRequest = undefined;
}

async function loadClueStrategies(requestedPuzzle: Puzzle): Promise<void> {
  if (!requestedPuzzle.puzzleToken || requestedPuzzle.clues.every(clue => clue.strategy)) return;
  const requestGeneration = ++clueStrategyGeneration;
  activeClueStrategyRequest?.abort();
  const requestController = new AbortController();
  activeClueStrategyRequest = requestController;
  try {
    const strategies = await fetchClueStrategies(requestedPuzzle, requestController.signal);
    if (!strategies) return;
    if (requestGeneration !== clueStrategyGeneration || puzzle?.id !== requestedPuzzle.id) return;
    clueStrategies = { ...clueStrategies, ...strategies };
    render();
  } catch {
    // Clue labels are optional and must not block puzzle play.
  } finally {
    if (requestGeneration === clueStrategyGeneration) activeClueStrategyRequest = undefined;
  }
}

async function fetchPuzzle(seed = newSeed(), urlMode: "push" | "replace" | "none" = "replace"): Promise<void> {
  gameplay.invalidateVerification();
  gameplay.invalidateHint();
  invalidateClueStrategies();
  const requestedSeed = seed;
  const requestedTemplateId = templateId;
  const requestedDifficultyLevel = difficultyLevel;
  const requestedDifficultyModel = difficultyModel;
  const requestedPlayMode = playMode;
  const requestedCourse = activeCourse;
  if (shouldRecordPuzzleAbandoned(Boolean(puzzle), puzzleCompleted)) recordOutcome("puzzle_abandoned");
  loading = true;
  difficultyUnavailable = false;
  puzzleLoadFailed = false;
  setMessage("Tako is setting up your puzzle…");
  const fetchId = ++currentFetchId;
  activePuzzleRequest?.abort();
  const requestController = new AbortController();
  activePuzzleRequest = requestController;
  render();
  try {
    const data = await loadPuzzle(
      { seed: requestedSeed, templateId: requestedTemplateId, difficultyLevel: requestedDifficultyLevel, ...(requestedDifficultyModel ? { difficultyModel: requestedDifficultyModel } : {}) },
      { storage: localStorage, signal: requestController.signal, isCurrent: () => fetchId === currentFetchId },
    );
    if (fetchId !== currentFetchId) return;
    activatePuzzle(data, requestedSeed, urlMode, requestedPlayMode, requestedTemplateId, requestedDifficultyLevel, requestedCourse, requestedDifficultyModel);
  } catch (error) {
    if (fetchId !== currentFetchId) return;
    puzzle = null;
    puzzleLoadFailed = true;
    difficultyUnavailable = error instanceof DifficultyUnavailableError;
    setMessage(error instanceof Error ? error.message : "We couldn’t load this puzzle. Please try again.", "error");
  } finally {
    if (fetchId === currentFetchId) {
      activePuzzleRequest = undefined;
      loading = false;
      render();
    }
  }
}

function activatePuzzle(data: Puzzle, requestedSeed: string, urlMode: "push" | "replace" | "none", requestedPlayMode: PlayMode, requestedTemplateId: ScenarioId, requestedDifficultyLevel: number | undefined, requestedCourse: Course, requestedDifficultyModel: "v4" | "v5" | "compare" | undefined): void {
  puzzle = data;
  pendingFeedbackRequests.clear();
  puzzleCompleted = false;
  feedbackUi = { submitting: false };
  feedbackEntryOpen = false;
  actionMenuOpen = false;
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
  setPuzzleUrl(requestedSeed, urlMode, requestedPlayMode, requestedTemplateId, requestedDifficultyLevel, requestedCourse, requestedDifficultyModel);
  setMessage("As you solve, mark a match ✓, rule out a square ×, or leave it blank while you think.");
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
  setMessage("Grid cleared. Your previous marks are available with Undo.");
  render();
  restoreResetFocus();
}

function resetBoard(): void {
  if (!puzzle || Object.keys(board).length === 0) return;
  saveCurrentBoard({});
  pendingBoardReset = false;
  setMessage("Board cleared. Your previous marks are available with Undo.");
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

async function sharePuzzle(): Promise<void> {
  try {
    await navigator.clipboard.writeText(window.location.href);
    setMessage("Puzzle link copied. Share this exact dojo challenge with a friend.", "success");
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
    puzzleCompleted,
    feedback: feedbackUi,
    feedbackSubmitted: Boolean(puzzle?.puzzleFingerprint && (
      submittedFeedbackFingerprints.has(puzzle.puzzleFingerprint)
      || hasSubmittedPuzzleFeedback(localStorage, puzzle.puzzleFingerprint)
    )),
    feedbackEntryOpen,
    actionMenuOpen,
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
  if (button.id === "check-solution") void gameplay.checkAnswer();
  else if (button.id === "hint") void gameplay.requestHint();
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
  gameplay.invalidateVerification();
  gameplay.invalidateHint();
  currentFetchId += 1;
  loading = false;
  difficultyUnavailable = false;
  progress = resetProgress();
  saveProgress(localStorage, progress);
  activeCourse = firstAvailableCourse(progress.completed);
  ({ templateId, difficultyLevel } = puzzleParametersForCourse(activeCourse));
  difficultyModel = defaultDifficultyModelForCourse(activeCourse);
  puzzle = null;
  board = {};
  undoStack = [];
  usedClueIds = new Set();
  playMode = "challenge";
  challengeOptionsOpen = false;
  pendingProgressReset = false;
  window.history.pushState({}, "", window.location.pathname);
  setMessage("Puzzle Challenge progress reset. Beginner Level 1 is ready.");
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

function chooseFeedbackRating(rating: PuzzleFeedbackRating): void {
  feedbackUi = {
    ...feedbackUi,
    selectedRating: rating,
    selectedReason: rating === "too_hard" ? feedbackUi.selectedReason : undefined,
    status: undefined,
  };
  if (!puzzleCompleted) {
    actionMenuOpen = true;
    feedbackEntryOpen = true;
  }
  render();
  root.querySelector<HTMLButtonElement>(`[data-feedback-rating="${CSS.escape(rating)}"]`)?.focus();
}

function chooseFeedbackReason(reason: PuzzleFeedbackReason): void {
  feedbackUi = { ...feedbackUi, selectedReason: feedbackUi.selectedReason === reason ? undefined : reason, status: undefined };
  if (!puzzleCompleted) {
    actionMenuOpen = true;
    feedbackEntryOpen = true;
  }
  render();
  root.querySelector<HTMLButtonElement>(`[data-feedback-reason="${CSS.escape(reason)}"]`)?.focus();
}

async function submitPuzzleFeedback(): Promise<void> {
  const requestedPuzzle = puzzle;
  const fingerprint = requestedPuzzle?.puzzleFingerprint;
  const rating = feedbackUi.selectedRating;
  if (!requestedPuzzle || !fingerprint || !rating || feedbackUi.submitting) return;
  if (submittedFeedbackFingerprints.has(fingerprint) || hasSubmittedPuzzleFeedback(localStorage, fingerprint)) return;
  const request = createOrReusePuzzleFeedbackRequest(pendingFeedbackRequests, {
    puzzle: requestedPuzzle,
    rating,
    reason: feedbackUi.selectedReason,
    outcome: puzzleCompleted ? "completed" : "in_progress",
    hintsUsed,
    mistakes,
    puzzleStartedAt,
    smartMarkingEnabled: smartMarking,
  }, () => crypto.randomUUID());
  if (!request) return;
  feedbackUi = { ...feedbackUi, submitting: true, status: undefined };
  render();
  try {
    await postPuzzleFeedback(request);
    submittedFeedbackFingerprints.add(fingerprint);
    markPuzzleFeedbackSubmitted(localStorage, fingerprint);
    pendingFeedbackRequests.delete(fingerprint);
    if (puzzle?.puzzleFingerprint === fingerprint) feedbackUi = { submitting: false, status: "success" };
  } catch {
    if (puzzle?.puzzleFingerprint === fingerprint) feedbackUi = { ...feedbackUi, submitting: false, status: "error" };
  }
  if (puzzle?.puzzleFingerprint === fingerprint) render();
}

function handleFeedbackClick(button: HTMLButtonElement): boolean {
  if (button.dataset.feedbackRating && (PUZZLE_FEEDBACK_RATINGS as readonly string[]).includes(button.dataset.feedbackRating)) {
    chooseFeedbackRating(button.dataset.feedbackRating as PuzzleFeedbackRating);
  } else if (button.dataset.feedbackReason && (PUZZLE_FEEDBACK_REASONS as readonly string[]).includes(button.dataset.feedbackReason)) {
    chooseFeedbackReason(button.dataset.feedbackReason as PuzzleFeedbackReason);
  } else if (button.dataset.submitPuzzleFeedback) void submitPuzzleFeedback();
  else return false;
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
    setMessage(smartMarking ? "Auto-mark is on. New matches will rule out the other squares in their row and column." : "Auto-mark is off. You can choose every mark yourself.");
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
  updateBoardDom({ root, previous, current, board, loading, undoCount: undoStack.length });
  focusGridCell(key);
  return true;
}

const clickActions: ((button: HTMLButtonElement) => boolean)[] = [
  handleFeedbackClick,
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

function handleGridKeydown(event: KeyboardEvent): void {
  if (handleGridCellKeydown(event, puzzle, focusGridCell)) return;
  handleGridTabKeydown(event, puzzle, selectGrid);
}

root.addEventListener("keydown", event => {
  if (handleDialogKeydown(event)) return;
  handleGridKeydown(event);
});

root.addEventListener("toggle", event => {
  const details = event.target as HTMLDetailsElement;
  if (details.classList.contains("action-menu")) actionMenuOpen = details.open;
  if (details.classList.contains("feedback-entry")) feedbackEntryOpen = details.open;
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
  difficultyModel = route.difficultyModel;
  templateId = route.templateId;
  if (route.seed) void fetchPuzzle(route.seed, "none");
  else showLandingPage();
});

render();
const initialSeed = seedFromUrl();
if (initialSeed) void fetchPuzzle(initialSeed, "none");
}
