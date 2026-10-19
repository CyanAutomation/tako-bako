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
| `/api/feedback` | POST | Forward anonymous difficulty feedback for a signed puzzle. |
| `/api/health` | GET | Report readiness of Tako Bako and its Yokaiba dependency. |

`/api/health` returns HTTP 200 when Yokaiba is reachable and HTTP 503 when it is unavailable. It does not require credentials.

## Puzzle verification and cache policy

The Yokaiba Worker must have `PUZZLE_TOKEN_SECRET` configured with `wrangler secret put PUZZLE_TOKEN_SECRET` and be redeployed. Yokaiba issues a signed token with generated puzzles; the solution itself is not sent to the browser. If the secret is absent or verification is unavailable, players can continue marking a board, but answer checking will not work.

The intended maximum puzzle age is five minutes from generation. The API stamps generated responses with `X-Tako-Bako-Generated-At`; that timestamp is retained when an edge serves a stale-while-revalidate response. Browser session storage derives its expiry from the generation time rather than starting a new five-minute window when a response is received.

Missing, malformed, expired, or implausibly future timestamps disable browser caching. A one-minute future tolerance accounts for modest clock skew, and accepted expiry is capped at five minutes from the browser's current time. The shared policy in `src/cache-policy.ts` sets a 300-second fresh lifetime and a 3,600-second stale-while-revalidate lifetime. The API uses `s-maxage=300` and `stale-while-revalidate=3600`; browser storage uses the same five-minute freshness duration. Cache cleanup preserves unrelated session-storage keys.

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

Difficulty feedback is stored separately from event telemetry. Its D1 record contains puzzle identity/generation metadata, rating and optional fixed reason, completion state, bounded gameplay measurements, smart-marking state, and submission time. Yokaiba retains records for up to 12 months using the documented operator-run deletion query; exports should use the read-only SQL examples in Yokaiba's operations guide.

Puzzle and health API logs use the `tako_bako_api_metric` label. Records include operation, outcome, HTTP status, and finite non-negative duration in milliseconds; generation failures may also include retry count, upstream status, and a recognized upstream error code. The events forwarding handler intentionally does not log gameplay event contents.

The feedback handler logs only its operation, coarse outcome, status, and duration. It does not log tokens, seeds, ratings, reasons, gameplay measurements, or idempotency keys.

## Response headers

`vercel.json` applies these security headers to non-asset routes: Content-Security-Policy, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, and X-Frame-Options. Static `/assets/` files receive `Cache-Control: public, max-age=31536000, immutable`.

## Local troubleshooting

- If puzzle generation fails in Vite, check network access to Yokaiba and inspect the browser's network response for `/api/puzzle`.
- If deployed answer checking fails while generation works, verify `PUZZLE_TOKEN_SECRET` on the Yokaiba Worker and redeploy that Worker.
- If optional Jev labels or selection are absent, confirm all three required provider variables are set in the Vercel server environment. The app continues using deterministic behavior when Jev is unavailable.
- Use the deployed `/api/health` response to distinguish app readiness from Yokaiba availability.
