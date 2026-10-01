import assert from "node:assert/strict";
import { mock } from "node:test";

const originalGlobalDescriptors = new Map<string, PropertyDescriptor | undefined>();

const JEV_TEST_REDIS_URL = "https://test-db.upstash.io";

export function configureJevForTests(): void {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.UPSTASH_REDIS_REST_URL = JEV_TEST_REDIS_URL;
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-redis-token";
}

export function isJevRateLimitRequest(input: string | URL | Request): boolean {
  return String(input) === JEV_TEST_REDIS_URL;
}

export function jevRateLimitResponse(clientCount = 1, globalCount = 1, allowed = 1): Response {
  return new Response(JSON.stringify({ result: [clientCount, globalCount, allowed] }), { status: 200 });
}

export function stubGlobal(name: string, value: unknown): void {
  if (!originalGlobalDescriptors.has(name)) {
    originalGlobalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  });
}

export function restoreStubbedGlobals(): void {
  for (const [name, descriptor] of originalGlobalDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originalGlobalDescriptors.clear();
}

export function resolvedMock<T>(value: T) {
  return mock.fn((...args: unknown[]) => {
    void args;
    return Promise.resolve(value);
  });
}

export function rejectedMock(error: unknown) {
  return mock.fn((...args: unknown[]) => {
    void args;
    return Promise.reject(error);
  });
}

export function resolvedSequenceMock<T>(...values: T[]) {
  const pending = [...values];
  return mock.fn((...args: unknown[]) => {
    void args;
    return Promise.resolve(pending.shift());
  });
}

export function assertPartialMatch(actual: unknown, expected: unknown): void {
  if (expected === null || typeof expected !== "object" || Array.isArray(expected)) {
    assert.deepStrictEqual(actual, expected);
    return;
  }

  assert.ok(actual !== null && typeof actual === "object", "expected an object to match");
  for (const [key, value] of Object.entries(expected)) {
    assertPartialMatch((actual as Record<string, unknown>)[key], value);
  }
}
