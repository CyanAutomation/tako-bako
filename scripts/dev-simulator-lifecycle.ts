import type { ChildProcess } from "node:child_process";

export function portFromEnvironment(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const candidate = Number(value);
  if (Number.isInteger(candidate) && candidate >= 1 && candidate <= 65_535) return candidate;
  throw new Error(`${name} must be a valid TCP port`);
}

export function signalRunningChildren(children: readonly Pick<ChildProcess, "exitCode" | "signalCode" | "kill">[], signal: NodeJS.Signals): void {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
}

export function childExitMessage(code: number | null, signal: NodeJS.Signals | null): string {
  return `[tako-bako simulator] child process stopped${signal ? ` (${signal})` : ` with exit code ${code ?? 1}`}`;
}
