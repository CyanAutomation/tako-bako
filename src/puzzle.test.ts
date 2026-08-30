import { describe, expect, it } from "vitest";
import { cycleMark, parsePuzzle, type Mark } from "./puzzle";

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

  it("rejects a malformed response before it reaches the board", () => {
    expect(() => parsePuzzle({ id: "missing everything" })).toThrow("invalid puzzle response");
  });
});
