import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { assertPartialMatch, configureJevForTests, isJevRateLimitRequest, jevRateLimitResponse, resolvedMock, restoreStubbedGlobals, stubGlobal } from "../../test-utils.js";

import handler from "../../api/hint.js";

const jevMetrics: unknown[][] = [];

afterEach(() => {
  restoreStubbedGlobals();
  mock.restoreAll();
});

function responseRecorder() {
  const result = { statusCode: 0, body: undefined as unknown, headers: new Map<string, string>() };
  const response = { setHeader: mock.fn((name: string, value: string) => { result.headers.set(name.toLowerCase(), value); }), status: mock.fn((statusCode: number) => ({ json: mock.fn((body: unknown) => { result.statusCode = statusCode; result.body = body; }) })) };
  return { response, result };
}

describe("hint proxy", () => {
  beforeEach(() => {
    jevMetrics.length = 0;
    mock.method(console, "info", (...args: Parameters<typeof console.info>) => { jevMetrics.push(args); });
  });
  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.JEV_MODEL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("forwards a bounded hint request and preserves the Yokaiba request ID", async () => {
    const upstream = resolvedMock(new Response(JSON.stringify({ kind: "clue", clue: { id: "c1", text: "Start here." } }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "hint-123" } }));
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();
    await handler({ method: "POST", body: { puzzleToken: "signed-token", kind: "clue" } } as never, response as never);
    assert.strictEqual(upstream.mock.callCount(), 1);
    assert.strictEqual(upstream.mock.calls[0].arguments[0], "https://yokaiba.scheimann.workers.dev/v1/puzzles/hint");
    assertPartialMatch(upstream.mock.calls[0].arguments[1], { method: "POST", body: JSON.stringify({ puzzleToken: "signed-token", kind: "clue" }) });
    assertPartialMatch(result, { statusCode: 200, body: { kind: "clue" } });
    assert.strictEqual(result.headers.get("x-yokaiba-request-id"), "hint-123");
  });

  it("uses the completed hint count to request the next deterministic Yokaiba hint", async () => {
    const upstream = resolvedMock(new Response(JSON.stringify({ kind: "placement", placement: { subject: "Hana", category: "club", value: "Wolves" } }), { status: 200, headers: { "content-type": "application/json" } }));
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token", kind: "placement", hintsUsed: 3 } } as never, response as never);

    assert.deepStrictEqual(JSON.parse(String(upstream.mock.calls[0]?.arguments[1]?.body)), { puzzleToken: "signed-token", kind: "placement", hintIndex: 3 });
    assert.deepStrictEqual(result.body, { kind: "placement", placement: { subject: "Hana", category: "club", value: "Wolves" } });
  });

  it("does not call Jev when Yokaiba rejects the puzzle token", async () => {
    configureJevForTests();
    const calls: string[] = [];
    const fetchMock = mock.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (isJevRateLimitRequest(input)) return jevRateLimitResponse();
      if (url.includes("openrouter.ai")) {
        return new Response(JSON.stringify({ answers: { player_state: { type: "choice", choice: "stalled", confidence: 0.9 } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "invalid token" }), { status: 401, headers: { "content-type": "application/json" } });
    });
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: {
      puzzleToken: "not-a-token",
      kind: "clue",
      clues: [{ id: "fresh", text: "Hana lives next to the fish keeper." }],
      board: [],
      totalMatches: 16,
      hintsUsed: 0,
      mistakes: 0,
      elapsedMs: 1_000,
      smartMarking: false,
    } } as never, response as never);

    assert.deepStrictEqual(calls, ["https://yokaiba.scheimann.workers.dev/v1/puzzles/hint"]);
    assert.strictEqual(fetchMock.mock.callCount(), 1);
    assert.strictEqual(result.statusCode, 401);
  });

  it("chooses an unused clue deterministically when Jev is unavailable", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = resolvedMock(new Response(JSON.stringify({ kind: "clue", clue: { id: "used", text: "The used clue." } }), { status: 200, headers: { "content-type": "application/json" } }));
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: {
      puzzleToken: "signed-token",
      kind: "elimination",
      clues: [{ id: "used", text: "The used clue." }, { id: "fresh", text: "The next unused clue." }],
      usedClueIds: ["used"],
      board: [{ category: "Club", subject: "Aki", value: "Lions", mark: "yes" }],
    } } as never, response as never);

    assert.strictEqual(fetchMock.mock.callCount(), 1);
    assert.deepStrictEqual(result.body, { kind: "clue", clue: { id: "fresh", text: "The next unused clue." } });
  });

  it("rejects malformed or unsupported hint requests before contacting Yokaiba", async () => {
    const upstream = mock.fn(); stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();
    await handler({ method: "POST", body: { puzzleToken: "", kind: "everything" } } as never, response as never);
    assert.strictEqual(upstream.mock.callCount() > 0, false);
    assert.strictEqual(result.statusCode, 400);
  });

  it("sets an allow header for unsupported methods", async () => {
    const upstream = mock.fn(); stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "GET", body: {} } as never, response as never);

    assert.strictEqual(result.statusCode, 405);
    assert.strictEqual(result.headers.get("allow"), "POST");
    assert.strictEqual(upstream.mock.callCount(), 0);
  });

  it("lets Jev choose only from the supplied clues and Yokaiba's solver-verified hint", async () => {
    configureJevForTests();
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchMock = mock.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url, body });
      if (isJevRateLimitRequest(input)) return jevRateLimitResponse();
      if (url.includes("openrouter.ai")) {
        return new Response(JSON.stringify({ answers: { next_hint: { type: "choice", choice: "candidate_1", confidence: 0.9 } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ kind: "placement", placement: { subject: "Aki", category: "club", value: "Lions" } }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "hint-123" } });
    });
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: {
      puzzleToken: "secret-signed-token",
      kind: "placement",
      clues: [{ id: "c1", text: "Aki trains at the Lions club." }, { id: "c2", text: "Hana lives next to the fish keeper." }],
      usedClueIds: ["c1"],
      board: [{ category: "club", subject: "Aki", value: "Lions", mark: "yes" }],
    } } as never, response as never);

    const decisionCall = calls.find(call => call.url.includes("openrouter.ai"));
    assert.ok(decisionCall);
    assert.deepStrictEqual((decisionCall.body.state as { candidates: { id: string }[] }).candidates.map(candidate => candidate.id), ["solver_primary", "clue:c2"]);
    assert.strictEqual(JSON.stringify(decisionCall.body).includes("secret-signed-token"), false);
    assert.deepStrictEqual(result.body, { kind: "clue", clue: { id: "c2", text: "Hana lives next to the fish keeper." } });
    assert.strictEqual(result.headers.get("x-yokaiba-request-id"), "hint-123");
  });

  it("validates the token before classifying player state and enforces the strength policy", async () => {
    configureJevForTests();
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchMock = mock.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      calls.push({ url, body });
      if (isJevRateLimitRequest(input)) return jevRateLimitResponse();
      if (url.includes("openrouter.ai")) {
        return new Response(JSON.stringify({ answers: { player_state: { type: "choice", choice: "stalled", confidence: 0.91 } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ kind: "placement", placement: { subject: "Aki", category: "club", value: "Lions" } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: {
      puzzleToken: "secret-signed-token",
      kind: "clue",
      clues: [{ id: "used", text: "Aki trains at Lions.", strategy: "direct_match" }, { id: "fresh", text: "Hana lives next to the fish keeper.", strategy: "adjacency" }],
      usedClueIds: ["used"],
      board: [{ category: "club", subject: "Aki", value: "Wolves", mark: "no" }],
      totalMatches: 16,
      hintsUsed: 1,
      mistakes: 0,
      elapsedMs: 45_000,
      smartMarking: false,
    } } as never, response as never);

    const modelCall = calls.find(call => call.url.includes("openrouter.ai"));
    const solverCalls = calls.filter(call => call.url.includes("yokaiba"));
    const firstSolverIndex = calls.findIndex(call => call.url.includes("yokaiba"));
    const firstModelIndex = calls.findIndex(call => call.url.includes("openrouter.ai"));
    assert.ok(modelCall);
    assert.ok(firstSolverIndex >= 0 && firstSolverIndex < firstModelIndex);
    assert.strictEqual(solverCalls.length, 2);
    assert.deepStrictEqual(solverCalls.map(call => call.body), [
      { puzzleToken: "secret-signed-token", kind: "clue", hintIndex: 1 },
      { puzzleToken: "secret-signed-token", kind: "elimination", hintIndex: 1 },
    ]);
    assert.deepStrictEqual(modelCall.body.state, {
      affirmative_count: 0,
      negative_count: 1,
      total_matches: 16,
      readiness_percent: 0,
      hints_used: 1,
      mistakes: 0,
      elapsed_ms: 45_000,
      used_clue_count: 1,
      unused_clue_count: 1,
      used_strategy_counts: { direct_match: 1 },
      smart_marking: false,
    });
    assert.strictEqual(JSON.stringify(modelCall.body).includes("secret-signed-token"), false);
    assert.strictEqual("current_board" in (modelCall.body.state as Record<string, unknown>), false);
    assert.deepStrictEqual(result.body, { kind: "clue", clue: { id: "fresh", text: "Hana lives next to the fish keeper." } });
    assert.strictEqual(fetchMock.mock.callCount(), 4);
    const metric = jevMetrics.find(([, value]) => (value as { operation?: unknown }).operation === "player_state")?.[1] as Record<string, unknown> | undefined;
    assert.ok(metric);
    assert.strictEqual(metric.questionCount, 1);
    assert.strictEqual(metric.candidateCount, 0);
    assert.strictEqual(metric.outcome, "success");
    assert.strictEqual("secret-signed-token" in metric, false);
  });

  it("falls back to progress-based strength when the player-state answer has low confidence", async () => {
    configureJevForTests();
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const fetchMock = mock.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      calls.push({ url, body });
      if (isJevRateLimitRequest(input)) return jevRateLimitResponse();
      if (url.includes("openrouter.ai")) {
        const response = calls.filter(call => call.url.includes("openrouter.ai")).length === 1
          ? { answers: { player_state: { type: "choice", choice: "ready_for_stronger_hint", confidence: 0.4 } } }
          : { answers: { next_hint: { type: "choice", choice: "candidate_1", confidence: 0.9 } } };
        return new Response(JSON.stringify(response), { status: 200 });
      }
      return new Response(JSON.stringify({ kind: "clue", clue: { id: "solver", text: "Try the order clue." } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: {
      puzzleToken: "signed-token",
      kind: "clue",
      clues: [{ id: "solver", text: "Try the order clue." }, { id: "fresh", text: "Aki is before Hana." }],
      totalMatches: 16,
      hintsUsed: 0,
      mistakes: 0,
      elapsedMs: 10_000,
      smartMarking: false,
    } } as never, response as never);

    const solverCall = calls.find(call => call.url.includes("yokaiba"));
    assert.deepStrictEqual(solverCall?.body, { puzzleToken: "signed-token", kind: "clue" });
    assert.deepStrictEqual(result.body, { kind: "clue", clue: { id: "fresh", text: "Aki is before Hana." } });
  });

  it("uses deterministic progress strength when JEV is not configured", async () => {
    const fetchMock = mock.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.deepStrictEqual(body, { puzzleToken: "signed-token", kind: "placement" });
      return new Response(JSON.stringify({ kind: "placement", placement: { subject: "Aki", category: "club", value: "Lions" } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    stubGlobal("fetch", fetchMock);
    const { response } = responseRecorder();

    await handler({ method: "POST", body: {
      puzzleToken: "signed-token",
      kind: "clue",
      clues: [{ id: "one", text: "Aki trains at Lions." }],
      board: [{ category: "club", subject: "Aki", value: "Lions", mark: "yes" }, { category: "club", subject: "Hana", value: "Wolves", mark: "yes" }],
      totalMatches: 4,
      hintsUsed: 0,
      mistakes: 0,
      elapsedMs: 1_000,
      smartMarking: false,
    } } as never, response as never);

    assert.strictEqual(fetchMock.mock.callCount(), 1);
  });

  it("falls back to the primary Yokaiba hint when Jev returns an out-of-bounds candidate index", async () => {
    configureJevForTests();
    const fetchMock = mock.fn(async (input: string | URL | Request) => isJevRateLimitRequest(input)
      ? jevRateLimitResponse()
      : String(input).includes("openrouter.ai")
        ? new Response(JSON.stringify({ answers: { next_hint: { type: "choice", choice: "candidate_2", confidence: 1 } } }), { status: 200 })
        : new Response(JSON.stringify({ kind: "placement", placement: { subject: "Aki", category: "club", value: "Lions" } }), { status: 200, headers: { "content-type": "application/json" } }));
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token", kind: "placement", clues: [{ id: "c1", text: "Aki trains at Lions." }] } } as never, response as never);

    assert.deepStrictEqual(result.body, { kind: "placement", placement: { subject: "Aki", category: "club", value: "Lions" } });
  });

  it("falls back to an unused clue when Jev cannot rank candidates and the solver clue was already used", async () => {
    configureJevForTests();
    const fetchMock = mock.fn(async (input: string | URL | Request) => {
      if (isJevRateLimitRequest(input)) return jevRateLimitResponse();
      if (String(input).includes("openrouter.ai")) {
        return new Response(JSON.stringify({ answers: { next_hint: { type: "choice", choice: "candidate_99", confidence: 1 } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ kind: "clue", clue: { id: "used", text: "Already used." } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    stubGlobal("fetch", fetchMock);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: {
      puzzleToken: "signed-token",
      kind: "clue",
      clues: [
        { id: "used", text: "Already used." },
        { id: "fresh-1", text: "Try this unused clue first." },
        { id: "fresh-2", text: "Another unused clue." },
      ],
      usedClueIds: ["used"],
    } } as never, response as never);

    assert.deepStrictEqual(result.body, { kind: "clue", clue: { id: "fresh-1", text: "Try this unused clue first." } });
  });

  it("keeps the existing Yokaiba hint available when optional selection context is malformed", async () => {
    const upstream = resolvedMock(new Response(JSON.stringify({ kind: "clue", clue: { id: "c1", text: "Start here." } }), { status: 200, headers: { "content-type": "application/json" } }));
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token", kind: "clue", clues: [{ id: "bad", text: "x".repeat(513) }] } } as never, response as never);

    assert.strictEqual(upstream.mock.callCount(), 1);
    assert.deepStrictEqual(result.body, { kind: "clue", clue: { id: "c1", text: "Start here." } });
  });

  it("forwards an upstream error status and payload", async () => {
    const upstream = resolvedMock(new Response(JSON.stringify({ error: "temporarily unavailable" }), { status: 503, headers: { "content-type": "application/json" } }));
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token" } } as never, response as never);

    assert.strictEqual(result.statusCode, 503);
    assert.deepStrictEqual(result.body, { error: "temporarily unavailable" });
  });

  it("returns a bounded gateway error when the solver request throws", async () => {
    stubGlobal("fetch", mock.fn(async () => { throw new Error("network unavailable"); }));
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: { puzzleToken: "signed-token" } } as never, response as never);

    assert.strictEqual(result.statusCode, 502);
    assert.deepStrictEqual(result.body, { error: "Yokaiba assistance is unavailable. Please try again." });
  });

  const malformedContexts = [
    { clues: [{ id: "", text: "Missing ID." }] },
    { clues: [{ id: "duplicate", text: "First clue." }, { id: "duplicate", text: "Second clue." }] },
    { usedClueIds: [""] },
    { board: [{ category: "", subject: "Aki", value: "Lions", mark: "yes" }] },
    { board: [{ category: "Club", subject: "Aki", value: "Lions", mark: "unknown" }] },
    { board: [
      { category: "Club", subject: "Aki", value: "Lions", mark: "yes" },
      { category: "Club", subject: "Aki", value: "Lions", mark: "no" },
    ] },
    { board: Array.from({ length: 257 }, (_, index) => ({ category: "Club", subject: `Aki-${index}`, value: "Lions", mark: "no" })) },
    { usedClueIds: Array.from({ length: 65 }, (_, index) => `clue-${index}`) },
  ];
  for (const [caseIndex, context] of malformedContexts.entries()) {
    it(`keeps the solver hint when optional context has an invalid boundary (${caseIndex + 1})`, async () => {
      const payload = { kind: "clue", clue: { id: "c1", text: "Start here." } };
      const upstream = resolvedMock(new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }));
      stubGlobal("fetch", upstream);
      const { response, result } = responseRecorder();

      await handler({ method: "POST", body: { puzzleToken: "signed-token", kind: "clue", ...context } } as never, response as never);

      assert.strictEqual(upstream.mock.callCount(), 1);
      assert.deepStrictEqual(result.body, payload);
    });
  }

  it("uses the sole unused clue when Yokaiba's clue has already been marked used", async () => {
    configureJevForTests();
    const upstream = resolvedMock(new Response(JSON.stringify({ kind: "clue", clue: { id: "used", text: "Already used." } }), { status: 200, headers: { "content-type": "application/json" } }));
    stubGlobal("fetch", upstream);
    const { response, result } = responseRecorder();

    await handler({ method: "POST", body: {
      puzzleToken: "signed-token",
      kind: "clue",
      clues: [{ id: "used", text: "Already used." }, { id: "fresh", text: "Try this clue instead." }],
      usedClueIds: ["used"],
    } } as never, response as never);

    assert.strictEqual(upstream.mock.callCount(), 1);
    assert.deepStrictEqual(result.body, { kind: "clue", clue: { id: "fresh", text: "Try this clue instead." } });
  });
});
