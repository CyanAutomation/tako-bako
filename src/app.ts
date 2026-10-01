import { answerFromBoard, boardSolveProgress, markBoard, squareKey } from "./puzzle-board";
import { parseAnswerVerification } from "./answer-verification";
import { createHintRequestBody, parseHintResponse, type HintRequestBody, type ParsedHintResponse } from "./hint-request";
import { loadBoard, loadUsedClues, saveBoard, saveUsedClues } from "./puzzle-storage";
import type { Board, Puzzle } from "./puzzle";
import { DifficultyUnavailableError, loadPuzzle } from "./puzzle-loader";
import { dailySeed } from "./daily";
import { DEFAULT_SCENARIO_ID, scenarioIdFromUrl, type ScenarioId } from "./scenarios";
import { courseFor, courseProgressLabel, firstAvailableCourse, nextCourse, puzzleParametersForCourse, type Course } from "./curriculum";
import { completeCourse, loadProgress, resetProgress, saveProgress, shouldAdvanceProgress } from "./progress";
import { parseSharedPuzzleInput, type SharedPuzzleInput } from "./shared-puzzle";
import { isValidSeed, parseDifficultyLevel } from "./puzzle-input";
import { parseClueStrategyResults } from "./clue-strategy-results";
import type { ClueStrategy } from "./clue-strategy-catalog";
import { renderBoardToolbar, renderCluePanel, renderCurriculum, renderGridWorkspace, renderPuzzleHeader, type ClueFilter } from "./sections";
import { escapeHtml, renderBadge, renderButton, renderStatus } from "./ui-controls";
import { renderDialog, renderDisclosure, trapDialogTab } from "./ui-dialog";
import { gridCellLabel, nextGridCellKey, nextTabId, renderGridCard, renderGridCell } from "./ui-grid";
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
type PlayMode = "challenge" | "shared";

let progress = loadProgress(localStorage);
let playMode: PlayMode = modeFromUrl();
let activeCourse: Course = courseFromUrl() ?? firstAvailableCourse(progress.completed);
let difficultyLevel = playMode === "challenge" ? activeCourse.difficultyLevel : difficultyFromUrl();
let templateId: ScenarioId = playMode === "challenge" ? activeCourse.templateId : templateFromUrl();
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
  void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ event, templateId: puzzle.templateId, requestedDifficultyLevel: difficultyLevel, assessedDifficultyLevel: puzzle.difficulty.level, clueCount: puzzle.clues.length, elapsedMs: puzzleStartedAt ? Math.min(86_400_000, Date.now() - puzzleStartedAt) : undefined, hintsUsed, smartMarkingEnabled: smartMarking }) }).catch(() => undefined);
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
  const seed = new URL(window.location.href).searchParams.get("seed");
  return seed !== null && isValidSeed(seed) ? seed : undefined;
}

function difficultyFromUrl(): number | undefined {
  const level = new URL(window.location.href).searchParams.get("difficulty");
  return parseDifficultyLevel(level);
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

function setPuzzleUrl(seed: string, mode: "push" | "replace" | "none", requestedPlayMode: PlayMode, requestedTemplateId: ScenarioId, requestedDifficultyLevel: number | undefined, requestedCourse: Course): void {
  if (mode === "none") return;
  const url = new URL(window.location.href);
  url.searchParams.set("seed", seed);
  url.searchParams.set("mode", requestedPlayMode);
  if (requestedPlayMode === "challenge") {
    url.searchParams.set("tier", requestedCourse.tier);
    url.searchParams.set("level", String(requestedCourse.level));
    url.searchParams.delete("template");
    url.searchParams.delete("difficulty");
  } else {
    url.searchParams.delete("tier");
    url.searchParams.delete("level");
    if (requestedTemplateId === DEFAULT_SCENARIO_ID) url.searchParams.delete("template"); else url.searchParams.set("template", requestedTemplateId);
    if (requestedDifficultyLevel) url.searchParams.set("difficulty", String(requestedDifficultyLevel)); else url.searchParams.delete("difficulty");
  }
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
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
    recordHintUsage(requestedPuzzle, requestedDifficultyLevel, requestedPuzzleStartedAt, hintsUsed);
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

function recordHintUsage(requestedPuzzle: Puzzle, requestedDifficultyLevel: number | undefined, requestedPuzzleStartedAt: number, usedHints: number): void {
  const elapsedMs = requestedPuzzleStartedAt ? Math.min(86_400_000, Date.now() - requestedPuzzleStartedAt) : undefined;
  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event: "hint_used",
      templateId: requestedPuzzle.templateId,
      requestedDifficultyLevel,
      assessedDifficultyLevel: requestedPuzzle.difficulty.level,
      clueCount: requestedPuzzle.clues.length,
      elapsedMs,
      hintsUsed: usedHints,
    }),
  }).catch(() => undefined);
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
    controls: renderButton({ id: `grid-reset-${category.id}`, label: `Reset ${category.label} grid`, icon: "reset", disabled: !Object.keys(board).some(key => key.split("|")[0] === category.id), data: { gridReset: category.id, actionRole: "utility" } }),
    content: `<div class="table-wrap"><table><thead><tr><th scope="col">${escapeHtml(base.label)}</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>`,
  });
}

function renderResetModal(current: Puzzle): string {
  if (pendingBoardReset) return `<div class="modal-backdrop">${renderDialog({ id: "reset-board-dialog", eyebrow: "Reset board", title: "Clear all board marks?", description: "This clears every tick and cross in every grid. You can still use Undo afterwards.", actions: `${renderButton({ id: "cancel-board-reset", label: "Cancel" })}${renderButton({ id: "confirm-board-reset", label: "Reset board", variant: "danger" })}` })}</div>`;
  if (!pendingResetGridId) return "";
  const category = current.spec.categories.find(candidate => candidate.id === pendingResetGridId);
  if (!category) return "";
  return `<div class="modal-backdrop">${renderDialog({ id: "reset-grid", eyebrow: "Reset grid", title: `Clear ${category.label}?`, description: "This clears every tick and cross in this grid. You can still use Undo afterwards.", actions: `${renderButton({ id: "cancel-grid-reset", label: "Cancel" })}${renderButton({ id: "confirm-grid-reset", label: "Reset grid", variant: "danger" })}` })}</div>`;
}

function renderNewChallengeModal(): string {
  if (!pendingNewChallenge) return "";
  return `<div class="modal-backdrop">${renderDialog({ id: "new-challenge", eyebrow: "New challenge", title: "Leave this puzzle?", description: "Your marks are saved, but you will start a different puzzle.", actions: `${renderButton({ id: "cancel-new-challenge", label: "Keep solving" })}${renderButton({ id: "confirm-new-challenge", label: "Start new challenge", variant: "primary" })}` })}</div>`;
}

function renderProgressResetModal(): string {
  if (!pendingProgressReset) return "";
  return `<div class="modal-backdrop">${renderDialog({ id: "reset-progress", eyebrow: "Puzzle Challenge progress", title: "Reset your Puzzle Challenge?", description: "This relocks levels and returns you to Beginner Level 1. Saved boards and shared puzzle links stay untouched.", actions: `${renderButton({ id: "cancel-progress-reset", label: "Keep my progress" })}${renderButton({ id: "confirm-progress-reset", label: "Reset progress", variant: "danger" })}` })}</div>`;
}

function renderMascotNote({ title, copy, mood = "ready" }: { title: string; copy: string; mood?: "ready" | "celebrate" }): string {
  return `<aside class="mascot-note mascot-note--${mood}" aria-label="A note from Tako"><img src="${mascotUrl}" alt="Tako, the Tako Bako mascot"><div><p class="eyebrow">A note from Tako</p><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p></div></aside>`;
}

function renderCelebrationModal(): string {
  if (!pendingCelebration) return "";
  const next = playMode === "challenge" ? nextCourse(activeCourse) : undefined;
  const title = playMode === "challenge" ? "Level complete!" : "Puzzle solved!";
  const copy = next ? `${next.label} is ready when you are.` : playMode === "challenge" ? "You’ve completed every level in the Puzzle Challenge. Congratulations!" : "Every match is in place. Share this puzzle or start another.";
  const actions = next ? `${renderButton({ id: "celebration-close", label: "Return to the dojo" })}${renderButton({ id: "celebration-continue", label: `Start ${next.label}`, variant: "primary" })}` : renderButton({ id: "celebration-close", label: "Return to the dojo", variant: "primary" });
  return `<div class="modal-backdrop celebration-backdrop">${renderDialog({ id: "celebration", className: "celebration-dialog", eyebrow: "Solved!", title, description: copy, content: renderMascotNote({ title: "Excellent deduction.", copy: "Patient marking and clear logic brought every tile into place.", mood: "celebrate" }), actions })}</div>`;
}

function renderProgressManagement(): string {
  const completed = progress.completed.length;
  return `<section class="progress-management" aria-label="Puzzle Challenge progress"><div><p class="eyebrow">Your progress</p><strong>${completed} of 12 levels complete</strong><p>Your saved boards stay separate from your Puzzle Challenge progress.</p></div>${renderDisclosure({ className: "progress-settings", summary: "Progress settings", content: renderButton({ id: "open-progress-reset", label: "Reset progress", variant: "danger" }) })}</section>`;
}

function renderChallengeOptions(): string {
  if (!challengeOptionsOpen) return "";
  const content = `${renderCurriculum({ completed: new Set(progress.completed), currentCourseId: activeCourse.id, showHeading: false })}<div class="challenge-extras"><p>Today’s puzzle matches your current level. Solve it to move forward.</p>${renderButton({ id: "daily-puzzle", label: "Play today’s puzzle", disabled: loading })}</div>`;
  return `<div class="modal-backdrop course-menu-backdrop">${renderDialog({ id: "challenge-menu-dialog", className: "course-dialog", eyebrow: "Your Puzzle Challenge", title: "Choose your next level", description: "Complete each level to unlock the next.", content, actions: `${renderButton({ id: "close-challenge-menu", label: "Close" })}` })}</div>`;
}

function renderSharedPuzzleModal(): string {
  if (!sharedPuzzleOpen) return "";
  const content = `<label class="seed-entry">Shared puzzle link or code <input id="landing-seed-input" placeholder="Paste a link or code" autocomplete="off"></label>`;
  const actions = `${renderButton({ id: "close-shared-puzzle", label: "Cancel" })}${renderButton({ id: "open-landing-seed", label: "Open puzzle", variant: "primary" })}`;
  return `<div class="modal-backdrop">${renderDialog({ id: "shared-puzzle", eyebrow: "Shared puzzle", title: "Open a shared puzzle", description: "Paste a friend’s link or puzzle code to pick up the exact puzzle.", content, actions })}</div>`;
}

function renderPuzzle(current: Puzzle): string {
  const base = current.spec.categories.find(category => category.id === current.spec.baseCategory);
  if (!base) throw new Error("Puzzle has no base category");
  const categories = current.spec.categories.filter(category => category.id !== base.id);
  const activeCategory = categories.find(category => category.id === activeGridId) ?? categories[0];
  activeGridId = activeCategory.id;
  const grids = categories.map(category => boardGrid(category, base)).join("");
  const canCheck = Boolean(current.puzzleToken && answerFromBoard(board, current.spec));
  const progress = boardSolveProgress(board, current.spec);
  const title = playMode === "challenge" ? activeCourse.label : current.spec.title;
  const courseLabel = playMode === "challenge" ? `${activeCourse.tier[0]!.toUpperCase()}${activeCourse.tier.slice(1)} · Level ${activeCourse.level}` : `Shared · Level ${current.difficulty.level}`;
  return `<main>${renderPuzzleHeader({ title, difficulty: courseLabel, message, tone: messageTone })}<section class="workspace">${renderGridWorkspace({ categories, activeGridId: activeCategory.id, toolbar: renderBoardToolbar({ matches: progress.matches, total: progress.total, undoDisabled: undoStack.length === 0 || loading, resetDisabled: loading || Object.keys(board).length === 0, checkDisabled: loading || !canCheck, hintDisabled: loading || !current.puzzleToken, smartMarking }), grids })}${renderCluePanel({ clues: current.clues.map(clue => ({ ...clue, strategy: clue.strategy ?? clueStrategies[clue.id] })), activeCategory, cluesOpen, usedClueIds, clueFilter })}</section></main>${renderResetModal(current)}${renderNewChallengeModal()}${renderCelebrationModal()}`;
}

function renderLandingAction(): string {
  if (difficultyUnavailable) return renderButton({ id: "try-another-puzzle", label: "Try another puzzle", variant: "primary", disabled: loading });
  return renderButton({ id: "start-puzzle", label: loading ? "Preparing challenge…" : puzzleLoadFailed ? `Retry ${activeCourse.label}` : `Start ${activeCourse.label}`, variant: "primary", disabled: loading });
}

function render(): void {
  const actionMenu = renderDisclosure({ className: "action-menu", summary: "More", content: `${renderButton({ id: "open-shared-puzzle", label: "Open a shared puzzle" })}${renderButton({ id: "new-puzzle", label: loading ? "Setting up…" : playMode === "challenge" ? "Restart this level" : "New shared puzzle", disabled: loading })}<div class="action-menu__danger">${renderButton({ id: "open-progress-reset", label: "Reset progress", variant: "danger" })}</div>` });
  root.innerHTML = `<div class="page-shell"><header><a class="brand" href="/" aria-label="Tako Bako home"><span class="brand-mark"><img src="${mascotUrl}" alt="" aria-hidden="true"></span><span class="brand-lockup"><strong>Tako Bako</strong><span>Logic puzzles</span><small>Mark · Deduce · Solve</small></span></a>${puzzle ? `<div class="header-actions">${playMode === "challenge" ? renderBadge(courseProgressLabel(activeCourse, new Set(progress.completed)), "course-status") : ""}${renderButton({ id: "challenge-menu", label: "Challenge", expanded: challengeOptionsOpen })}${renderButton({ id: "share-puzzle", label: "Share", ariaLabel: "Share puzzle", icon: "share" })}${actionMenu}</div>` : ""}</header>${puzzle ? renderPuzzle(puzzle) : `<main class="landing-state"><section class="landing-copy"><p class="eyebrow">Yokaiba Logic Dojo</p><h1>One small grid.<br>One satisfying deduction.</h1><p>Follow a clear path from your first mark to advanced, multi-grid logic.</p>${renderStatus({ message, tone: difficultyUnavailable ? "error" : messageTone })}${renderLandingAction()}${renderMascotNote({ title: "Ready to begin?", copy: "Make one thoughtful mark. Tako will keep the notes nearby." })}</section><div class="landing-route">${renderCurriculum({ completed: new Set(progress.completed), currentCourseId: activeCourse.id })}${renderProgressManagement()}</div></main>`}<footer><span class="footer-brand"><img src="${markUrl}" alt="" aria-hidden="true"><span>TAKO BAKO · Yokaiba logic puzzles</span></span><span>Shareable puzzles, optional assists, and solution checking.</span></footer></div>${renderChallengeOptions()}${renderSharedPuzzleModal()}${renderProgressResetModal()}`;
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
  playMode = modeFromUrl();
  activeCourse = courseFromUrl() ?? firstAvailableCourse(progress.completed);
  difficultyLevel = playMode === "challenge" ? activeCourse.difficultyLevel : difficultyFromUrl();
  templateId = playMode === "challenge" ? activeCourse.templateId : templateFromUrl();
  const seed = seedFromUrl();
  if (seed) void fetchPuzzle(seed, "none");
  else showLandingPage();
});

render();
if (seedFromUrl()) void fetchPuzzle(seedFromUrl()!, "none");
}
