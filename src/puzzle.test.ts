import { afterEach, describe, expect, it, vi } from "vitest";
import { answerFromBoard, boardProgress, cycleMark, loadBoard, loadUsedClues, markBoard, parsePuzzle, saveUsedClues, squareKey, type Mark } from "./puzzle";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cycleMark", () => {
  it("moves an unmarked square through yes, no, and back to unknown", () => {
    const states: Mark[] = ["unknown", "yes", "no"];
    expect(states.map(cycleMark)).toEqual(["yes", "no", "unknown"]);
  });
});

describe("parsePuzzle", () => {
  it("accepts Yokaiba's public puzzle shape", () => {
    const puzzle = parsePuzzle({
      id: "tournament-order-v1:dojo-day",
      seed: "dojo-day",
      templateId: "tournament-order-v1",
      generatorVersion: "yokaiba-generator-v1",
      solverVersion: "yokaiba-exhaustive-v1",
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

    expect(puzzle.spec.categories).toHaveLength(2);
    expect(puzzle.difficulty.label).toBe("Easy");
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

    expect(puzzle.puzzleToken).toBe("signed-token");
  });

  it("rejects a malformed response before it reaches the board", () => {
    expect(() => parsePuzzle({ id: "missing everything" })).toThrow("invalid puzzle response");
  });
});

describe("markBoard", () => {
  it("optionally eliminates the rest of a confirmed row and column", () => {
    const category = { id: "club", label: "Club", values: ["Lions", "Wolves"] };
    const base = { id: "judoka", label: "Judoka", values: ["Aki", "Ben"] };

    expect(markBoard({}, squareKey("club", "Aki", "Lions"), category, base, true)).toEqual({
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

    expect(answerFromBoard(board, spec)).toEqual({ assignments: { club: ["Lions", "Wolves"] } });
  });

  it("refuses incomplete or contradictory boards", () => {
    expect(answerFromBoard({ [squareKey("club", "Aki", "Lions")]: "yes" }, spec)).toBeUndefined();
    expect(answerFromBoard({
      [squareKey("club", "Aki", "Lions")]: "yes",
      [squareKey("club", "Ben", "Lions")]: "yes",
    }, spec)).toBeUndefined();
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
    expect(boardProgress({
      [squareKey("club", "Aki", "Lions")]: "yes",
      [squareKey("weight", "Ben", "-66 kg")]: "no",
    }, spec)).toEqual({ marked: 2, total: 8 });
  });

  it("does not count stale marks from another puzzle category", () => {
    expect(boardProgress({ [squareKey("stale", "Aki", "Lions")]: "yes" }, spec)).toEqual({ marked: 0, total: 8 });
  });
});

describe("loadBoard", () => {
  it("keeps valid marks while discarding prototype-related keys", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ safe: "yes", constructor: "no", prototype: "yes", ignored: "unknown" }),
    });

    expect(loadBoard("dojo-day")).toEqual({ safe: "yes" });
  });
});

describe("used clue persistence", () => {
  it("restores only known clue IDs for the current puzzle", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(["clue-1", "stale", 42]),
    });

    expect(loadUsedClues("dojo-day", ["clue-1", "clue-2"])).toEqual(new Set(["clue-1"]));
  });

  it("stores the used clue IDs independently from the puzzle board", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", { setItem });

    saveUsedClues("dojo-day", new Set(["clue-2", "clue-1"]));

    expect(setItem).toHaveBeenCalledWith("tako-bako.clues.dojo-day", JSON.stringify(["clue-2", "clue-1"]));
  });
});
