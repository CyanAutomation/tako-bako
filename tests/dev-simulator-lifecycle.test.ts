import assert from "node:assert/strict";
import test from "node:test";

import { childExitMessage, portFromEnvironment, signalRunningChildren } from "../scripts/dev-simulator-lifecycle.js";
import type { ChildProcess } from "node:child_process";

test("simulator ports use the fallback or accept valid integer TCP ports", () => {
  assert.equal(portFromEnvironment(undefined, "SIMULATOR_PORT", 4174), 4174);
  assert.equal(portFromEnvironment("1", "SIMULATOR_PORT", 4174), 1);
  assert.equal(portFromEnvironment("65535", "SIMULATOR_PORT", 4174), 65_535);
});

test("simulator ports reject values outside the integer TCP port range", () => {
  for (const value of ["0", "65536", "1.5", "abc"]) {
    assert.throws(() => portFromEnvironment(value, "SIMULATOR_PORT", 4174), /SIMULATOR_PORT must be a valid TCP port/);
  }
});

test("shutdown signals only children that have not already exited", () => {
  const signals: string[] = [];
  const children: Pick<ChildProcess, "exitCode" | "signalCode" | "kill">[] = [
    { exitCode: null, signalCode: null, kill: signal => { signals.push(`running:${signal}`); return true; } },
    { exitCode: 0, signalCode: null, kill: signal => { signals.push(`exited:${signal}`); return true; } },
    { exitCode: null, signalCode: "SIGTERM", kill: signal => { signals.push(`signaled:${signal}`); return true; } },
  ];

  signalRunningChildren(children, "SIGKILL");

  assert.deepEqual(signals, ["running:SIGKILL"]);
});

test("simulator child exit messages preserve signal and exit-code details", () => {
  assert.equal(childExitMessage(2, null), "[tako-bako simulator] child process stopped with exit code 2");
  assert.equal(childExitMessage(null, "SIGTERM"), "[tako-bako simulator] child process stopped (SIGTERM)");
  assert.equal(childExitMessage(null, null), "[tako-bako simulator] child process stopped with exit code 1");
});
