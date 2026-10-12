import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkExternalLinks, extractExternalLinks } from "../scripts/check-external-links.mjs";

describe("external Markdown link check", () => {
  it("extracts unique HTTP links and ignores local and non-web targets", () => {
    const markdown = [
      "[first](https://example.com/path)",
      "[same target](https://example.com/path)",
      "[relative](docs/guide.md)",
      "[email](mailto:team@example.com)",
    ].join("\n");

    assert.deepStrictEqual(extractExternalLinks(markdown), ["https://example.com/path"]);
  });

  it("reports failed web links and accepts successful responses", async () => {
    const requests: string[] = [];
    const errors = await checkExternalLinks([
      "[available](https://example.com/ok) [missing](https://example.com/missing)",
    ], async input => {
      const url = String(input);
      requests.push(url);
      return { ok: url.endsWith("/ok"), status: url.endsWith("/ok") ? 200 : 404 } as Response;
    });

    assert.deepStrictEqual(requests.sort(), ["https://example.com/missing", "https://example.com/ok"]);
    assert.deepStrictEqual(errors, ["External link returned HTTP 404: https://example.com/missing"]);
  });
});
