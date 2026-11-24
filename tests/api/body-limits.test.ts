import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { config as puzzleConfig } from "../../api/puzzle.js";
import { config as hintConfig } from "../../api/hint.js";
import { config as clueStrategiesConfig } from "../../api/clue-strategies.js";
import { config as eventsConfig } from "../../api/events.js";
import { config as feedbackConfig } from "../../api/feedback.js";
import { config as learningRecommendationConfig } from "../../api/learning-recommendation.js";

describe("API request body limits", () => {
  it("[TB-API-INPUT-01] applies the documented parser budget to every JSON endpoint", () => {
    const configuredLimits = {
      puzzle: puzzleConfig.api.bodyParser.sizeLimit,
      hint: hintConfig.api.bodyParser.sizeLimit,
      clueStrategies: clueStrategiesConfig.api.bodyParser.sizeLimit,
      events: eventsConfig.api.bodyParser.sizeLimit,
      feedback: feedbackConfig.api.bodyParser.sizeLimit,
      learningRecommendation: learningRecommendationConfig.api.bodyParser.sizeLimit,
    };

    assert.deepStrictEqual(configuredLimits, {
      puzzle: "2mb",
      hint: "2mb",
      clueStrategies: "256kb",
      events: "4kb",
      feedback: "4kb",
      learningRecommendation: "32kb",
    });
  });
});
