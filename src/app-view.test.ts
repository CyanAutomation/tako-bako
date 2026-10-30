import assert from "node:assert/strict";
import test from "node:test";
import { renderApp, type AppViewState } from "./app-view";
import { firstAvailableCourse } from "./curriculum";
import { emptyProgress } from "./progress";
import type { Puzzle } from "./puzzle";

const puzzle: Puzzle = {
  id: "feedback-puzzle",
  seed: "seed",
  requestedSeed: "seed",
  templateId: "tournament-order-v2",
  puzzleFingerprint: "a".repeat(64),
  puzzleToken: "signed-token",
  clues: [{ id: "clue-1", text: "A is not first." }],
  difficulty: { level: 1, label: "Gentle", modelVersion: "model-v5" },
  spec: {
    id: "tournament-order-v2",
    title: "Puzzle",
    baseCategory: "person",
    categories: [
      { id: "person", label: "Player", values: ["A", "B"] },
      { id: "club", label: "Club", values: ["North", "South"] },
    ],
  },
};

function view(overrides: Partial<AppViewState> = {}): AppViewState {
  return {
    mascotUrl: "/mascot.png",
    markUrl: "/mark.png",
    puzzle,
    board: {},
    loading: false,
    message: "Ready",
    messageTone: "neutral",
    difficultyUnavailable: false,
    puzzleLoadFailed: false,
    undoCount: 0,
    smartMarking: false,
    playMode: "challenge",
    progress: emptyProgress(),
    activeCourse: firstAvailableCourse([]),
    activeGridId: "club",
    activeCellKey: undefined,
    usedClueIds: new Set(),
    clueStrategies: {},
    pendingResetGridId: undefined,
    pendingBoardReset: false,
    pendingNewChallenge: false,
    pendingProgressReset: false,
    pendingCelebration: false,
    puzzleCompleted: false,
    feedback: { submitting: false },
    feedbackSubmitted: false,
    feedbackEntryOpen: false,
    actionMenuOpen: false,
    cluesOpen: true,
    clueFiltersOpen: false,
    smartMarkingToolsOpen: false,
    clueFilter: "all",
    challengeOptionsOpen: false,
    sharedPuzzleOpen: false,
    ...overrides,
  };
}

test("completion modal offers optional ratings and keeps progression actions visible", () => {
  const markup = renderApp(view({ pendingCelebration: true, puzzleCompleted: true }));
  assert.match(markup, /How difficult did you find this puzzle\?/);
  assert.match(markup, /data-feedback-rating="too_easy"/);
  assert.match(markup, /data-feedback-rating="just_right"/);
  assert.match(markup, /data-feedback-rating="too_hard"/);
  assert.match(markup, /aria-pressed="false"/);
  assert.match(markup, /Your rating is optional/);
  assert.match(markup, /id="celebration-continue"/);
  assert.match(markup, /id="celebration-close"/);
});

test("the grid identifies the event order with numbered base rows", () => {
  const markup = renderApp(view());

  assert.match(markup, /<th scope="col">Player · event order<\/th>/);
  assert.match(markup, /<th scope="row">1\. A<\/th>/);
  assert.match(markup, /<th scope="row">2\. B<\/th>/);
});

test("keeps the product name visible on the landing screen", () => {
  const landing = renderApp(view({ puzzle: undefined }));
  assert.match(landing, /<p class="eyebrow">Tako Bako Logic Dojo<\/p>/);
  assert.match(landing, /TAKO BAKO · Powered by Yokaiba/);
  assert.match(landing, /<details class="challenge-path"><summary>[\s\S]*?View all 12 levels/);
  assert.ok(landing.indexOf('class="challenge-path"') < landing.indexOf('<section class="curriculum"'));
});

test("uses the puzzle title for context and the level badge for challenge progress", () => {
  const markup = renderApp(view());
  assert.match(markup, /<h1>Puzzle<\/h1>/);
  assert.match(markup, /Beginner · Level 1/);
  assert.doesNotMatch(markup, /<h1>Beginner Level 1<\/h1>/);
});

test("[TB-BOARD-RESET-01] asks before clearing every board mark", () => {
  const confirm = renderApp(view({ pendingBoardReset: true }));
  assert.match(confirm, /<dialog\b[^>]*aria-labelledby="reset-board-dialog-title"/);
  assert.match(confirm, /Clear all board marks\?/);
  assert.match(confirm, /<button id="confirm-board-reset"[^>]*>Clear board<\/button>/);
});

test("[TB-BOARD-RESET-01] names the selected grid in its clear confirmation", () => {
  const clearGrid = renderApp(view({ pendingResetGridId: "club" }));
  assert.match(clearGrid, /<dialog\b[^>]*aria-labelledby="reset-grid-title"/);
  assert.match(clearGrid, /Clear Club\?/);
  assert.match(clearGrid, /id="confirm-grid-reset"[^>]*>Clear grid<\/button>/);
});

test("Too hard opens optional reasons while other ratings do not", () => {
  const difficult = renderApp(view({ pendingCelebration: true, puzzleCompleted: true, feedback: { selectedRating: "too_hard", submitting: false } }));
  assert.match(difficult, /What made this puzzle difficult\?/);
  assert.match(difficult, /data-feedback-reason="difficult_to_start"/);
  assert.match(difficult, /You can send the rating without choosing a reason/);

  const easier = renderApp(view({ pendingCelebration: true, puzzleCompleted: true, feedback: { selectedRating: "just_right", submitting: false } }));
  assert.doesNotMatch(easier, /What made this puzzle difficult\?/);
  assert.match(easier, /id="submit-puzzle-feedback-celebration"/);
});

test("in-progress feedback stays inside More and previously submitted feedback is not prompted again", () => {
  const markup = renderApp(view({ actionMenuOpen: true, feedbackEntryOpen: true }));
  assert.match(markup, /<summary>Give feedback<\/summary>/);
  assert.match(markup, /data-feedback-rating="too_hard"/);

  const submitted = renderApp(view({ pendingCelebration: true, puzzleCompleted: true, feedbackSubmitted: true }));
  assert.match(submitted, /Thanks for helping us tune these puzzles/);
  assert.doesNotMatch(submitted, /data-feedback-rating=/);
});

test("feedback controls require a signed fingerprinted puzzle and use accessible buttons", () => {
  const missingIdentity = renderApp(view({ puzzle: { ...puzzle, puzzleFingerprint: undefined }, pendingCelebration: true, puzzleCompleted: true }));
  assert.doesNotMatch(missingIdentity, /data-feedback-rating=/);
  assert.match(missingIdentity, /id="celebration-continue"/);

  const markup = renderApp(view({ pendingCelebration: true, puzzleCompleted: true }));
  assert.match(markup, /role="group" aria-label="Puzzle difficulty rating"/);
  assert.match(markup, /<button[^>]*data-feedback-rating="too_hard"/);

  const sending = renderApp(view({ pendingCelebration: true, puzzleCompleted: true, feedback: { selectedRating: "just_right", submitting: true } }));
  assert.match(sending, /aria-pressed="true" disabled data-feedback-rating="just_right"/);
  assert.match(sending, /id="submit-puzzle-feedback-celebration" class="button button--primary" disabled/);
});
