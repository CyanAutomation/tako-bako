export interface JevMetric {
  operation: string;
  questionCount: number;
  candidateCount: number;
  durationMs: number;
  outcome: string;
}

export function recordJevMetric(metric: JevMetric): void {
  try { console.info("tako_bako_jev_metric", metric); } catch { /* Observability must not affect hint delivery. */ }
}
