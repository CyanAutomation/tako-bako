import { squareKey } from "./puzzle-board/marks";
import { answerFromBoard } from "./puzzle-board/answer";
import { resolveAnswerOutcome } from "./app-answer-outcome";
import { createHintRequestBody, type HintRequestOptions } from "./hint-request";
import { requestAnswerVerification, requestHintResponse } from "./app-requests";
import { clampElapsedMs, postGameEvent } from "./events";
import { saveBoard, saveUsedClues } from "./puzzle-storage";
import { saveProgress } from "./progress-storage";
import type { Board, Puzzle } from "./puzzle";
import type { PlayMode } from "./app-routing";
import type { ChallengeProgress } from "./progress-types";
import type { Course } from "./curriculum";
import type { ClueStrategy } from "./clue-strategy-catalog";
import type { ParsedHintResponse } from "./hint-response";
import type { StatusTone } from "./ui-types";

interface AppGameplayState {
  puzzle: Puzzle | null;
  board: Board;
  loading: boolean;
  playMode: PlayMode;
  activeCourse: Course;
  progress: ChallengeProgress;
  difficultyLevel: number | undefined;
  puzzleStartedAt: number | undefined;
  hintsUsed: number;
  mistakes: number;
  smartMarking: boolean;
  pendingCelebration: boolean;
  usedClueIds: Set<string>;
  clueStrategies: Record<string, ClueStrategy>;
}

interface AppGameplayDependencies {
  state: AppGameplayState;
  setMessage(text: string, tone?: StatusTone): void;
  render(): void;
  recordOutcome(event: "puzzle_started" | "puzzle_completed" | "hint_used" | "mistake" | "puzzle_abandoned"): void;
}

export function createAppGameplayActions({ state, setMessage, render, recordOutcome }: AppGameplayDependencies) {
  let verificationGeneration = 0;
  let activeVerificationRequest: AbortController | undefined;
  let hintGeneration = 0;
  let activeHintRequest: AbortController | undefined;

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

  function applyAnswerResult(correct: boolean, requestedPlayMode: PlayMode, requestedCourse: Course): void {
    const outcome = resolveAnswerOutcome({ correct, playMode: requestedPlayMode, course: requestedCourse, progress: state.progress });
    state.mistakes = Math.min(100, state.mistakes + outcome.mistakeCountDelta);
    recordOutcome(outcome.event);
    if (outcome.persistProgress) {
      state.progress = outcome.progress;
      saveProgress(localStorage, state.progress);
    }
    setMessage(outcome.message, outcome.tone);
    if (outcome.celebrate) state.pendingCelebration = true;
  }

  async function checkAnswer(): Promise<void> {
    if (!state.puzzle) return;
    const requestedPuzzle = state.puzzle;
    const requestedPuzzleId = requestedPuzzle.id;
    const requestedPuzzleToken = requestedPuzzle.puzzleToken;
    const requestedPlayMode = state.playMode;
    const requestedCourse = state.activeCourse;
    const requestGeneration = ++verificationGeneration;
    activeVerificationRequest?.abort();
    const requestController = new AbortController();
    activeVerificationRequest = requestController;
    const isActiveRequest = () => requestGeneration === verificationGeneration
      && state.puzzle?.id === requestedPuzzleId
      && state.puzzle.puzzleToken === requestedPuzzleToken;
    const answer = answerFromBoard(state.board, requestedPuzzle.spec);
    if (!answer) {
      setMessage("Choose one ✓ in each row and column before checking your solution.", "warning");
      render();
      return;
    }
    if (!requestedPuzzleToken) {
      setMessage("Solution checking isn’t available for this puzzle just now.", "error");
      render();
      return;
    }
    state.loading = true;
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
        state.loading = false;
        render();
      }
    }
  }

  function applyHintResponse(hint: ParsedHintResponse, puzzleId: string, previousBoard: Board, previousUsedClueIds: ReadonlySet<string>): void {
    if (hint.kind === "placement") {
      state.board = { ...previousBoard, [squareKey(hint.placement.category, hint.placement.subject, hint.placement.value)]: "yes" };
      saveBoard(puzzleId, state.board);
      setMessage(`Hint: ${hint.placement.subject} matches ${hint.placement.value}.`);
      return;
    }
    if (hint.clue.id !== undefined) {
      state.usedClueIds = new Set(previousUsedClueIds).add(hint.clue.id);
      saveUsedClues(puzzleId, state.usedClueIds);
    }
    setMessage(`Hint: ${hint.clue.text}`);
  }

  function recordHintUsage(requestedPuzzle: Puzzle, requestedDifficultyLevel: number | undefined, requestedPuzzleStartedAt: number | undefined, usedHints: number, currentMistakes: number): void {
    postGameEvent({
      schemaVersion: 1,
      event: "hint_used",
      templateId: requestedPuzzle.templateId,
      requestedDifficultyLevel,
      assessedDifficultyLevel: requestedPuzzle.difficulty.level,
      clueCount: requestedPuzzle.clues.length,
      elapsedMs: clampElapsedMs(requestedPuzzleStartedAt),
      hintsUsed: usedHints,
      mistakes: currentMistakes,
    });
  }

  async function requestHint(): Promise<void> {
    if (!state.puzzle) return;
    const requestedPuzzle = state.puzzle;
    const requestedPuzzleId = requestedPuzzle.id;
    const requestedPuzzleToken = requestedPuzzle.puzzleToken;
    if (!requestedPuzzleToken) return;
    const requestedBoard = { ...state.board };
    const requestedUsedClueIds = new Set(state.usedClueIds);
    const requestedDifficultyLevel = state.difficultyLevel;
    const requestedPuzzleStartedAt = state.puzzleStartedAt;
    const requestedHintsUsed = state.hintsUsed;
    const requestGeneration = ++hintGeneration;
    activeHintRequest?.abort();
    const requestController = new AbortController();
    activeHintRequest = requestController;
    const isActiveRequest = () => requestGeneration === hintGeneration
      && state.puzzle?.id === requestedPuzzleId
      && state.puzzle.puzzleToken === requestedPuzzleToken;
    const options: HintRequestOptions = {
      puzzle: { ...requestedPuzzle, puzzleToken: requestedPuzzleToken },
      board: requestedBoard,
      usedClueIds: requestedUsedClueIds,
      clueStrategies: state.clueStrategies,
      hintsUsed: requestedHintsUsed,
      mistakes: state.mistakes,
      difficultyLevel: requestedDifficultyLevel,
      puzzleStartedAt: requestedPuzzleStartedAt,
      now: Date.now(),
      smartMarking: state.smartMarking,
    };
    const body = createHintRequestBody(options);
    state.loading = true;
    setMessage("Tako is finding the next helpful nudge…");
    render();
    try {
      const hint = await requestHintResponse(body, requestController.signal, isActiveRequest);
      if (!hint) return;
      applyHintResponse(hint, requestedPuzzleId, requestedBoard, requestedUsedClueIds);
      state.hintsUsed = requestedHintsUsed + 1;
      recordHintUsage(requestedPuzzle, requestedDifficultyLevel, requestedPuzzleStartedAt, state.hintsUsed, state.mistakes);
    } catch {
      if (!isActiveRequest()) return;
      setMessage("Tako can’t offer a hint just now. Please try again in a moment.", "error");
    } finally {
      if (isActiveRequest()) {
        activeHintRequest = undefined;
        state.loading = false;
        render();
      }
    }
  }

  return { checkAnswer, requestHint, invalidateVerification, invalidateHint };
}
