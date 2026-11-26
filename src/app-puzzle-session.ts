import { fetchClueStrategies as fetchStrategiesFromApi } from "./app-requests";
import type { PlayMode, PuzzleUrlMode } from "./app-routing";
import type { Course } from "./curriculum";
import type { ClueStrategy } from "./clue-strategy-catalog";
import { DifficultyUnavailableError, loadPuzzle, type PuzzleLoadRequest } from "./puzzle-loader";
import type { Puzzle } from "./puzzle";
import type { PuzzleStorageLike } from "./puzzle-cache/core";
import type { ScenarioId } from "./scenarios";
import type { StatusTone } from "./ui-types";

type FetchClueStrategies = (puzzle: Puzzle, signal: AbortSignal) => Promise<Record<string, ClueStrategy> | undefined>;

export interface PuzzleSessionRequest extends Omit<PuzzleLoadRequest, "templateId"> {
  templateId: ScenarioId;
  playMode: PlayMode;
  course: Course;
  urlMode: PuzzleUrlMode;
}

export interface PuzzleSessionState {
  puzzle: Puzzle | null;
  loading: boolean;
  difficultyUnavailable: boolean;
  puzzleLoadFailed: boolean;
}

export interface AppPuzzleSessionController {
  load(request: PuzzleSessionRequest): Promise<void>;
  loadClueStrategies(puzzle: Puzzle): Promise<void>;
  cancel(): void;
}

export interface AppPuzzleSessionDependencies {
  state: PuzzleSessionState;
  storage: PuzzleStorageLike;
  loadPuzzle?(request: PuzzleLoadRequest, dependencies: {
    storage: PuzzleStorageLike;
    signal: AbortSignal;
    isCurrent(): boolean;
  }): Promise<Puzzle>;
  fetchClueStrategies?: FetchClueStrategies;
  beforeLoad(): void;
  onActivate(puzzle: Puzzle, request: PuzzleSessionRequest): void;
  onClueStrategies(puzzle: Puzzle, strategies: Record<string, ClueStrategy>): void;
  setMessage(message: string, tone?: StatusTone): void;
  render(): void;
}

/** Coordinates puzzle loads and optional clue-label requests for one app session. */
export function createAppPuzzleSessionController({
  state,
  storage,
  loadPuzzle: load = loadPuzzle,
  fetchClueStrategies: fetchStrategies = fetchStrategiesFromApi,
  beforeLoad,
  onActivate,
  onClueStrategies,
  setMessage,
  render,
}: AppPuzzleSessionDependencies): AppPuzzleSessionController {
  let loadGeneration = 0;
  let activeLoad: AbortController | undefined;
  let clueStrategyGeneration = 0;
  let activeClueStrategyLoad: AbortController | undefined;

  function invalidateClueStrategies(): void {
    clueStrategyGeneration += 1;
    activeClueStrategyLoad?.abort();
    activeClueStrategyLoad = undefined;
  }

  async function loadClueStrategies(puzzle: Puzzle): Promise<void> {
    if (!puzzle.puzzleToken || puzzle.clues.every(clue => clue.strategy)) return;
    const requestGeneration = ++clueStrategyGeneration;
    activeClueStrategyLoad?.abort();
    const requestController = new AbortController();
    activeClueStrategyLoad = requestController;
    try {
      const strategies = await fetchStrategies(puzzle, requestController.signal);
      if (!strategies || requestGeneration !== clueStrategyGeneration || state.puzzle?.id !== puzzle.id) return;
      onClueStrategies(puzzle, strategies);
    } catch {
      // Clue labels are optional and must not block puzzle play.
    } finally {
      if (requestGeneration === clueStrategyGeneration) activeClueStrategyLoad = undefined;
    }
  }

  async function loadRequestedPuzzle(request: PuzzleSessionRequest): Promise<void> {
    beforeLoad();
    invalidateClueStrategies();
    state.loading = true;
    state.difficultyUnavailable = false;
    state.puzzleLoadFailed = false;
    setMessage("Tako is setting up your puzzle…");

    const requestGeneration = ++loadGeneration;
    activeLoad?.abort();
    const requestController = new AbortController();
    activeLoad = requestController;
    render();

    const puzzleRequest: PuzzleLoadRequest = {
      seed: request.seed,
      templateId: request.templateId,
      difficultyLevel: request.difficultyLevel,
      ...(request.difficultyModel ? { difficultyModel: request.difficultyModel } : {}),
    };
    try {
      const data = await load(puzzleRequest, {
        storage,
        signal: requestController.signal,
        isCurrent: () => requestGeneration === loadGeneration,
      });
      if (requestGeneration !== loadGeneration) return;
      onActivate(data, request);
    } catch (error) {
      if (requestGeneration !== loadGeneration) return;
      state.puzzle = null;
      state.puzzleLoadFailed = true;
      state.difficultyUnavailable = error instanceof DifficultyUnavailableError;
      setMessage(error instanceof Error ? error.message : "We couldn’t load this puzzle. Please try again.", "error");
    } finally {
      if (requestGeneration === loadGeneration) {
        activeLoad = undefined;
        state.loading = false;
        render();
      }
    }
  }

  function cancel(): void {
    loadGeneration += 1;
    activeLoad?.abort();
    activeLoad = undefined;
    invalidateClueStrategies();
  }

  return { load: loadRequestedPuzzle, loadClueStrategies, cancel };
}
