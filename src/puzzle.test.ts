import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { restoreStubbedGlobals, stubGlobal } from "../test-utils.js";

import { answerFromBoard, boardProgress, boardSolveProgress, cycleMark, loadBoard, loadUsedClues, markBoard, parsePuzzle, saveUsedClues, squareKey, type Mark } from "./puzzle";

afterEach(restoreStubbedGlobals);

describe("cycleMark", () => {
  it("moves an unmarked square through yes, no, and back to unknown", () => {
    const states: Mark[] = ["unknown", "yes", "no"];
    assert.deepStrictEqual(states.map(cycleMark), ["yes", "no", "unknown"]);
  });
});

describe("parsePuzzle", () => {
  it("accepts Yokaiba's public puzzle shape", () => {
    const puzzle = parsePuzzle({
      id: "tournament-order-v1:dojo-day",
      seed: "dojo-day",
      templateId: "tournament-order-v1",
      generatorVersion: "yokaiba-generator-v1",
      // Solver versions are reproducibility metadata. The player must remain
      // compatible when Yokaiba introduces another conforming solver.
      solverVersion: "yokaiba-go-contract-v2",
      clues: [{ id: "one", text: "Aki was associated with Lions.", constraint: { kind: "matches" } }],
      difficulty: { level: 2, label: "Easy", modelVersion: "yokaiba-difficulty-v1" },
      spec: {
        id: "tournament-order-v1",
        title: "Tournament Order",
        baseCategory: "judoka",
        categories: [
          { id: "judoka", label: "Judoka", values: ["Aki", "Ben"] },
          { id: "club", label: "Club", values: ["Lions", "Wolves"] },
        ],
      },
    });

    assert.strictEqual((puzzle.spec.categories).length, 2);
    assert.strictEqual(puzzle.difficulty.label, "Easy");
  });

  it("retains an optional signed puzzle token for answer verification", () => {
    const puzzle = parsePuzzle({
      id: "tournament-order-v1:verified-dojo",
      seed: "verified-dojo",
      puzzleToken: "signed-token",
      clues: [],
      difficulty: { level: 1, label: "Very easy", modelVersion: "yokaiba-difficulty-v1" },
      spec: {
        id: "tournament-order-v1", title: "Tournament Order", baseCategory: "judoka",
        categories: [
          { id: "judoka", label: "Judoka", values: ["Aki", "Ben"] },
          { id: "club", label: "Club", values: ["Lions", "Wolves"] },
        ],
      },
    });

    assert.strictEqual(puzzle.puzzleToken, "signed-token");
  });

  it("retains Yokaiba's requested seed and accepts a five-by-five expert puzzle", () => {
    const puzzle = parsePuzzle({
      id: "championship-circuit-v1:replay-seed", seed: "replay-seed", requestedSeed: "shared-seed", templateId: "championship-circuit-v1", clues: [{ id: "distance", text: "Gold and Tatami 2 were two places apart.", constraint: { kind: "distance" } }],
      difficulty: { level: 5, label: "Very hard", modelVersion: "yokaiba-difficulty-v3", evidence: { clueStructure: {} } },
      spec: {
        id: "championship-circuit-v1", title: "Championship Circuit", baseCategory: "judoka",
        categories: [
          { id: "judoka", label: "Judoka", values: ["Aki", "Hana", "Kenji", "Mika", "Sora"] },
          { id: "weight", label: "Weight", values: ["-60 kg", "-66 kg", "-73 kg", "-81 kg", "+81 kg"] },
          { id: "tatami", label: "Tatami", values: ["Tatami 1", "Tatami 2", "Tatami 3", "Tatami 4", "Tatami 5"] },
          { id: "medal", label: "Medal", values: ["Gold", "Silver", "Bronze", "Finalist", "Quarter-finalist"] },
        ],
      },
    });

    assert.strictEqual(puzzle.requestedSeed, "shared-seed");
    assert.strictEqual(puzzle.templateId, "championship-circuit-v1");
    assert.strictEqual((puzzle.spec.categories).length, 4);
    assert.deepStrictEqual(boardProgress({}, puzzle.spec), { marked: 0, total: 75 });
  });

  it("rejects a malformed response before it reaches the board", () => {
    assert.throws(() => parsePuzzle({ id: "missing everything" }), new RegExp("invalid puzzle response"));
  });

  const unsafeCategories = [
    { categories: [{ id: "judoka", label: "Judoka", values: ["Aki", "Ben"] }, { id: "club", label: "Club", values: ["Lions", "Lions"] }] },
    { categories: [{ id: "judoka", label: "Judoka", values: ["Aki", "Ben"] }, { id: "judoka", label: "Duplicate", values: ["Lions", "Wolves"] }] },
    { categories: [{ id: "judoka", label: "Judoka", values: ["Aki", "Ben"] }, { id: "club", label: "Club", values: ["Lions"] }] },
  ];
  for (const [caseIndex, { categories }] of unsafeCategories.entries()) {
    it(`rejects unsafe category boundaries (${caseIndex + 1})`, () => {
    assert.throws(() => parsePuzzle({
      id: "bad-boundary", seed: "bad-boundary", clues: [],
      difficulty: { level: 3, label: "Moderate", modelVersion: "v1" },
      spec: { id: "test", title: "Test", baseCategory: "judoka", categories },
    }), new RegExp("invalid puzzle response"));
    });
  }

  it("accepts the full Yokaiba 1–12 difficulty scale", () => {
    assert.strictEqual(parsePuzzle({
      id: "advanced", seed: "advanced", clues: [],
      difficulty: { level: 12, label: "Expert", modelVersion: "v4" },
      spec: { id: "advanced", title: "Advanced", baseCategory: "person", categories: [
        { id: "person", label: "Person", values: ["A", "B"] },
        { id: "colour", label: "Colour", values: ["Red", "Blue"] },
      ] },
    }).difficulty.level, 12);
  });

  it("rejects a difficulty outside the supported Yokaiba range", () => {
    assert.throws(() => parsePuzzle({
      id: "bad-difficulty", seed: "bad-difficulty", clues: [],
      difficulty: { level: 13, label: "Impossible", modelVersion: "v1" },
      spec: { id: "test", title: "Test", baseCategory: "judoka", categories: [
        { id: "judoka", label: "Judoka", values: ["Aki", "Ben"] },
        { id: "club", label: "Club", values: ["Lions", "Wolves"] },
      ] },
    }), new RegExp("invalid puzzle response"));
  });
});

describe("markBoard", () => {
  it("optionally eliminates the rest of a confirmed row and column", () => {
    const category = { id: "club", label: "Club", values: ["Lions", "Wolves"] };
    const base = { id: "judoka", label: "Judoka", values: ["Aki", "Ben"] };

    assert.deepStrictEqual(markBoard({}, squareKey("club", "Aki", "Lions"), category, base, true), {
      [squareKey("club", "Aki", "Lions")]: "yes",
      [squareKey("club", "Aki", "Wolves")]: "no",
      [squareKey("club", "Ben", "Lions")]: "no",
    });
  });
});

describe("answerFromBoard", () => {
  const spec = {
    id: "tournament-order-v1", title: "Tournament Order", baseCategory: "judoka",
    categories: [
      { id: "judoka", label: "Judoka", values: ["Aki", "Ben"] },
      { id: "club", label: "Club", values: ["Lions", "Wolves"] },
    ],
  };

  it("creates a verification answer only for a complete one-to-one board", () => {
    const board = {
      [squareKey("club", "Aki", "Lions")]: "yes" as const,
      [squareKey("club", "Ben", "Wolves")]: "yes" as const,
    };

    assert.deepStrictEqual(answerFromBoard(board, spec), { assignments: { club: ["Lions", "Wolves"] } });
  });

  it("refuses incomplete or contradictory boards", () => {
    assert.strictEqual(answerFromBoard({ [squareKey("club", "Aki", "Lions")]: "yes" }, spec), undefined);
    assert.strictEqual(answerFromBoard({
      [squareKey("club", "Aki", "Lions")]: "yes",
      [squareKey("club", "Ben", "Lions")]: "yes",
    }, spec), undefined);
  });
});

describe("boardProgress", () => {
  const spec = {
    id: "tournament-order-v1", title: "Tournament Order", baseCategory: "judoka",
    categories: [
      { id: "judoka", label: "Judoka", values: ["Aki", "Ben"] },
      { id: "club", label: "Club", values: ["Lions", "Wolves"] },
      { id: "weight", label: "Weight", values: ["-60 kg", "-66 kg"] },
    ],
  };

  it("counts marked squares across every non-base grid", () => {
    assert.deepStrictEqual(boardProgress({
      [squareKey("club", "Aki", "Lions")]: "yes",
      [squareKey("weight", "Ben", "-66 kg")]: "no",
    }, spec), { marked: 2, total: 8 });
  });

  it("does not count stale marks from another puzzle category", () => {
    assert.deepStrictEqual(boardProgress({ [squareKey("stale", "Aki", "Lions")]: "yes" }, spec), { marked: 0, total: 8 });
  });

  it("counts placed matches separately from general notes", () => {
    assert.deepStrictEqual(boardSolveProgress({
      [squareKey("club", "Aki", "Lions")]: "yes",
      [squareKey("club", "Ben", "Wolves")]: "yes",
      [squareKey("weight", "Ben", "-66 kg")]: "no",
    }, spec), { matches: 2, total: 4 });
  });
});

describe("loadBoard", () => {
  it("keeps valid marks while discarding prototype-related keys", () => {
    stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ safe: "yes", constructor: "no", prototype: "yes", ignored: "unknown" }),
    });

    assert.deepStrictEqual(loadBoard("dojo-day"), { safe: "yes" });
  });
});

describe("used clue persistence", () => {
  it("restores only known clue IDs for the current puzzle", () => {
    stubGlobal("localStorage", {
      getItem: () => JSON.stringify(["clue-1", "stale", 42]),
    });

    assert.deepStrictEqual(loadUsedClues("dojo-day", ["clue-1", "clue-2"]), new Set(["clue-1"]));
  });

  it("stores the used clue IDs independently from the puzzle board", () => {
    const setItem = mock.fn((...args: unknown[]) => {
      void args;
    });
    stubGlobal("localStorage", { setItem });

    saveUsedClues("dojo-day", new Set(["clue-2", "clue-1"]));

    assert.strictEqual(setItem.mock.callCount(), 1);
    assert.deepStrictEqual(setItem.mock.calls[0].arguments, ["tako-bako.clues.dojo-day", JSON.stringify(["clue-2", "clue-1"])]);
  });
});
