import { parseEventPayload } from "../server/event-payload.js";
import { parseFeedbackPayload } from "../server/feedback-payload.js";
import { strategyForConstraintKind } from "../src/clue-strategy-constraints.js";
import { parseDifficultyModel } from "../src/puzzle-input.js";
import { isScenarioId } from "../src/scenarios.js";
import { parseClues } from "../server/clue-strategy-input.js";
import { MAX_REQUEST_BODY_BYTES } from "./constants.js";
import { loadFixtures, type SimulatorFixture } from "./fixture-loader.js";

const GENERATION_CACHE_CONTROL = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
const MAX_TOKEN_LENGTH = 3_000;
const MAX_HINT_INDEX = 100;
const GENERATION_QUERY_FIELDS = new Set(["templateId", "seed", "difficultyLevel", "allowSeedFallback", "difficultyModel"]);
const GENERATION_BODY_FIELDS = new Set(["templateId", "seed", "difficultyLevel", "allowSeedFallback", "difficultyModel"]);

interface GenerationInput {
  templateId: string;
  seed: string;
  difficultyLevel?: number;
  difficultyModel?: "v4" | "v5" | "compare";
  allowSeedFallback?: boolean;
}

type SimulatorResponse = { body: unknown; status?: number; headers?: Record<string, string> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse({ body, status = 200, headers = {} }: SimulatorResponse): Response {
  const responseHeaders = new Headers({
    "content-type": "application/json; charset=utf-8",
    "x-tako-bako-simulator": "true",
    "cache-control": "no-store",
    ...headers,
  });
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function errorResponse(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ status, body: { error: { code, message }, ...extra } });
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function parseSeed(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 128 ? value : undefined;
}

function parseDifficulty(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const level = typeof value === "string" && /^(?:[1-9]|1[0-2])$/.test(value) ? Number(value) : value;
  return typeof level === "number" && Number.isInteger(level) && level >= 1 && level <= 12 ? level : undefined;
}

function parseFallback(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseGenerationFields(value: Record<string, unknown>, allowed: Set<string>): GenerationInput | undefined {
  if (Object.keys(value).some(field => !allowed.has(field))) return undefined;
  const templateId = typeof value.templateId === "string" && value.templateId.trim().length > 0 && value.templateId.length <= 128
    ? value.templateId
    : undefined;
  const seed = parseSeed(value.seed);
  const difficultyLevel = parseDifficulty(value.difficultyLevel);
  const difficultyModel = parseDifficultyModel(typeof value.difficultyModel === "string" ? value.difficultyModel : undefined);
  const allowSeedFallback = parseFallback(value.allowSeedFallback);
  if (!templateId || !seed
    || (value.difficultyLevel !== undefined && difficultyLevel === undefined)
    || (value.difficultyModel !== undefined && difficultyModel === undefined)
    || (value.allowSeedFallback !== undefined && allowSeedFallback === undefined)) return undefined;
  return {
    templateId,
    seed,
    ...(difficultyLevel === undefined ? {} : { difficultyLevel }),
    ...(difficultyModel === undefined ? {} : { difficultyModel }),
    ...(allowSeedFallback === undefined ? {} : { allowSeedFallback }),
  };
}

function generationInputFromQuery(url: URL): GenerationInput | undefined {
  for (const field of url.searchParams.keys()) {
    if (!GENERATION_QUERY_FIELDS.has(field) || url.searchParams.getAll(field).length !== 1) return undefined;
  }
  return parseGenerationFields(Object.fromEntries(url.searchParams.entries()), GENERATION_QUERY_FIELDS);
}

async function generationInputFromRequest(request: Request): Promise<GenerationInput | undefined> {
  if (request.method === "GET") return generationInputFromQuery(new URL(request.url));
  if (request.method !== "POST") return undefined;
  const body = await readJsonObject(request);
  return body ? parseGenerationFields(body, GENERATION_BODY_FIELDS) : undefined;
}

function fixtureForToken(fixtures: readonly SimulatorFixture[], token: unknown): SimulatorFixture | undefined {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return undefined;
  return fixtures.find(fixture => fixture.publicPuzzle.puzzleToken === token);
}

function availableLevels(fixtures: readonly SimulatorFixture[], templateId: string): number[] {
  return [...new Set(fixtures
    .filter(fixture => fixture.publicPuzzle.templateId === templateId)
    .map(fixture => fixture.publicPuzzle.difficulty.level))]
    .sort((left, right) => left - right);
}

function generationResponse(fixture: SimulatorFixture, input: GenerationInput, isGet: boolean): Response {
  const puzzle = { ...fixture.publicPuzzle };
  delete puzzle.requestedDifficultyLevel;
  const body = {
    ...puzzle,
    requestedSeed: input.seed,
    ...(input.difficultyLevel === undefined ? {} : { requestedDifficultyLevel: input.difficultyLevel }),
    ...(input.difficultyModel === undefined ? {} : { difficultyModel: input.difficultyModel }),
  };
  const headers: Record<string, string> = isGet
    ? {
      "cache-control": GENERATION_CACHE_CONTROL,
      "x-tako-bako-generated-at": String(Date.now()),
    }
    : { "cache-control": "no-store" };
  return jsonResponse({ body, headers });
}

async function handleGeneration(request: Request, fixtures: readonly SimulatorFixture[]): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse({ status: 405, body: { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers: { allow: "GET, POST" } });
  }
  const input = await generationInputFromRequest(request);
  if (!input) return errorResponse(400, "invalid_request", "A valid template, seed, difficulty level, and difficulty model are required");
  if (!isScenarioId(input.templateId)) return errorResponse(404, "not_found", "Unknown templateId");

  const templateFixtures = fixtures.filter(fixture => fixture.publicPuzzle.templateId === input.templateId);
  if (templateFixtures.length === 0) return errorResponse(404, "not_found", "No local fixture is available for this templateId");
  const availableDifficultyLevels = availableLevels(fixtures, input.templateId);
  const fixture = input.difficultyLevel === undefined
    ? templateFixtures[0]
    : templateFixtures.find(candidate => candidate.publicPuzzle.difficulty.level === input.difficultyLevel);
  if (!fixture) {
    return errorResponse(422, "difficulty_unavailable", "No local fixture is available for the requested difficulty", {
      templateId: input.templateId,
      ...(input.difficultyLevel === undefined ? {} : { requestedDifficultyLevel: input.difficultyLevel }),
      availableDifficultyLevels,
    });
  }
  return generationResponse(fixture, input, request.method === "GET");
}

function assignmentsFromAnswer(value: unknown, fixture: SimulatorFixture): Record<string, string[]> | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 1 || !isRecord(value.assignments)) return undefined;
  const base = fixture.publicPuzzle.spec.categories.find(category => category.id === fixture.publicPuzzle.spec.baseCategory);
  if (!base) return undefined;
  const categories = fixture.publicPuzzle.spec.categories.filter(category => category.id !== base.id);
  const assignments = value.assignments;
  if (Object.keys(assignments).length !== categories.length || categories.some(category => !Object.hasOwn(assignments, category.id))) return undefined;
  const parsed: Record<string, string[]> = {};
  for (const category of categories) {
    const values = assignments[category.id];
    if (!Array.isArray(values) || values.length !== base.values.length
      || !values.every(item => typeof item === "string" && category.values.includes(item))
      || new Set(values).size !== category.values.length) return undefined;
    parsed[category.id] = [...values];
  }
  return parsed;
}

function assignmentsMatch(actual: Record<string, string[]>, expected: Record<string, string[]>): boolean {
  const actualCategories = Object.keys(actual);
  const expectedCategories = Object.keys(expected);
  return actualCategories.length === expectedCategories.length
    && expectedCategories.every(category => actual[category]?.length === expected[category]?.length
      && actual[category]!.every((value, index) => value === expected[category]![index]));
}

async function handleVerification(request: Request, fixtures: readonly SimulatorFixture[]): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ status: 405, body: { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers: { allow: "POST" } });
  const body = await readJsonObject(request);
  if (!body || Object.keys(body).some(field => field !== "puzzleToken" && field !== "answer")) {
    return errorResponse(400, "invalid_request", "A puzzle token and complete answer are required");
  }
  const fixture = fixtureForToken(fixtures, body.puzzleToken);
  if (!fixture) return errorResponse(400, "invalid_token", "Unknown simulation puzzle token");
  const assignments = assignmentsFromAnswer(body.answer, fixture);
  if (!assignments) return errorResponse(400, "invalid_answer", "A complete answer matching the puzzle categories is required");
  return jsonResponse({ body: { correct: assignmentsMatch(assignments, fixture.solution.assignments) } });
}

interface Placement {
  subject: string;
  category: string;
  value: string;
}

function parseBoardMarks(value: unknown, fixture: SimulatorFixture): Array<{ categoryId: string; subject: string; value: string; mark: "yes" | "no" }> | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 256) return undefined;
  const base = fixture.publicPuzzle.spec.categories.find(category => category.id === fixture.publicPuzzle.spec.baseCategory);
  if (!base) return undefined;
  const categories = fixture.publicPuzzle.spec.categories.filter(category => category.id !== base.id);
  const marks: Array<{ categoryId: string; subject: string; value: string; mark: "yes" | "no" }> = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.category !== "string" || typeof item.subject !== "string"
      || typeof item.value !== "string" || (item.mark !== "yes" && item.mark !== "no")) return undefined;
    const category = categories.find(candidate => candidate.id === item.category || candidate.label === item.category);
    if (!category || !base.values.includes(item.subject) || !category.values.includes(item.value)) return undefined;
    marks.push({ categoryId: category.id, subject: item.subject, value: item.value, mark: item.mark });
  }
  return marks;
}

function placementAgreesWithBoard(fixture: SimulatorFixture, placement: Placement, marks: NonNullable<ReturnType<typeof parseBoardMarks>>): boolean {
  const expectedValue = fixture.solution.assignments[placement.category]?.[
    fixture.publicPuzzle.spec.categories.find(category => category.id === fixture.publicPuzzle.spec.baseCategory)!.values.indexOf(placement.subject)
  ];
  if (expectedValue !== placement.value) return false;
  return marks.every(mark => {
    if (mark.categoryId !== placement.category) return true;
    const sameRow = mark.subject === placement.subject;
    const sameColumn = mark.value === placement.value;
    if (mark.mark === "yes" && (sameRow || sameColumn)) return sameRow && sameColumn;
    if (mark.mark === "no" && sameRow && sameColumn) return false;
    return true;
  });
}

function hintKind(value: unknown, appCompatibilityRoute: boolean): "clue" | "elimination" | "placement" | undefined {
  if (value === undefined) return "clue";
  if (value === "clue" || value === "elimination" || (appCompatibilityRoute && value === "placement")) return value;
  return undefined;
}

interface HintRequest {
  kind: "clue" | "elimination" | "placement";
  index: number;
}

function hasAllowedHintFields(body: Record<string, unknown>, appCompatibilityRoute: boolean): boolean {
  if (appCompatibilityRoute) return true;
  const allowedFields = new Set(["puzzleToken", "kind", "hintIndex"]);
  return Object.keys(body).every(field => allowedFields.has(field));
}

function parseHintRequest(body: Record<string, unknown>, appCompatibilityRoute: boolean): HintRequest | undefined {
  const kind = hintKind(body.kind, appCompatibilityRoute);
  const requestedIndex = appCompatibilityRoute ? body.hintsUsed : body.hintIndex;
  const index = requestedIndex === undefined ? 0 : requestedIndex;
  if (!kind || typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > MAX_HINT_INDEX) return undefined;
  return { kind, index };
}

function placementHint(fixture: SimulatorFixture, board: unknown, index: number): Response {
  const marks = parseBoardMarks(board, fixture);
  if (!marks) return errorResponse(400, "invalid_request", "The board context is invalid");
  const base = fixture.publicPuzzle.spec.categories.find(category => category.id === fixture.publicPuzzle.spec.baseCategory)!;
  const placements = fixture.publicPuzzle.spec.categories
    .filter(category => category.id !== base.id)
    .flatMap(category => base.values.map((subject, row) => ({
      subject,
      category: category.id,
      value: fixture.solution.assignments[category.id]![row]!,
    })))
    .filter(placement => placementAgreesWithBoard(fixture, placement, marks));
  if (placements.length === 0) return errorResponse(409, "no_consistent_hint", "No fixture placement agrees with the current marks");

  const marked = new Set(marks.filter(mark => mark.mark === "yes").map(mark => `${mark.categoryId}\u0000${mark.subject}\u0000${mark.value}`));
  const unmarked = placements.filter(placement => !marked.has(`${placement.category}\u0000${placement.subject}\u0000${placement.value}`));
  const pool = unmarked.length > 0 ? unmarked : placements;
  return jsonResponse({ body: { kind: "placement", placement: pool[index % pool.length] } });
}

function clueHint(fixture: SimulatorFixture, kind: "clue" | "elimination", index: number): Response {
  const eliminationClues = fixture.publicPuzzle.clues.filter(clue => clue.constraint.kind === "notMatches");
  const cluePool = kind === "elimination" && eliminationClues.length > 0 ? eliminationClues : fixture.publicPuzzle.clues;
  const clue = cluePool[index % cluePool.length];
  if (!clue) return errorResponse(503, "not_configured", "No local clue hints are available");
  const responseKind = kind === "elimination" && clue.constraint.kind === "notMatches" ? "elimination" : "clue";
  return jsonResponse({ body: { kind: responseKind, clue: { id: clue.id, text: clue.text } } });
}

async function handleHint(request: Request, fixtures: readonly SimulatorFixture[], appCompatibilityRoute: boolean): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ status: 405, body: { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers: { allow: "POST" } });
  const body = await readJsonObject(request);
  if (!body || !hasAllowedHintFields(body, appCompatibilityRoute)) {
    return errorResponse(400, "invalid_request", "A valid puzzle hint request is required");
  }
  const fixture = fixtureForToken(fixtures, body.puzzleToken);
  if (!fixture) return errorResponse(400, "invalid_token", "Unknown simulation puzzle token");
  const hint = parseHintRequest(body, appCompatibilityRoute);
  if (!hint) {
    return errorResponse(400, "invalid_request", "A supported hint kind and index are required");
  }
  if (hint.kind === "placement") return placementHint(fixture, body.board, hint.index);
  return clueHint(fixture, hint.kind, hint.index);
}

async function handleEvents(request: Request, appCompatibilityRoute: boolean, fixtures: readonly SimulatorFixture[]): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ status: 405, body: { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers: { allow: "POST" } });
  const body = await readJsonObject(request);
  const hasToken = typeof body?.puzzleToken === "string";
  if (!body || (!appCompatibilityRoute && (!hasToken || !fixtureForToken(fixtures, body.puzzleToken)))) {
    return errorResponse(400, "invalid_request", "A local puzzle outcome is required");
  }
  if (!parseEventPayload(body)) return errorResponse(400, "invalid_request", "A valid anonymous puzzle outcome is required");
  return jsonResponse({ status: 202, body: { accepted: true } });
}

async function handleFeedback(request: Request, fixtures: readonly SimulatorFixture[], feedback: Map<string, string>): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ status: 405, body: { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers: { allow: "POST" } });
  const body = await readJsonObject(request);
  const parsed = body ? parseFeedbackPayload(body) : undefined;
  if (!parsed || !fixtureForToken(fixtures, parsed.puzzleToken)) return errorResponse(400, "invalid_request", "A valid local puzzle difficulty rating is required");
  const serialized = JSON.stringify(parsed);
  const existing = feedback.get(parsed.idempotencyKey);
  if (existing !== undefined && existing !== serialized) return errorResponse(409, "conflict", "This feedback was already submitted with different details");
  if (existing !== undefined) return jsonResponse({ status: 200, body: { accepted: true, duplicate: true } });
  feedback.set(parsed.idempotencyKey, serialized);
  return jsonResponse({ status: 202, body: { accepted: true, duplicate: false } });
}

async function handleClueStrategies(request: Request): Promise<Response> {
  if (request.method !== "POST") return jsonResponse({ status: 405, body: { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers: { allow: "POST" } });
  const body = await readJsonObject(request);
  const clues = body ? parseClues(body.clues) : undefined;
  if (!clues) return errorResponse(400, "invalid_request", "A valid bounded clue list is required");
  const strategies = clues.flatMap(clue => {
    const strategy = strategyForConstraintKind(clue.constraintKind);
    return strategy ? [{ clueId: clue.id, strategy, confidence: 1 }] : [];
  });
  return jsonResponse({ body: { strategies } });
}

function methodNotAllowed(allow: string): Response {
  return jsonResponse({ status: 405, body: { error: { code: "method_not_allowed", message: "Method not allowed" } }, headers: { allow } });
}

export interface Simulator {
  handle(request: Request): Promise<Response>;
}

type SimulatorRoute = (request: Request) => Promise<Response>;

function handlePuzzleCompatibilityRoute(request: Request, fixtures: readonly SimulatorFixture[]): Promise<Response> {
  if (request.method === "GET") return handleGeneration(request, fixtures);
  if (request.method === "POST") return handleVerification(request, fixtures);
  return Promise.resolve(methodNotAllowed("GET, POST"));
}

async function handleHealthRoute(request: Request, includeYokaiba: boolean): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed("GET");
  const body = includeYokaiba ? { status: "ok", dependencies: { yokaiba: "ok" } } : { status: "ok" };
  return jsonResponse({ body });
}

function createRoutes(fixtures: readonly SimulatorFixture[], feedback: Map<string, string>): Map<string, SimulatorRoute> {
  return new Map<string, SimulatorRoute>([
    ["/api/puzzle", request => handlePuzzleCompatibilityRoute(request, fixtures)],
    ["/v1/puzzles/generate", request => handleGeneration(request, fixtures)],
    ["/v1/puzzles/verify", request => handleVerification(request, fixtures)],
    ["/api/hint", request => handleHint(request, fixtures, true)],
    ["/v1/puzzles/hint", request => handleHint(request, fixtures, false)],
    ["/api/events", request => handleEvents(request, true, fixtures)],
    ["/v1/events", request => handleEvents(request, false, fixtures)],
    ["/api/feedback", request => handleFeedback(request, fixtures, feedback)],
    ["/v1/feedback", request => handleFeedback(request, fixtures, feedback)],
    ["/api/clue-strategies", handleClueStrategies],
    ["/healthz", request => handleHealthRoute(request, false)],
    ["/api/health", request => handleHealthRoute(request, true)],
  ]);
}

async function dispatchRequest(request: Request, routes: Map<string, SimulatorRoute>): Promise<Response> {
  if ((await request.clone().arrayBuffer()).byteLength > MAX_REQUEST_BODY_BYTES) {
    return errorResponse(413, "payload_too_large", "Request body is too large");
  }
  const route = routes.get(new URL(request.url).pathname);
  return route ? route(request) : errorResponse(404, "not_found", "Unknown simulator route");
}

/** Create a fully local request handler. It deliberately has no fetch/provider dependency. */
export function createSimulator(fixtures: SimulatorFixture[] = loadFixtures()): Simulator {
  const feedback = new Map<string, string>();
  const tokens = new Set(fixtures.map(fixture => fixture.publicPuzzle.puzzleToken));
  if (tokens.size !== fixtures.length) throw new Error("Simulator fixture tokens must be unique");
  const routes = createRoutes(fixtures, feedback);

  return {
    handle: request => dispatchRequest(request, routes),
  };
}
