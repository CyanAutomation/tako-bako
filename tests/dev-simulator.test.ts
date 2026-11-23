import assert from "node:assert/strict";
import test from "node:test";
import { waitForSimulator } from "../scripts/simulator-readiness.js";

test("simulator readiness waits through transient failures and accepts only its health marker", async () => {
  let calls = 0;
  const delays: number[] = [];
  await waitForSimulator({ exitCode: null, signalCode: null }, 4174, {
    attempts: 3,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error("not bound yet");
      return calls === 2
        ? new Response("wrong service", { status: 200 })
        : new Response("ok", { status: 200, headers: { "x-tako-bako-simulator": "true" } });
    },
    sleep: async milliseconds => { delays.push(milliseconds); },
  });

  assert.equal(calls, 3);
  assert.deepEqual(delays, [50, 50]);
});

test("simulator readiness fails immediately when the child exits", async () => {
  let calls = 0;
  await assert.rejects(waitForSimulator({ exitCode: 1, signalCode: null }, 4174, {
    fetchImpl: async () => {
      calls += 1;
      return new Response("unexpected", { status: 200, headers: { "x-tako-bako-simulator": "true" } });
    },
    sleep: async () => {},
  }), /exited before it became ready/);
  assert.equal(calls, 0);
});

test("simulator readiness reports the health URL after exhausting its attempts", async () => {
  let calls = 0;
  await assert.rejects(waitForSimulator({ exitCode: null, signalCode: null }, 4175, {
    attempts: 2,
    fetchImpl: async () => {
      calls += 1;
      return new Response("wrong service", { status: 200 });
    },
    sleep: async () => {},
  }), /http:\/\/127\.0\.0\.1:4175\/healthz/);
  assert.equal(calls, 2);
});
