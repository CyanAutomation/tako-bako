import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { checkExternalLinks, checkExternalLinksInRepository, extractExternalLinks } from "../scripts/check-external-links.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), "tako-bako-link-check-"));
  temporaryDirectories.push(root);
  return root;
}

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

  it("checks a repository without an optional docs directory", async () => {
    const root = await createRepository();
    await writeFile(join(root, "README.md"), "[Home](https://example.com)");
    const requested: string[] = [];

    const errors = await checkExternalLinksInRepository(root, async input => {
      requested.push(String(input));
      return { status: 200 } as Response;
    });

    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(requested, ["https://example.com/"]);
  });

  it("reports a clear error when the required README is missing", async () => {
    const root = await createRepository();

    await assert.rejects(
      checkExternalLinksInRepository(root, async () => ({ status: 200 } as Response)),
      /Required README\.md not found/,
    );
  });
});
