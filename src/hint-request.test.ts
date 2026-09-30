import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createHintRequestBody, parseHintResponse } from "./hint-request";
import { squareKey } from "./puzzle-board";
import type { Puzzle } from "./puzzle";

const puzzle: Puzzle & { puzzleToken: string } = {
  id: "puzzle", seed: "seed", requestedSeed: "seed", templateId: "tournament-order-v1", puzzleToken: "signed",
  clues: [{ id: "known", text: "Aki matches Lions.", constraintKind: "matches", strategy: "direct_match" }, { id: "other", text: "Hana is next to the fish keeper." }],
  difficulty: { level: 2, label: "Easy", modelVersion: "v1" },
  spec: { id: "tournament-order-v1", title: "Tournament Order", baseCategory: "person", categories: [
    { id: "person", label: "Person", values: ["Aki", "Ben"] },
    { id: "club", label: "Club", values: ["Lions", "Wolves"] },
    { id: "weight", label: "Weight", values: ["-60", "-66"] },
  ] },
};

const options = {
  puzzle,
  usedClueIds: new Set(["known"]),
  clueStrategies: { other: "adjacency" as const },
  hintsUsed: 2,
  mistakes: 1,
  difficultyLevel: 2,
  puzzleStartedAt: 9_000,
  now: 10_000,
  smartMarking: true,
};

describe("createHintRequestBody", () => {
  it("chooses a hint strength from confirmed progress and omits unknown squares", () => {
    const body = createHintRequestBody({ ...options, board: {
      [squareKey("club", "Aki", "Lions")]: "yes",
      [squareKey("club", "Ben", "Wolves")]: "unknown",
      [squareKey("weight", "Aki", "-60")]: "no",
    } });

    assert.strictEqual(body.kind, "elimination");
    assert.deepStrictEqual(body.board, [
      { category: "Club", subject: "Aki", value: "Lions", mark: "yes" },
      { category: "Weight", subject: "Aki", value: "-60", mark: "no" },
    ]);
    assert.deepStrictEqual(body.clues, [
      { id: "known", text: "Aki matches Lions.", strategy: "direct_match" },
      { id: "other", text: "Hana is next to the fish keeper.", strategy: "adjacency" },
    ]);
    assert.strictEqual(body.elapsedMs, 1_000);
    assert.strictEqual(body.smartMarking, true);
  });

  it("selects stronger request kinds only as affirmative progress increases", () => {
    const empty = createHintRequestBody({ ...options, board: {} });
    const half = createHintRequestBody({ ...options, board: {
      [squareKey("club", "Aki", "Lions")]: "yes",
      [squareKey("weight", "Ben", "-66")]: "yes",
    } });

    assert.strictEqual(empty.kind, "clue");
    assert.strictEqual(half.kind, "placement");
  });
});

describe("parseHintResponse", () => {
  it("accepts placements and clue hints with optional clue IDs", () => {
    assert.deepStrictEqual(parseHintResponse({ kind: "placement", placement: { subject: "Aki", category: "Club", value: "Lions" } }), {
      kind: "placement", placement: { subject: "Aki", category: "Club", value: "Lions" },
    });
    assert.deepStrictEqual(parseHintResponse({ kind: "clue", clue: { id: "next", text: "Try the next clue." } }), {
      kind: "clue", clue: { id: "next", text: "Try the next clue." },
    });
    assert.deepStrictEqual(parseHintResponse({ clue: { text: "A clue without an ID." } }), {
      kind: "clue", clue: { text: "A clue without an ID." },
    });
  });

  it("rejects unsupported or incomplete hint payloads", () => {
    for (const value of [null, [], {}, { kind: "placement", placement: { subject: "Aki" } }, { clue: { id: "missing-text" } }]) {
      assert.strictEqual(parseHintResponse(value), undefined);
    }
  });
});
