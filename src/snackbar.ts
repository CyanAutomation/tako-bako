import type { StatusTone } from "./ui-types";

export interface SnackbarMessage {
  id: number;
  message: string;
  tone: StatusTone;
}

export interface SnackbarController {
  readonly current: SnackbarMessage | undefined;
  show(message: string, tone?: StatusTone): void;
  clear(): void;
  pause(reason?: string): void;
  resume(reason?: string): void;
}

/** Owns the lifetime of one polite, transient confirmation at a time. */
export function createSnackbarController({
  duration = 5500,
  onExpire = () => undefined,
}: {
  duration?: number;
  onExpire?: () => void;
} = {}): SnackbarController {
  let current: SnackbarMessage | undefined;
  let nextId = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline = 0;
  let remaining = duration;
  const pauseReasons = new Set<string>();

  function cancelTimer(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function schedule(delay: number): void {
    cancelTimer();
    remaining = Math.max(0, delay);
    deadline = Date.now() + remaining;
    if (pauseReasons.size || !current) return;
    timer = setTimeout(() => {
      timer = undefined;
      current = undefined;
      pauseReasons.clear();
      onExpire();
    }, remaining);
  }

  return {
    get current() { return current; },
    show(message, tone = "neutral") {
      cancelTimer();
      pauseReasons.clear();
      current = { id: ++nextId, message, tone };
      schedule(duration);
    },
    clear() {
      cancelTimer();
      current = undefined;
      pauseReasons.clear();
      remaining = duration;
    },
    pause(reason = "default") {
      if (!current || pauseReasons.has(reason)) return;
      pauseReasons.add(reason);
      if (timer !== undefined) {
        remaining = Math.max(0, deadline - Date.now());
        cancelTimer();
      }
    },
    resume(reason = "default") {
      if (!pauseReasons.delete(reason) || pauseReasons.size || !current) return;
      schedule(remaining);
    },
  };
}
