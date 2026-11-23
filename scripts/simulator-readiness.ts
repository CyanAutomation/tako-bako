import type { ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

type SimulatorChild = Pick<ChildProcess, "exitCode" | "signalCode">;

interface SimulatorReadinessOptions {
  attempts?: number;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<unknown>;
}

export async function waitForSimulator(
  child: SimulatorChild,
  simulatorPort: number,
  {
    attempts = 100,
    requestTimeoutMs = 250,
    pollIntervalMs = 50,
    fetchImpl = globalThis.fetch,
    sleep = delay,
  }: SimulatorReadinessOptions = {},
): Promise<void> {
  const healthUrl = `http://127.0.0.1:${simulatorPort}/healthz`;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error("The local Yokaiba simulator exited before it became ready");
    }
    try {
      const response = await fetchImpl(healthUrl, { signal: AbortSignal.timeout(requestTimeoutMs) });
      if (response.ok && response.headers.get("x-tako-bako-simulator") === "true") return;
    } catch {
      // The child may still be binding its local port.
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`The local Yokaiba simulator did not become ready at ${healthUrl}`);
}
