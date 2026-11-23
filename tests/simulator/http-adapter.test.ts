import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createSimulatorHttpHandler } from "../../simulator/http-adapter.js";
import type { Simulator } from "../../simulator/router.js";

async function withServer<T>(simulator: Simulator, run: (origin: string) => Promise<T>): Promise<T> {
  const server = createServer(createSimulatorHttpHandler(simulator));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    return await run(`http://127.0.0.1:${(address as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
}

test("simulator HTTP adapter forwards the request and response", async () => {
  let observed: { method: string; url: string; header: string | null; body: string } | undefined;
  const simulator: Simulator = {
    async handle(request) {
      observed = {
        method: request.method,
        url: `${new URL(request.url).pathname}${new URL(request.url).search}`,
        header: request.headers.get("x-test"),
        body: await request.text(),
      };
      return new Response("simulated response", { status: 201, headers: { "x-simulator-test": "forwarded" } });
    },
  };

  await withServer(simulator, async origin => {
    const response = await fetch(`${origin}/v1/test?mode=local`, {
      method: "POST",
      headers: { "content-type": "text/plain", "x-test": "present" },
      body: "request body",
    });

    assert.equal(response.status, 201);
    assert.equal(response.headers.get("x-simulator-test"), "forwarded");
    assert.equal(await response.text(), "simulated response");
  });

  assert.deepEqual(observed, {
    method: "POST",
    url: "/v1/test?mode=local",
    header: "present",
    body: "request body",
  });
});

test("simulator HTTP adapter rejects oversized bodies before invoking the simulator", async () => {
  let called = false;
  const simulator: Simulator = {
    async handle() {
      called = true;
      return new Response("unexpected");
    },
  };

  await withServer(simulator, async origin => {
    const response = await fetch(`${origin}/api/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "x".repeat(2 * 1024 * 1024 + 1),
    });

    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), {
      error: { code: "payload_too_large", message: "Request body is too large" },
    });
  });

  assert.equal(called, false);
});

test("simulator HTTP adapter hides handler exceptions behind a generic response", async () => {
  const simulator: Simulator = {
    async handle() {
      throw new Error("internal simulator detail");
    },
  };

  await withServer(simulator, async origin => {
    const response = await fetch(`${origin}/api/health`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: { code: "simulator_error", message: "The local simulator could not process this request" },
    });
  });
});
