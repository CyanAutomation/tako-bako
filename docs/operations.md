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
| `/api/events` | POST | Forward validated anonymous puzzle outcomes to Yokaiba. |
| `/api/feedback` | POST | Forward anonymous difficulty feedback for a signed puzzle. |
| `/api/health` | GET | Report readiness of Tako Bako and its Yokaiba dependency. |

`/api/health` returns HTTP 200 when Yokaiba is reachable and HTTP 503 when it is unavailable. It does not require credentials.

## Puzzle verification and cache policy

The Yokaiba Worker must have `PUZZLE_TOKEN_SECRET` configured with `wrangler secret put PUZZLE_TOKEN_SECRET` and be redeployed. Yokaiba issues a signed token with generated puzzles; the solution itself is not sent to the browser. If the secret is absent or verification is unavailable, players can continue marking a board, but answer checking will not work.

The intended maximum puzzle age is five minutes from generation. The API stamps generated responses with `X-Tako-Bako-Generated-At`; that timestamp is retained when an edge serves a stale-while-revalidate response. Browser local storage derives its expiry from the generation time rather than starting a new five-minute window when a response is received. This lets another tab on the same browser reuse a fresh puzzle.

Missing, malformed, expired, or implausibly future timestamps disable browser caching. A one-minute future tolerance accounts for modest clock skew, and accepted expiry is capped at five minutes from the browser's current time. The shared policy in `src/cache-policy.ts` sets a 300-second fresh lifetime and a 3,600-second stale-while-revalidate lifetime. The API uses `s-maxage=300` and `stale-while-revalidate=3600`; browser storage uses the same five-minute freshness duration and is bounded to 20 puzzle entries. Cache cleanup preserves unrelated local-storage keys.

Yokaiba ETags are forwarded to responses, but the app does not add explicit conditional requests or manual 304 handling. Once the five-minute puzzle freshness deadline passes, a caller needs a newly generated response and signed token; reusing an expired cache body after a 304 would conflict with that policy. Keep the existing CDN behavior and only revisit app-managed conditional requests if the token protocol guarantees safe reuse.

Vercel's CDN request metrics measure cache hits and misses without adding application telemetry requests. To review production cache behavior, use the Vercel CLI with the team's project scope:

```sh
vercel metrics schema vercel.request.count
vercel metrics vercel.request.count -S <team> -p <project> --prod --group-by cache_result --since 24h
vercel metrics vercel.request.count -S <team> -p <project> --prod --group-by request_path --since 24h
```

Use the metric schema to find the available edge-region dimension, then group by it to compare cache results across regions. Treat `HIT` and `STALE` as cache-served requests; calculate the hit rate over cacheable requests, excluding `BYPASS` and requests without a cache result. The `/api/puzzle` request path shows puzzle generation reuse. The existing `tako_bako_api_metric` generation logs count function executions that reached Yokaiba, since CDN hits do not invoke the function. These metrics require Vercel Observability access.

The root HTML uses `max-age=0, must-revalidate`. Files in `/assets/` are content-hashed and cached immutably for a year. Stable public files under `/brand/` use a one-day browser lifetime with a seven-day stale-while-revalidate window; rename a file when replacing its contents so clients can refresh it promptly.

The API forwards Yokaiba rate-limit headers. One transient upstream 5xx is retried; rate-limit and validation responses are not. Course requests ask for deterministic seed fallback when a requested difficulty is unavailable. Unrecognized upstream validation responses are converted to bounded, non-cacheable gateway errors.

## Anonymous puzzle difficulty feedback

The completion modal asks **How difficult did you find this puzzle?** with Too easy, Just right, and Too hard choices. A Too hard rating can include one fixed, optional reason. During gameplay, players can open **More → Give feedback** to submit the same rating with an `in_progress` outcome. Feedback is optional, does not block progression, and does not add free-text fields.

The browser sends only the signed `puzzleToken`, rating, optional reason, self-reported outcome, bounded hints/mistakes/time measurements, smart-marking state, and a UUID idempotency key to `/api/feedback`. Yokaiba verifies the signed token and derives the stable puzzle fingerprint, template, seeds, assessed/requested difficulty, generator and model versions, and generation strategy. Completion state and gameplay measurements are self-reported; a token does not prove that a puzzle was solved.

Yokaiba persists accepted records in the dedicated `puzzle_feedback` Cloudflare D1 table. The feature does not depend on Analytics Engine or Jev. The API never stores the raw puzzle token, solution, answer grid, IP address, name, email, or free-text comments. A fingerprint-scoped browser marker suppresses repeat prompts on that browser, while a unique idempotency key makes retries safe. Yokaiba applies a separate 10 requests/minute feedback limit per client IP and stores no IP address. See [Yokaiba's migration, provisioning, retention, and read-only analysis queries](https://github.com/CyanAutomation/yokaiba/blob/main/docs/operations-and-deployment.md#anonymous-puzzle-difficulty-feedback).

### Local feedback flow

For an end-to-end local run, use a local Yokaiba Worker and Vercel's local serverless runtime. Apply the Yokaiba migration locally and set the same local-only token secret for that Worker:

```sh
# In the Yokaiba checkout
npx wrangler d1 migrations apply yokaiba-puzzle-feedback --local
# Put PUZZLE_TOKEN_SECRET=local-feedback-secret in Yokaiba's ignored .dev.vars file
npm run dev

# In the Tako Bako checkout, point Vercel handlers at that local Worker
YOKAIBA_API_ORIGIN=http://127.0.0.1:8787 npx vercel dev
```

Open the Vercel dev URL, play a puzzle, and submit feedback. `YOKAIBA_API_ORIGIN` is server-only and must be an origin without a path or credentials. It prevents local feedback testing from writing to the production Yokaiba service. Plain `npm run dev` starts Vite and does not run Vercel handlers, so it cannot exercise `/api/feedback`.

The production D1 resource ID is account-specific. Create it with `npx wrangler d1 create yokaiba-puzzle-feedback`, replace the explicit placeholder in Yokaiba's `wrangler.toml`, and apply migrations with `npx wrangler d1 migrations apply yokaiba-puzzle-feedback --remote`. Do not deploy Yokaiba until the D1 binding is configured.

## Optional Jev service

Set `OPENROUTER_API_KEY` in the Vercel project's **server-side** environment to enable Jev:

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes, for Jev | Authenticates model decision requests. |
| `JEV_MODEL` | No | Model ID; defaults to `~typesafe/jev-latest`. Pin an ID for repeatable labels. |

Without an OpenRouter key, with an invalid key, or when OpenRouter is unavailable, model requests are skipped and deterministic hint/label fallbacks remain available. Keep these values out of browser code and the repository. Configure a spend limit and usage alert for the OpenRouter key; the application does not impose per-client or daily model-call quotas.

Event ingestion uses Yokaiba’s rate limiting: `/api/events` limits its parsed request body to 4 KB and forwards only allowlisted event fields, while Yokaiba's Worker applies its existing REST rate limit to `/v1/events`. The proxy passes Yokaiba's 429 response and rate-limit headers back to the caller.

Known Yokaiba constraint kinds receive deterministic clue labels. Jev classifies other clue text only after Yokaiba accepts the signed puzzle token. For hints, Yokaiba supplies a progress-based hint and Jev can select among bounded candidates; deterministic policy limits the first hint to the current strength and later escalation to at most one strength step. Jev never decides correctness or invents a hint. Classification receives aggregate gameplay features; candidate ranking receives clue candidates and marked cells. Neither request receives the signed puzzle token or solution. Invalid or failed model responses fall back to solver-provided deterministic behavior.

## Events, privacy, and metrics

Outcome events use schema version 1 and include event-specific hint/mistake counters. They do not include a player identifier, seed, or answer cells. Elapsed time is omitted until a puzzle starts and then bounded to 0–24 hours. Yokaiba continues to accept legacy version 0 events from older clients. `/api/events` applies a 4 KB body limit, validates and allowlists event input, and forwards the event to Yokaiba; the Worker bounds its JSON request body and rate-limits `/v1/events` under its existing REST policy.

Difficulty feedback is stored separately from event telemetry. Its D1 record contains puzzle identity/generation metadata, rating and optional fixed reason, completion state, bounded gameplay measurements, smart-marking state, and submission time. Yokaiba retains records for up to 12 months using the documented operator-run deletion query; exports should use the read-only SQL examples in Yokaiba's operations guide.

Puzzle and health API logs use the `tako_bako_api_metric` label. Records include operation, outcome, HTTP status, and finite non-negative duration in milliseconds; generation failures may also include retry count, upstream status, and a recognized upstream error code. The events forwarding handler intentionally does not log gameplay event contents.

The feedback handler logs only its operation, coarse outcome, status, and duration. It does not log tokens, seeds, ratings, reasons, gameplay measurements, or idempotency keys.

## Response headers

`vercel.json` applies these security headers to non-asset routes: Content-Security-Policy, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, and X-Frame-Options. Static `/assets/` files receive `Cache-Control: public, max-age=31536000, immutable`.

After each production deployment, inspect the actual response headers on the site and an API route. For example, run `curl -sS -D - -o /dev/null https://<production-host>/` and `curl -sS -D - -o /dev/null https://<production-host>/api/health`; confirm the security headers above are present and the API response is not cacheable. Configure an OpenRouter spend limit and usage alert for the server-side key, then confirm both in the provider dashboard after changing Jev settings.

## Local troubleshooting

- If puzzle generation fails in Vite, check network access to Yokaiba and inspect the browser's network response for `/api/puzzle`.
- If deployed answer checking fails while generation works, verify `PUZZLE_TOKEN_SECRET` on the Yokaiba Worker and redeploy that Worker.
- If optional Jev labels or selection are absent, confirm `OPENROUTER_API_KEY` is set in the Vercel server environment. The app continues using deterministic behavior when Jev is unavailable.
- Use the deployed `/api/health` response to distinguish app readiness from Yokaiba availability.
