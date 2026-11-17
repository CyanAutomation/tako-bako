import assert from "node:assert/strict";
import test from "node:test";
import { parsePuzzle } from "../../src/puzzle-parser.js";
import { createSimulator } from "../../simulator/router.js";
import { loadFixtures } from "../../simulator/fixture-loader.js";

const fixtures = loadFixtures();
const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024;

function fixtureFor(templateId: string) {
  const fixture = fixtures.find(candidate => candidate.publicPuzzle.templateId === templateId);
  assert.ok(fixture, `fixture for ${templateId} exists`);
  return fixture;
}

function generationRequest(templateId: string, seed = "simulator-test", difficultyLevel?: number, difficultyModel = "v5"): Request {
  const url = new URL("http://simulator.test/api/puzzle");
  url.searchParams.set("templateId", templateId);
  url.searchParams.set("seed", seed);
  if (difficultyLevel !== undefined) url.searchParams.set("difficultyLevel", String(difficultyLevel));
  url.searchParams.set("difficultyModel", difficultyModel);
  return new Request(url);
}

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function post(path: string, body: unknown): Request {
  return new Request(`http://simulator.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("Yokaiba generated fixtures cover all four scenario families and parse through the app contract", () => {
  assert.deepEqual(
    fixtures.map(fixture => fixture.publicPuzzle.templateId),
    ["tournament-order-v2", "open-division-v2", "championship-bridge-v1", "championship-circuit-v2"],
  );
  assert.deepEqual(fixtures.map(fixture => fixture.publicPuzzle.difficulty.level), [1, 5, 8, 9]);

  for (const fixture of fixtures) {
    assert.equal(fixture.source.repository, "https://github.com/CyanAutomation/yokaiba");
    assert.equal(fixture.publicPuzzle.puzzleToken, `simulator-fixture:${fixture.fixtureId}`);
    assert.equal("solution" in fixture.publicPuzzle, false);
    assert.equal(fixture.publicPuzzle.difficulty.evidence.humanSolve.solved, true);
    assert.ok(fixture.solution.assignments);

    const parsed = parsePuzzle(fixture.publicPuzzle);
    assert.equal(parsed.templateId, fixture.publicPuzzle.templateId);
    assert.equal(parsed.difficulty.level, fixture.publicPuzzle.difficulty.level);

    const base = fixture.publicPuzzle.spec.categories.find(category => category.id === fixture.publicPuzzle.spec.baseCategory);
    assert.ok(base);
    const nonBaseIds = fixture.publicPuzzle.spec.categories.filter(category => category.id !== base.id).map(category => category.id);
    assert.deepEqual(Object.keys(fixture.solution.assignments).sort(), nonBaseIds.sort());
    for (const category of fixture.publicPuzzle.spec.categories.filter(category => category.id !== base.id)) {
      assert.deepEqual([...fixture.solution.assignments[category.id]!].sort(), [...category.values].sort());
    }
  }
});

test("generation is deterministic, reflects request dimensions, and never returns a solution", async () => {
  const fixture = fixtureFor("tournament-order-v2");
  const simulator = createSimulator();
  const request = generationRequest("tournament-order-v2", "repeatable-seed", 1, "v5");
  const firstResponse = await simulator.handle(request);
  const secondResponse = await simulator.handle(generationRequest("tournament-order-v2", "repeatable-seed", 1, "v5"));
  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.headers.get("x-tako-bako-simulator"), "true");
  assert.match(firstResponse.headers.get("content-type") ?? "", /application\/json/);
  assert.match(firstResponse.headers.get("cache-control") ?? "", /s-maxage=/);

  const first = await jsonResponse(firstResponse);
  const second = await jsonResponse(secondResponse);
  assert.deepEqual(first, second);
  assert.equal(first.requestedSeed, "repeatable-seed");
  assert.equal(first.seed, fixture.publicPuzzle.seed);
  assert.equal(first.requestedDifficultyLevel, 1);
  assert.equal(first.difficultyModel, "v5");
  assert.equal(first.puzzleToken, fixture.publicPuzzle.puzzleToken);
  assert.equal("solution" in first, false);
  assert.equal(JSON.stringify(first).includes('"assignments"'), false);
  assert.equal(JSON.stringify(first).includes(JSON.stringify(fixture.solution)), false);
});

test("generation rejects unavailable templates, levels, and difficulty models", async () => {
  const simulator = createSimulator();
  const wrongLevel = await simulator.handle(generationRequest("tournament-order-v2", "seed", 2));
  assert.equal(wrongLevel.status, 422);
  assert.deepEqual((await jsonResponse(wrongLevel)).availableDifficultyLevels, [1]);

  const unavailableTemplate = await simulator.handle(generationRequest("tournament-order-v1"));
  assert.equal(unavailableTemplate.status, 404);

  const unknownTemplate = await simulator.handle(generationRequest("not-a-template"));
  assert.equal(unknownTemplate.status, 404);

  const invalidModel = await simulator.handle(generationRequest("tournament-order-v2", "seed", undefined, "v9"));
  assert.equal(invalidModel.status, 400);

  const duplicateSeed = await simulator.handle(new Request(
    "http://simulator.test/v1/puzzles/generate?templateId=tournament-order-v2&seed=first&seed=second",
  ));
  assert.equal(duplicateSeed.status, 400);
});

test("simulator request body limit counts raw bytes before UTF-8 decoding", async () => {
  const simulator = createSimulator();
  const oversizedBody = new ArrayBuffer(MAX_REQUEST_BODY_BYTES + 1);
  new Uint8Array(oversizedBody).set([0xef, 0xbb, 0xbf]);
  const response = await simulator.handle(new Request("http://simulator.test/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: oversizedBody,
  }));

  assert.equal(response.status, 413);
  assert.deepEqual(await jsonResponse(response), {
    error: { code: "payload_too_large", message: "Request body is too large" },
  });
});

test("published Yokaiba generation, verification, and hint routes accept their REST request shapes", async () => {
  const fixture = fixtureFor("open-division-v2");
  const simulator = createSimulator();
  const get = await simulator.handle(new Request(
    "http://simulator.test/v1/puzzles/generate?templateId=open-division-v2&seed=rest-route-seed&difficultyLevel=5&difficultyModel=v5",
  ));
  assert.equal(get.status, 200);
  const generated = await jsonResponse(get);
  assert.equal(generated.requestedSeed, "rest-route-seed");
  assert.equal(generated.requestedDifficultyLevel, 5);
  assert.equal(get.headers.get("cache-control"), "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");

  const postGeneration = await simulator.handle(post("/v1/puzzles/generate", {
    templateId: "open-division-v2",
    seed: "rest-post-seed",
    difficultyLevel: 5,
    difficultyModel: "v5",
  }));
  assert.equal(postGeneration.status, 200);
  assert.equal((await jsonResponse(postGeneration)).requestedSeed, "rest-post-seed");

  const verification = await simulator.handle(post("/v1/puzzles/verify", {
    puzzleToken: fixture.publicPuzzle.puzzleToken,
    answer: fixture.solution,
  }));
  assert.deepEqual(await jsonResponse(verification), { correct: true });

  const hint = await simulator.handle(post("/v1/puzzles/hint", {
    puzzleToken: fixture.publicPuzzle.puzzleToken,
    kind: "elimination",
    hintIndex: 2,
  }));
  const hintBody = await jsonResponse(hint);
  assert.equal(hint.status, 200);
  assert.ok(hintBody.kind === "elimination" || hintBody.kind === "clue");
  assert.ok(typeof (hintBody.clue as { text?: unknown }).text === "string");
});

test("verification accepts only the private fixture solution and does not mutate fixture state", async () => {
  const fixture = fixtureFor("tournament-order-v2");
  const before = structuredClone(fixture);
  const simulator = createSimulator();
  const correct = await simulator.handle(post("/api/puzzle", {
    puzzleToken: fixture.publicPuzzle.puzzleToken,
    answer: fixture.solution,
  }));
  assert.equal(correct.status, 200);
  assert.deepEqual(await jsonResponse(correct), { correct: true });
  assert.equal(correct.headers.get("cache-control"), "no-store");

  const wrongAnswer = structuredClone(fixture.solution);
  const firstCategory = Object.keys(wrongAnswer.assignments)[0]!;
  [wrongAnswer.assignments[firstCategory]![0], wrongAnswer.assignments[firstCategory]![1]] = [
    wrongAnswer.assignments[firstCategory]![1]!,
    wrongAnswer.assignments[firstCategory]![0]!,
  ];
  const incorrect = await simulator.handle(post("/api/puzzle", {
    puzzleToken: fixture.publicPuzzle.puzzleToken,
    answer: wrongAnswer,
  }));
  assert.deepEqual(await jsonResponse(incorrect), { correct: false });

  const invalidToken = await simulator.handle(post("/api/puzzle", {
    puzzleToken: "simulator:unknown",
    answer: fixture.solution,
  }));
  assert.equal(invalidToken.status, 400);
  const malformed = await simulator.handle(post("/api/puzzle", { puzzleToken: fixture.publicPuzzle.puzzleToken, answer: {} }));
  assert.equal(malformed.status, 400);
  assert.deepEqual(fixture, before);
});

test("clue and placement hints are deterministic and consistent with the fixture solution", async () => {
  const fixture = fixtureFor("tournament-order-v2");
  const simulator = createSimulator();
  const clueRequest = () => post("/api/hint", {
    puzzleToken: fixture.publicPuzzle.puzzleToken,
    kind: "clue",
    hintsUsed: 0,
  });
  const clueResponse = await simulator.handle(clueRequest());
  const clue = await jsonResponse(clueResponse);
  assert.equal(clueResponse.status, 200);
  assert.equal(clueResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(clue, await jsonResponse(await simulator.handle(clueRequest())));
  assert.ok(fixture.publicPuzzle.clues.some(candidate => candidate.id === (clue.clue as { id?: string }).id));

  const placementResponse = await simulator.handle(post("/api/hint", {
    puzzleToken: fixture.publicPuzzle.puzzleToken,
    kind: "placement",
    hintsUsed: 1,
  }));
  const placement = await jsonResponse(placementResponse);
  assert.equal(placement.kind, "placement");
  const value = placement.placement as { subject: string; category: string; value: string };
  const base = fixture.publicPuzzle.spec.categories.find(category => category.id === fixture.publicPuzzle.spec.baseCategory)!;
  const row = base.values.indexOf(value.subject);
  assert.ok(row >= 0);
  assert.equal(fixture.solution.assignments[value.category]?.[row], value.value);

  const contradictoryMark = await simulator.handle(post("/api/hint", {
    puzzleToken: fixture.publicPuzzle.puzzleToken,
    kind: "placement",
    hintsUsed: 1,
    board: [{
      category: fixture.publicPuzzle.spec.categories.find(category => category.id === value.category)!.label,
      subject: value.subject,
      value: value.value,
      mark: "no",
    }],
  }));
  assert.equal(contradictoryMark.status, 200);
  const alternatePlacement = (await jsonResponse(contradictoryMark)).placement as typeof value;
  assert.notDeepEqual(alternatePlacement, value);

  const invalidToken = await simulator.handle(post("/api/hint", { puzzleToken: "unknown", kind: "clue" }));
  assert.equal(invalidToken.status, 400);
});

test("simulated events, feedback, and health remain local and accept bounded requests", async () => {
  const simulator = createSimulator();
  const event = await simulator.handle(post("/api/events", {
    schemaVersion: 1,
    event: "puzzle_started",
    templateId: "tournament-order-v2",
    hintsUsed: 0,
    mistakes: 0,
  }));
  assert.equal(event.status, 202);
  assert.deepEqual(await jsonResponse(event), { accepted: true });

  const fixture = fixtureFor("tournament-order-v2");
  const feedback = {
    puzzleToken: fixture.publicPuzzle.puzzleToken,
    rating: "just_right",
    outcome: "in_progress",
    hintsUsed: 0,
    mistakes: 0,
    smartMarkingEnabled: false,
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
  };
  const first = await simulator.handle(post("/api/feedback", feedback));
  const duplicate = await simulator.handle(post("/api/feedback", feedback));
  assert.equal(first.status, 202);
  assert.deepEqual(await jsonResponse(first), { accepted: true, duplicate: false });
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await jsonResponse(duplicate), { accepted: true, duplicate: true });

  const changed = await simulator.handle(post("/api/feedback", { ...feedback, rating: "too_easy" }));
  assert.equal(changed.status, 409);
  const health = await simulator.handle(new Request("http://simulator.test/healthz"));
  assert.equal(health.status, 200);
  assert.deepEqual(await jsonResponse(health), { status: "ok" });
});

test("all simulator routes work when any unexpected fetch is treated as a failure", async () => {
  const simulator = createSimulator();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("unexpected network request"); };
  try {
    const generated = await simulator.handle(generationRequest("tournament-order-v2", "isolated"));
    const puzzle = await jsonResponse(generated);
    const token = puzzle.puzzleToken;
    const verified = await simulator.handle(post("/v1/puzzles/verify", {
      puzzleToken: token,
      answer: fixtureFor("tournament-order-v2").solution,
    }));
    const hinted = await simulator.handle(post("/api/hint", { puzzleToken: token, kind: "clue", hintsUsed: 0 }));
    const event = await simulator.handle(post("/api/events", { schemaVersion: 1, event: "puzzle_started", templateId: "tournament-order-v2", hintsUsed: 0, mistakes: 0 }));
    const restEvent = await simulator.handle(post("/v1/events", {
      schemaVersion: 1,
      event: "puzzle_started",
      puzzleToken: token,
      templateId: "tournament-order-v2",
      hintsUsed: 0,
      mistakes: 0,
    }));
    const clueStrategy = await simulator.handle(post("/api/clue-strategies", {
      clues: [{ id: "known-clue", text: "A clue", constraintKind: "matches" }],
    }));
    const feedback = await simulator.handle(post("/api/feedback", {
      puzzleToken: token,
      rating: "just_right",
      outcome: "in_progress",
      hintsUsed: 0,
      mistakes: 0,
      smartMarkingEnabled: false,
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174001",
    }));
    const health = await simulator.handle(new Request("http://simulator.test/api/health"));
    assert.equal(verified.status, 200);
    assert.equal(hinted.status, 200);
    assert.equal(event.status, 202);
    assert.equal(restEvent.status, 202);
    assert.equal(clueStrategy.status, 200);
    assert.equal(feedback.status, 202);
    assert.equal(health.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
