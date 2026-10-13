import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assertPartialMatch } from "../test-utils.js";
import { courses } from "./curriculum";
import { emptyProgress } from "./progress";
import { resolveAnswerOutcome } from "./app-answer-outcome";

describe("resolveAnswerOutcome", () => {
  const firstCourse = courses[0]!;

  it("[TB-OUTCOME-01] records a mistake without awarding course progress", () => {
    const progress = emptyProgress();
    const outcome = resolveAnswerOutcome({ correct: false, playMode: "challenge", course: firstCourse, progress });

    assert.deepStrictEqual(outcome, {
      progress,
      event: "mistake",
      mistakeCountDelta: 1,
      message: "Not quite yet. Your notes are saved, so keep refining the grid.",
      tone: "warning",
      celebrate: false,
      persistProgress: false,
    });
  });

  it("[TB-OUTCOME-01] celebrates a shared puzzle without advancing challenge progress", () => {
    const progress = emptyProgress();
    const outcome = resolveAnswerOutcome({ correct: true, playMode: "shared", course: firstCourse, progress });

    assertPartialMatch(outcome, {
      progress,
      event: "puzzle_completed",
      mistakeCountDelta: 0,
      tone: "success",
      celebrate: true,
      persistProgress: false,
    });
    assert.match(outcome.message, /shared puzzle is complete/);
    assert.match(outcome.message, /Start Puzzle Challenge/);
  });

  it("[TB-OUTCOME-01] completes and persists a challenge course, then names the next course", () => {
    const progress = emptyProgress();
    const outcome = resolveAnswerOutcome({ correct: true, playMode: "challenge", course: firstCourse, progress });

    assert.deepStrictEqual(outcome.progress.completed, [firstCourse.id]);
    assert.strictEqual(outcome.event, "puzzle_completed");
    assert.strictEqual(outcome.message, `Beautifully solved — ${firstCourse.label} is complete. ${courses[1]!.label} is now ready!`);
    assert.strictEqual(outcome.tone, "success");
    assert.strictEqual(outcome.celebrate, true);
    assert.strictEqual(outcome.persistProgress, true);
    assert.strictEqual(outcome.mistakeCountDelta, 0);
  });

  it("[TB-OUTCOME-01] reports completion of the last course without naming a next course", () => {
    const progress = { version: 1 as const, completed: courses.slice(0, -1).map(course => course.id) };
    const lastCourse = courses.at(-1)!;
    const outcome = resolveAnswerOutcome({ correct: true, playMode: "challenge", course: lastCourse, progress });

    assert.strictEqual(outcome.message, "Beautifully solved — you have completed every Puzzle Challenge level!");
    assert.strictEqual(outcome.progress.completed.at(-1), lastCourse.id);
  });
});
