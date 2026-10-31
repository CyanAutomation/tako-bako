import assert from "node:assert/strict";
import test from "node:test";
import { createSnackbarController } from "./snackbar";

test("expires a transient message after its display duration", context => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const changes: string[] = [];
  const snackbar = createSnackbarController({ duration: 5000, onExpire: () => changes.push("expired") });

  snackbar.show("Copied.", "success");
  assert.deepStrictEqual(snackbar.current, { id: 1, message: "Copied.", tone: "success" });
  context.mock.timers.tick(4999);
  assert.ok(snackbar.current);
  context.mock.timers.tick(1);
  assert.strictEqual(snackbar.current, undefined);
  assert.deepStrictEqual(changes, ["expired"]);
});

test("replaces an existing message and ignores the old timer", context => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const snackbar = createSnackbarController({ duration: 5000 });

  snackbar.show("First.", "success");
  context.mock.timers.tick(3000);
  snackbar.show("Second.", "success");
  context.mock.timers.tick(2000);
  assert.strictEqual(snackbar.current?.message, "Second.");
  context.mock.timers.tick(3000);
  assert.strictEqual(snackbar.current, undefined);
});

test("pauses while the snackbar is hovered or focused, then resumes the remaining time", context => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const snackbar = createSnackbarController({ duration: 5000 });

  snackbar.show("Saved.", "success");
  context.mock.timers.tick(3000);
  snackbar.pause();
  context.mock.timers.tick(10000);
  assert.ok(snackbar.current);
  snackbar.resume();
  context.mock.timers.tick(1999);
  assert.ok(snackbar.current);
  context.mock.timers.tick(1);
  assert.strictEqual(snackbar.current, undefined);
});

test("waits for every active pause reason before resuming", context => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const snackbar = createSnackbarController({ duration: 5000 });

  snackbar.show("Saved.", "success");
  context.mock.timers.tick(2000);
  snackbar.pause("pointer");
  snackbar.pause("focus");
  snackbar.resume("pointer");
  context.mock.timers.tick(5000);
  assert.ok(snackbar.current);
  snackbar.resume("focus");
  context.mock.timers.tick(2999);
  assert.ok(snackbar.current);
  context.mock.timers.tick(1);
  assert.strictEqual(snackbar.current, undefined);
});

test("does not resume after dismissal", context => {
  context.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const snackbar = createSnackbarController({ duration: 5000 });

  snackbar.show("Saved.", "success");
  snackbar.pause();
  snackbar.clear();
  snackbar.resume();
  context.mock.timers.tick(10000);
  assert.strictEqual(snackbar.current, undefined);
});
