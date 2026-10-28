import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { config as puzzleConfig } from "../../api/puzzle.js";
import { config as hintConfig } from "../../api/hint.js";
import { config as clueStrategiesConfig } from "../../api/clue-strategies.js";
import { config as eventsConfig } from "../../api/events.js";
import { config as feedbackConfig } from "../../api/feedback.js";

describe("API body parser limits", () => {
  it("caps parsed JSON bodies close to each endpoint's bounded input contract", () => {
    assert.strictEqual(puzzleConfig.api.bodyParser.sizeLimit, "2mb");
    assert.strictEqual(hintConfig.api.bodyParser.sizeLimit, "2mb");
    assert.strictEqual(clueStrategiesConfig.api.bodyParser.sizeLimit, "256kb");
    assert.strictEqual(eventsConfig.api.bodyParser.sizeLimit, "4kb");
    assert.strictEqual(feedbackConfig.api.bodyParser.sizeLimit, "4kb");
  });
});
