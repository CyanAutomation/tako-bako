import assert from "node:assert/strict";
import test from "node:test";
import { handleFeedbackRequest } from "../api/feedback.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function responseHarness() {
  let statusCode = 200;
  const headers = new Map<string, string>();
  let body: unknown;
  const response = {
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); return this; },
    status(value: number) { statusCode = value; return this; },
    json(value: unknown) { body = value; return this; },
  } as unknown as VercelResponse;
  return { response, get statusCode() { return statusCode; }, headers, get body() { return body; } };
}

function validBody() {
  return {
    puzzleToken: "signed-token",
    rating: "too_hard",
    reason: "confusing_clues",
    outcome: "in_progress",
    hintsUsed: 1,
    mistakes: 0,
    smartMarkingEnabled: false,
    idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
  };
}

test("Vercel feedback proxy validates and forwards only the expected request", async () => {
  const harness = responseHarness();
  let forwarded: Record<string, unknown> | undefined;
  await handleFeedbackRequest({ method: "POST", body: { ...validBody(), fingerprint: "forged" } } as VercelRequest, harness.response,
    (async (_url, init) => {
      forwarded = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ accepted: true, duplicate: false }), { status: 202, headers: { "content-type": "application/json" } });
    }) as typeof fetch);

  assert.equal(harness.statusCode, 400);
  assert.equal(forwarded, undefined);

  const accepted = responseHarness();
  await handleFeedbackRequest({ method: "POST", body: validBody() } as VercelRequest, accepted.response,
    (async (url, init) => {
      assert.equal(url, "https://yokaiba.scheimann.workers.dev/v1/feedback");
      forwarded = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ accepted: true, duplicate: false }), { status: 202, headers: { "content-type": "application/json", "x-request-id": "request-123" } });
    }) as typeof fetch);

  assert.equal(accepted.statusCode, 202);
  assert.equal(accepted.headers.get("cache-control"), "no-store");
  assert.equal(accepted.headers.get("x-yokaiba-request-id"), "request-123");
  assert.deepEqual(forwarded, validBody());
  assert.deepEqual(accepted.body, { accepted: true, duplicate: false });
});

test("Vercel feedback proxy hides upstream internals and handles methods", async () => {
  const failed = responseHarness();
  await handleFeedbackRequest({ method: "POST", body: validBody() } as VercelRequest, failed.response,
    (async () => new Response(JSON.stringify({ error: "database connection string" }), { status: 503 })) as typeof fetch);
  assert.equal(failed.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(failed.body), /connection string/);

  const method = responseHarness();
  await handleFeedbackRequest({ method: "GET", body: validBody() } as VercelRequest, method.response);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.get("allow"), "POST");
});

test("server-side Yokaiba origin override accepts local origins and rejects paths or credentials", async () => {
  const { yokaibaApiOrigin } = await import("../server/yokaiba-origin.js");
  assert.equal(yokaibaApiOrigin("http://127.0.0.1:8787"), "http://127.0.0.1:8787");
  assert.equal(yokaibaApiOrigin("https://yokaiba.example"), "https://yokaiba.example");
  assert.throws(() => yokaibaApiOrigin("https://user:secret@example.test"), /origin/);
  assert.throws(() => yokaibaApiOrigin("https://example.test/path"), /origin/);
});
