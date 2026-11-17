import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

function portFromEnvironment(name: string, fallback: number): number {
  const candidate = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65_535) throw new Error(`${name} must be a valid TCP port`);
  return candidate;
}

const simulatorPort = portFromEnvironment("TAKO_BAKO_SIMULATOR_PORT", 4174);
const appPort = portFromEnvironment("TAKO_BAKO_SIMULATOR_APP_PORT", 5173);
const children: ChildProcess[] = [];
let stopping = false;

function stopChildren(exitCode: number): void {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  const forceStop = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 5_000);
  forceStop.unref();
}

function startChild(command: string, args: string[], environment: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, { cwd: process.cwd(), env: environment, stdio: "inherit" });
  children.push(child);
  child.once("error", error => {
    console.error("[tako-bako simulator] child process failed", error);
    stopChildren(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(`[tako-bako simulator] child process stopped${signal ? ` (${signal})` : ` with exit code ${code ?? 1}`}`);
      stopChildren(code ?? 1);
    }
  });
  return child;
}

async function waitForSimulator(child: ChildProcess): Promise<void> {
  const healthUrl = `http://127.0.0.1:${simulatorPort}/healthz`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("The local Yokaiba simulator exited before it became ready");
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(250) });
      if (response.ok && response.headers.get("x-tako-bako-simulator") === "true") return;
    } catch {
      // The child may still be binding its local port.
    }
    await delay(50);
  }
  throw new Error(`The local Yokaiba simulator did not become ready at ${healthUrl}`);
}

process.once("SIGINT", () => stopChildren(0));
process.once("SIGTERM", () => stopChildren(0));

try {
  const environment = { ...process.env, TAKO_BAKO_SIMULATOR_PORT: String(simulatorPort) };
  console.log(`[tako-bako simulator] starting app at http://127.0.0.1:${appPort} with local API at http://127.0.0.1:${simulatorPort}`);
  const simulator = startChild(process.execPath, ["--import", "tsx", "simulator/server.ts"], environment);
  await waitForSimulator(simulator);
  if (stopping) throw new Error("Simulator startup was interrupted");
  startChild(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host", "127.0.0.1",
    "--port", String(appPort),
    "--strictPort",
    "--mode", "simulator",
  ], environment);
} catch (error) {
  console.error("[tako-bako simulator] startup failed", error instanceof Error ? error.message : String(error));
  stopChildren(1);
}
