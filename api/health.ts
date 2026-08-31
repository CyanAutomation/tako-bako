import type { VercelRequest, VercelResponse } from "@vercel/node";

const YOKAIBA_HEALTH_URL = "https://yokaiba.scheimann.workers.dev/healthz";
const TIMEOUT_MS = 3_000;

/** Readiness check for Tako Bako and its required puzzle service. */
export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    response.status(405).json({ status: "method_not_allowed" });
    return;
  }
  const startedAt = Date.now();
  try {
    const upstream = await fetch(YOKAIBA_HEALTH_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ready = upstream.ok;
    response.setHeader("cache-control", "no-store");
    response.status(ready ? 200 : 503).json({ status: ready ? "ok" : "degraded", dependencies: { yokaiba: ready ? "ok" : "unavailable" } });
    console.info("tako_bako_api_metric", { operation: "health", outcome: ready ? "success" : "dependency_unavailable", status: ready ? 200 : 503, durationMs: Date.now() - startedAt });
  } catch (error) {
    response.setHeader("cache-control", "no-store");
    response.status(503).json({ status: "degraded", dependencies: { yokaiba: "unavailable" } });
    console.error("tako_bako_api_metric", { operation: "health", outcome: "dependency_error", status: 503, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
  }
}
