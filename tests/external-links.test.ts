import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  checkExternalLinks,
  checkExternalLinksInRepository,
  extractExternalLinks,
  fetchExternalLink,
  isPublicExternalAddress,
} from "../scripts/check-external-links.ts";

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

  it("passes only the URL to a link fetcher", async () => {
    const fetchArguments: unknown[][] = [];
    const errors = await checkExternalLinks(["[available](https://example.com/ok)"], async (...args: [string, ...unknown[]]) => {
      fetchArguments.push(args);
      return { status: 200 } as Response;
    });

    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(fetchArguments, [["https://example.com/ok"]]);
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

  it("allows globally routable addresses and rejects local or reserved addresses", () => {
    for (const address of ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]) {
      assert.equal(isPublicExternalAddress(address), true, `${address} should be public`);
    }
    for (const address of [
      "0.1.2.3", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1",
      "192.168.1.1", "198.18.0.1", "224.0.0.1", "::", "::1", "::ffff:127.0.0.1",
      "fc00::1", "fe80::1", "ff02::1", "2001:db8::1",
    ]) {
      assert.equal(isPublicExternalAddress(address), false, `${address} should be blocked`);
    }
  });

  it("follows only a bounded chain of public HTTP redirects", async () => {
    const requested: string[] = [];
    const responses = [
      new Response("", { status: 302, headers: { location: "https://docs.example.org/final" } }),
      new Response("ok", { status: 200 }),
    ];
    const response = await fetchExternalLink("https://example.com/start", {
      fetchImpl: async (input, init) => {
        requested.push(String(input));
        assert.equal(init?.redirect, "manual");
        return responses.shift()!;
      },
      lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
      sleep: async () => {},
    });

    assert.equal(response.status, 200);
    assert.deepStrictEqual(requested, ["https://example.com/start", "https://docs.example.org/final"]);

    let redirectCount = 0;
    await assert.rejects(fetchExternalLink("https://example.com/start", {
      fetchImpl: async () => {
        redirectCount += 1;
        return new Response("", { status: 302, headers: { location: "/again" } });
      },
      lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
      sleep: async () => {},
      maxRedirects: 1,
    }), /1-redirect limit/);
    assert.equal(redirectCount, 2);
  });

  it("rejects private destinations in DNS and redirects before requesting them", async () => {
    let requested = 0;
    await assert.rejects(fetchExternalLink("https://example.com/start", {
      fetchImpl: async () => {
        requested += 1;
        return new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
      },
      lookupImpl: async hostname => hostname === "example.com"
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "169.254.169.254", family: 4 }],
      sleep: async () => {},
    }), /non-public address/);
    assert.equal(requested, 1);

    await assert.rejects(fetchExternalLink("http://private.example/", {
      fetchImpl: async () => {
        requested += 1;
        return new Response("ok", { status: 200 });
      },
      lookupImpl: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.8", family: 4 },
      ],
      sleep: async () => {},
    }), /non-public address/);
    assert.equal(requested, 1);
  });

  it("retries temporary network and server failures with a bounded delay", async () => {
    let calls = 0;
    const delays: number[] = [];
    const response = await fetchExternalLink("https://example.com/temporary", {
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new Error("temporary network failure");
        return calls === 2 ? new Response("busy", { status: 503 }) : new Response("ok", { status: 200 });
      },
      lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
      sleep: async delay => { delays.push(delay); },
    });

    assert.equal(response.status, 200);
    assert.equal(calls, 3);
    assert.deepStrictEqual(delays, [250, 500]);
  });

  it("does not retry permanent client errors and rejects unsupported redirect protocols", async () => {
    let calls = 0;
    const response = await fetchExternalLink("https://example.com/missing", {
      fetchImpl: async () => {
        calls += 1;
        return new Response("missing", { status: 404 });
      },
      lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
      sleep: async () => {},
    });
    assert.equal(response.status, 404);
    assert.equal(calls, 1);

    await assert.rejects(fetchExternalLink("https://example.com/start", {
      fetchImpl: async () => new Response("", { status: 302, headers: { location: "file:///etc/passwd" } }),
      lookupImpl: async () => [{ address: "93.184.216.34", family: 4 }],
      sleep: async () => {},
    }), /only HTTP and HTTPS/);
  });
});
