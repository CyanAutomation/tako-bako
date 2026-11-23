import { spawn, type ChildProcess } from "node:child_process";
import process from "node:process";
import { waitForSimulator } from "./simulator-readiness.js";
import { childExitMessage, portFromEnvironment, signalRunningChildren } from "./dev-simulator-lifecycle.js";

const simulatorPort = portFromEnvironment(process.env.TAKO_BAKO_SIMULATOR_PORT, "TAKO_BAKO_SIMULATOR_PORT", 4174);
const appPort = portFromEnvironment(process.env.TAKO_BAKO_SIMULATOR_APP_PORT, "TAKO_BAKO_SIMULATOR_APP_PORT", 5173);
const children: ChildProcess[] = [];
let stopping = false;

function stopChildren(exitCode: number): void {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  signalRunningChildren(children, "SIGTERM");
  const forceStop = setTimeout(() => {
    signalRunningChildren(children, "SIGKILL");
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
  child.once("exit", handleChildExit);
  return child;
}

function handleChildExit(code: number | null, signal: NodeJS.Signals | null): void {
  if (stopping) return;
  console.error(childExitMessage(code, signal));
  stopChildren(code ?? 1);
}

process.once("SIGINT", () => stopChildren(0));
process.once("SIGTERM", () => stopChildren(0));

try {
  const environment = { ...process.env, TAKO_BAKO_SIMULATOR_PORT: String(simulatorPort) };
  console.log(`[tako-bako simulator] starting app at http://127.0.0.1:${appPort} with local API at http://127.0.0.1:${simulatorPort}`);
  const simulator = startChild(process.execPath, ["--import", "tsx", "simulator/server.ts"], environment);
  await waitForSimulator(simulator, simulatorPort);
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
