import { answerFromBoard, boardSolveProgress, squareKey } from "./puzzle-board";
import { courseProgressLabel, nextCourse, type Course } from "./curriculum";
import type { ChallengeProgress } from "./progress";
import type { Board, Puzzle } from "./puzzle";
import type { ClueStrategy } from "./clue-strategy-catalog";
import { renderBoardToolbar, renderCluePanel, renderCurriculum, renderGridWorkspace, renderPuzzleHeader, type ClueFilter } from "./sections";
import { escapeHtml, renderBadge, renderButton, renderPanel, renderStatus } from "./ui-controls";
import { renderDialog, renderDisclosure } from "./ui-dialog";
import { renderGridCard, renderGridCell } from "./ui-grid";
import type { StatusTone } from "./ui-types";

export interface AppViewState {
  mascotUrl: string;
  markUrl: string;
  puzzle: Puzzle | null;
  board: Board;
  loading: boolean;
  message: string;
  messageTone: StatusTone;
  difficultyUnavailable: boolean;
  puzzleLoadFailed: boolean;
  undoCount: number;
  smartMarking: boolean;
  playMode: "challenge" | "shared";
  progress: ChallengeProgress;
  activeCourse: Course;
  activeGridId: string | undefined;
  activeCellKey: string | undefined;
  usedClueIds: ReadonlySet<string>;
  clueStrategies: Record<string, ClueStrategy>;
  pendingResetGridId: string | undefined;
  pendingBoardReset: boolean;
  pendingNewChallenge: boolean;
  pendingProgressReset: boolean;
  pendingCelebration: boolean;
  cluesOpen: boolean;
  clueFilter: ClueFilter;
  challengeOptionsOpen: boolean;
  sharedPuzzleOpen: boolean;
}

function puzzleCategories(current: Puzzle): { base: Puzzle["spec"]["categories"][number]; grids: Puzzle["spec"]["categories"] } {
  const base = current.spec.categories.find(category => category.id === current.spec.baseCategory);
  if (!base) throw new Error("Puzzle has no base category");
  const grids = current.spec.categories.filter(category => category.id !== base.id);
  if (grids.length === 0) throw new Error("Puzzle has no working grids");
  return { base, grids };
}

export function activeGridForPuzzle(current: Puzzle, requestedGridId: string | undefined): string {
  const { grids } = puzzleCategories(current);
  return grids.find(category => category.id === requestedGridId)?.id ?? grids[0]!.id;
}

function renderBoardGrid(view: AppViewState, category: Puzzle["spec"]["categories"][number], base: Puzzle["spec"]["categories"][number]): string {
  const header = category.values.map(value => `<th scope="col">${escapeHtml(value)}</th>`).join("");
  const rows = base.values.map(row => {
    const cells = category.values.map(column => {
      const key = squareKey(category.id, row, column);
      const mark = view.board[key] ?? "unknown";
      return renderGridCell({ key, row, column, mark, tabIndex: key === view.activeCellKey ? 0 : -1 });
    }).join("");
    return `<tr><th scope="row">${escapeHtml(row)}</th>${cells}</tr>`;
  }).join("");
  const hasMarks = Object.keys(view.board).some(key => key.split("|")[0] === category.id);
  return renderGridCard({
    id: category.id,
    label: `${base.label} × ${category.label}`,
    active: category.id === view.activeGridId,
    locked: false,
    controls: renderButton({ id: `grid-reset-${category.id}`, label: `Reset ${category.label} grid`, icon: "reset", disabled: !hasMarks, data: { gridReset: category.id, actionRole: "utility" } }),
    content: `<div class="table-wrap"><table><thead><tr><th scope="col">${escapeHtml(base.label)}</th>${header}</tr></thead><tbody>${rows}</tbody></table></div>`,
  });
}

function renderResetModal(view: AppViewState): string {
  if (view.pendingBoardReset) return `<div class="modal-backdrop">${renderDialog({ id: "reset-board-dialog", eyebrow: "Reset board", title: "Clear all board marks?", description: "This clears every tick and cross in every grid. You can still use Undo afterwards.", actions: `${renderButton({ id: "cancel-board-reset", label: "Cancel" })}${renderButton({ id: "confirm-board-reset", label: "Reset board", variant: "danger" })}` })}</div>`;
  if (!view.pendingResetGridId || !view.puzzle) return "";
  const category = view.puzzle.spec.categories.find(candidate => candidate.id === view.pendingResetGridId);
  if (!category) return "";
  return `<div class="modal-backdrop">${renderDialog({ id: "reset-grid", eyebrow: "Reset grid", title: `Clear ${category.label}?`, description: "This clears every tick and cross in this grid. You can still use Undo afterwards.", actions: `${renderButton({ id: "cancel-grid-reset", label: "Cancel" })}${renderButton({ id: "confirm-grid-reset", label: "Reset grid", variant: "danger" })}` })}</div>`;
}

function renderNewChallengeModal(open: boolean): string {
  if (!open) return "";
  return `<div class="modal-backdrop">${renderDialog({ id: "new-challenge", eyebrow: "New challenge", title: "Leave this puzzle?", description: "Your marks are saved, but you will start a different puzzle.", actions: `${renderButton({ id: "cancel-new-challenge", label: "Keep solving" })}${renderButton({ id: "confirm-new-challenge", label: "Start new challenge", variant: "primary" })}` })}</div>`;
}

function renderProgressResetModal(open: boolean): string {
  if (!open) return "";
  return `<div class="modal-backdrop">${renderDialog({ id: "reset-progress", eyebrow: "Puzzle Challenge progress", title: "Reset your Puzzle Challenge?", description: "This relocks levels and returns you to Beginner Level 1. Saved boards and shared puzzle links stay untouched.", actions: `${renderButton({ id: "cancel-progress-reset", label: "Keep my progress" })}${renderButton({ id: "confirm-progress-reset", label: "Reset progress", variant: "danger" })}` })}</div>`;
}

function renderMascotNote(mascotUrl: string, { title, copy, mood = "ready" }: { title: string; copy: string; mood?: "ready" | "celebrate" }): string {
  return `<aside class="mascot-note mascot-note--${mood}" aria-label="A note from Tako"><img src="${mascotUrl}" alt="Tako, the Tako Bako mascot"><div><p class="eyebrow">A note from Tako</p><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p></div></aside>`;
}

function renderCelebrationModal(view: AppViewState): string {
  if (!view.pendingCelebration) return "";
  const next = view.playMode === "challenge" ? nextCourse(view.activeCourse) : undefined;
  const title = view.playMode === "challenge" ? "Level complete!" : "Puzzle solved!";
  const copy = next ? `${next.label} is ready when you are.` : view.playMode === "challenge" ? "You’ve completed every level in the Puzzle Challenge. Congratulations!" : "Every match is in place. Share this puzzle or start another.";
  const actions = next
    ? `${renderButton({ id: "celebration-close", label: "Return to the dojo" })}${renderButton({ id: "celebration-continue", label: `Start ${next.label}`, variant: "primary" })}`
    : renderButton({ id: "celebration-close", label: "Return to the dojo", variant: "primary" });
  const content = renderMascotNote(view.mascotUrl, { title: "Excellent deduction.", copy: "Patient marking and clear logic brought every tile into place.", mood: "celebrate" });
  return `<div class="modal-backdrop celebration-backdrop">${renderDialog({ id: "celebration", className: "celebration-dialog", eyebrow: "Solved!", title, description: copy, content, actions })}</div>`;
}

function renderProgressManagement(progress: ChallengeProgress): string {
  const completed = progress.completed.length;
  return renderPanel({
    className: "progress-management",
    labelledBy: "progress-summary",
    content: `<div class="progress-management__summary"><p class="eyebrow">Your progress</p><strong id="progress-summary">${completed} of 12 levels complete</strong><p>Your saved boards stay separate from your Puzzle Challenge progress.</p></div>${renderDisclosure({ className: "progress-settings", summary: "Progress settings", content: renderButton({ id: "open-progress-reset", label: "Reset progress", variant: "danger" }) })}`,
  });
}

function renderChallengeOptions(view: AppViewState): string {
  if (!view.challengeOptionsOpen) return "";
  const content = `${renderCurriculum({ completed: new Set(view.progress.completed), currentCourseId: view.activeCourse.id, showHeading: false })}<div class="challenge-extras"><p>Today’s puzzle matches your current level. Solve it to move forward.</p>${renderButton({ id: "daily-puzzle", label: "Play today’s puzzle", disabled: view.loading })}</div>`;
  return `<div class="modal-backdrop course-menu-backdrop">${renderDialog({ id: "challenge-menu-dialog", className: "course-dialog", eyebrow: "Your Puzzle Challenge", title: "Choose your next level", description: "Complete each level to unlock the next.", content, actions: `${renderButton({ id: "close-challenge-menu", label: "Close" })}` })}</div>`;
}

function renderSharedPuzzleModal(open: boolean): string {
  if (!open) return "";
  const content = `<label class="seed-entry">Shared puzzle link or code <input id="landing-seed-input" placeholder="Paste a link or code" autocomplete="off"></label>`;
  const actions = `${renderButton({ id: "close-shared-puzzle", label: "Cancel" })}${renderButton({ id: "open-landing-seed", label: "Open puzzle", variant: "primary" })}`;
  return `<div class="modal-backdrop">${renderDialog({ id: "shared-puzzle", eyebrow: "Shared puzzle", title: "Open a shared puzzle", description: "Paste a friend’s link or puzzle code to pick up the exact puzzle.", content, actions })}</div>`;
}

function renderPuzzle(view: AppViewState, current: Puzzle): string {
  const { base, grids: categories } = puzzleCategories(current);
  const activeCategory = categories.find(category => category.id === view.activeGridId);
  if (!activeCategory) throw new Error("Puzzle has no active working grid");
  const grids = categories.map(category => renderBoardGrid(view, category, base)).join("");
  const canCheck = Boolean(current.puzzleToken && answerFromBoard(view.board, current.spec));
  const progress = boardSolveProgress(view.board, current.spec);
  const title = view.playMode === "challenge" ? view.activeCourse.label : current.spec.title;
  const courseLabel = view.playMode === "challenge"
    ? `${view.activeCourse.tier[0]!.toUpperCase()}${view.activeCourse.tier.slice(1)} · Level ${view.activeCourse.level}`
    : `Shared · Level ${current.difficulty.level}`;
  const toolbar = renderBoardToolbar({
    matches: progress.matches,
    total: progress.total,
    undoDisabled: view.undoCount === 0 || view.loading,
    resetDisabled: view.loading || Object.keys(view.board).length === 0,
    checkDisabled: view.loading || !canCheck,
    hintDisabled: view.loading || !current.puzzleToken,
    smartMarking: view.smartMarking,
  });
  const clueList = current.clues.map(clue => ({ ...clue, strategy: clue.strategy ?? view.clueStrategies[clue.id] }));
  const workspace = renderGridWorkspace({ categories, activeGridId: activeCategory.id, toolbar, grids });
  const clues = renderCluePanel({ clues: clueList, activeCategory, cluesOpen: view.cluesOpen, usedClueIds: view.usedClueIds, clueFilter: view.clueFilter });
  return `<main>${renderPuzzleHeader({ title, difficulty: courseLabel, message: view.message, tone: view.messageTone })}<section class="workspace">${workspace}${clues}</section></main>${renderResetModal(view)}${renderNewChallengeModal(view.pendingNewChallenge)}${renderCelebrationModal(view)}`;
}

function renderLandingAction(view: AppViewState): string {
  if (view.difficultyUnavailable) return renderButton({ id: "try-another-puzzle", label: "Try another puzzle", variant: "primary", disabled: view.loading });
  const label = view.loading ? "Preparing challenge…" : view.puzzleLoadFailed ? `Retry ${view.activeCourse.label}` : `Start ${view.activeCourse.label}`;
  return renderButton({ id: "start-puzzle", label, variant: "primary", disabled: view.loading });
}

function renderHeader(view: AppViewState): string {
  const actionContent = `${renderButton({ id: "open-shared-puzzle", label: "Open a shared puzzle" })}${renderButton({ id: "new-puzzle", label: view.loading ? "Setting up…" : view.playMode === "challenge" ? "Restart this level" : "New shared puzzle", disabled: view.loading })}<div class="action-menu__danger">${renderButton({ id: "open-progress-reset", label: "Reset progress", variant: "danger" })}</div>`;
  const actionMenu = renderDisclosure({ className: "action-menu", summary: "More", content: actionContent });
  const challengeStatus = view.playMode === "challenge" ? renderBadge(courseProgressLabel(view.activeCourse, new Set(view.progress.completed)), "course-status") : "";
  const actions = `${challengeStatus}${renderButton({ id: "challenge-menu", label: "Challenge", expanded: view.challengeOptionsOpen })}${renderButton({ id: "share-puzzle", label: "Share", ariaLabel: "Share puzzle", icon: "share" })}${actionMenu}`;
  return `<header><a class="brand" href="/" aria-label="Tako Bako home"><span class="brand-mark"><img src="${view.mascotUrl}" alt="" aria-hidden="true"></span><span class="brand-lockup"><strong>Tako Bako</strong><span>Logic puzzles</span><small>Mark · Deduce · Solve</small></span></a>${view.puzzle ? `<div class="header-actions">${actions}</div>` : ""}</header>`;
}

function renderLanding(view: AppViewState): string {
  const tone = view.difficultyUnavailable ? "error" : view.messageTone;
  const mascotNote = renderMascotNote(view.mascotUrl, { title: "Ready to begin?", copy: "Make one thoughtful mark. Tako will keep the notes nearby." });
  const curriculum = renderCurriculum({ completed: new Set(view.progress.completed), currentCourseId: view.activeCourse.id });
  return `<main class="landing-state"><section class="landing-copy"><p class="eyebrow">Yokaiba Logic Dojo</p><h1>One small grid.<br>One satisfying deduction.</h1><p>Follow a clear path from your first mark to advanced, multi-grid logic.</p>${renderStatus({ message: view.message, tone })}${renderLandingAction(view)}${mascotNote}</section><div class="landing-route">${curriculum}${renderProgressManagement(view.progress)}</div></main>`;
}

export function renderApp(view: AppViewState): string {
  const mainContent = view.puzzle ? renderPuzzle(view, view.puzzle) : renderLanding(view);
  const footer = `<footer><span class="footer-brand"><img src="${view.markUrl}" alt="" aria-hidden="true"><span>TAKO BAKO · Yokaiba logic puzzles</span></span><span>Shareable puzzles, optional assists, and solution checking.</span></footer>`;
  return `<div class="page-shell">${renderHeader(view)}${mainContent}${footer}</div>${renderChallengeOptions(view)}${renderSharedPuzzleModal(view.sharedPuzzleOpen)}${renderProgressResetModal(view.pendingProgressReset)}`;
}
