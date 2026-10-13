# Deployment and operations

This guide describes Tako Bako's Vercel deployment, serverless endpoints, external services, and runtime safeguards. For player instructions and local development, start with the [root README](../README.md).

## Deployment

The project is configured as a Vite app in `vercel.json`. Vercel runs `npm run build` and publishes `dist`. The root app and API handlers share one origin, so browser-side CORS configuration is not required. Local `npm run dev` proxies puzzle-generation GET requests to Yokaiba; it does not run the Vercel serverless handlers.

| Route | Method | Purpose |
|---|---|---|
| `/api/puzzle` | GET | Generate a puzzle through Yokaiba. |
| `/api/puzzle` | POST | Verify a completed board with its signed puzzle token. |
| `/api/hint` | POST | Request a bounded solver hint, with optional Jev selection. |
| `/api/clue-strategies` | POST | Label clue reasoning strategies; known constraint kinds use deterministic labels. |
| `/api/events` | POST | Forward validated anonymous puzzle outcomes. |
| `/api/health` | GET | Report readiness of Tako Bako and its Yokaiba dependency. |

`/api/health` returns HTTP 200 when Yokaiba is reachable and HTTP 503 when it is unavailable. It does not require credentials.

## Puzzle verification and cache policy

The Yokaiba Worker must have `PUZZLE_TOKEN_SECRET` configured with `wrangler secret put PUZZLE_TOKEN_SECRET` and be redeployed. Yokaiba issues a signed token with generated puzzles; the solution itself is not sent to the browser. If the secret is absent or verification is unavailable, players can continue marking a board, but answer checking will not work.

The intended maximum puzzle age is five minutes from generation. The API stamps generated responses with `X-Tako-Bako-Generated-At`; that timestamp is retained when an edge serves a stale-while-revalidate response. Browser session storage derives its expiry from the generation time rather than starting a new five-minute window when a response is received.

Missing, malformed, expired, or implausibly future timestamps disable browser caching. A one-minute future tolerance accounts for modest clock skew, and accepted expiry is capped at five minutes from the browser's current time. The shared policy in `src/cache-policy.ts` sets a 300-second fresh lifetime and a 3,600-second stale-while-revalidate lifetime. The API uses `s-maxage=300` and `stale-while-revalidate=3600`; browser storage uses the same five-minute freshness duration. Cache cleanup preserves unrelated session-storage keys.

The API forwards Yokaiba rate-limit headers. One transient upstream 5xx is retried; rate-limit and validation responses are not. Course requests ask for deterministic seed fallback when a requested difficulty is unavailable. Unrecognized upstream validation responses are converted to bounded, non-cacheable gateway errors.

## Optional Jev service

Set all three variables in the Vercel project's **server-side** environment to enable Jev:

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes, for Jev | Authenticates model decision requests. |
| `UPSTASH_REDIS_REST_URL` | Yes, for Jev | Shared decision-rate limiter endpoint. |
| `UPSTASH_REDIS_REST_TOKEN` | Yes, for Jev | Redis REST authentication and HMAC key. |
| `JEV_MODEL` | No | Model ID; defaults to `~typesafe/jev-latest`. Pin an ID for repeatable labels. |

Without complete provider configuration, with an invalid key, or when either provider is unavailable, model requests are skipped and deterministic hint/label fallbacks remain available. Keep these values out of browser code and the repository. Configure a spend limit and usage alert for the OpenRouter key; application quotas are not a provider billing cap.

The shared Redis limiter allows at most 60 model decisions per client per minute and 10,000 per UTC day across the deployment. It stores an HMAC of a validated client address from Vercel's `x-forwarded-for` chain rather than the raw address. If Redis fails, Jev is disabled for that request.

Known Yokaiba constraint kinds receive deterministic clue labels. Jev classifies other clue text only after Yokaiba accepts the signed puzzle token. For hints, Yokaiba supplies a progress-based hint and Jev can select among bounded candidates; deterministic policy limits the first hint to the current strength and later escalation to at most one strength step. Jev never decides correctness or invents a hint. Classification receives aggregate gameplay features; candidate ranking receives clue candidates and marked cells. Neither request receives the signed puzzle token or solution. Invalid or failed model responses fall back to solver-provided deterministic behavior.

## Events, privacy, and metrics

Outcome events use schema version 1 and include event-specific hint/mistake counters. They do not include a player identifier, seed, or answer cells. Elapsed time is omitted until a puzzle starts and then bounded to 0–24 hours. Yokaiba continues to accept legacy version 0 events from older clients.

Puzzle and health API logs use the `tako_bako_api_metric` label. Records include operation, outcome, HTTP status, and finite non-negative duration in milliseconds; generation failures may also include retry count, upstream status, and a recognized upstream error code. The events forwarding handler intentionally does not log gameplay event contents.

## Response headers

`vercel.json` applies these security headers to non-asset routes: Content-Security-Policy, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, and X-Frame-Options. Static `/assets/` files receive `Cache-Control: public, max-age=31536000, immutable`.

## Local troubleshooting

- If puzzle generation fails in Vite, check network access to Yokaiba and inspect the browser's network response for `/api/puzzle`.
- If deployed answer checking fails while generation works, verify `PUZZLE_TOKEN_SECRET` on the Yokaiba Worker and redeploy that Worker.
- If optional Jev labels or selection are absent, confirm all three required provider variables are set in the Vercel server environment. The app continues using deterministic behavior when Jev is unavailable.
- Use the deployed `/api/health` response to distinguish app readiness from Yokaiba availability.
