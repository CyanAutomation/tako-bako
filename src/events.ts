const MAX_ELAPSED_MS = 86_400_000;

/** Clamps elapsed playing time to 24 hours; returns undefined when no start time is known. */
export function clampElapsedMs(startedAt: number, now: number = Date.now()): number | undefined {
  return startedAt ? Math.min(MAX_ELAPSED_MS, now - startedAt) : undefined;
}

export interface GameEventPayload {
  schemaVersion: 1;
  event: "puzzle_started" | "puzzle_completed" | "hint_used" | "mistake" | "puzzle_abandoned";
  templateId: string;
  requestedDifficultyLevel: number | undefined;
  assessedDifficultyLevel: number;
  clueCount: number;
  elapsedMs: number | undefined;
  hintsUsed: number;
  mistakes: number;
  smartMarkingEnabled?: boolean;
}

/** Builds a v1 game-event payload matching the contract parsed by server/event-payload.ts. */
export function buildGameEventPayload(fields: GameEventPayload): GameEventPayload {
  return fields;
}

/** Posts a game event to the API; failures are ignored so telemetry never blocks play. */
export function postGameEvent(payload: GameEventPayload): void {
  void fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}