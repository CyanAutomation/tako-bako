import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parse } from "yaml";
import { courses, defaultDifficultyModelForCourse } from "../src/curriculum.js";

interface GenerationTarget {
  difficultyLevel: number;
  templateId: string;
  difficultyModel: string;
  seed: string;
}

interface WorkflowDocument {
  jobs?: Record<string, {
    strategy?: { matrix?: { include?: GenerationTarget[] } };
  }>;
}

describe("deployment smoke generation matrix", () => {
  it("covers every challenge course using its configured template and model", () => {
    const workflowPath = new URL("../.github/workflows/deployment-smoke.yml", import.meta.url);
    const workflow = parse(readFileSync(workflowPath, "utf8")) as WorkflowDocument;
    const targets = workflow.jobs?.generation?.strategy?.matrix?.include ?? [];

    assert.deepStrictEqual(targets, courses.map(course => ({
      difficultyLevel: course.difficultyLevel,
      templateId: course.templateId,
      difficultyModel: defaultDifficultyModelForCourse(course),
      seed: course.difficultyLevel === 7
        ? "difficulty-v5-audit-target-open-division-v2-7-0"
        : course.difficultyLevel === 8
          ? "CodexAuditLevel8Alt"
          : `deployment-smoke-${course.id}`,
    })));
  });
});
