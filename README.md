[![CI](https://github.com/CyanAutomation/tako-bako/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CyanAutomation/tako-bako/actions/workflows/ci.yml)

# Tako Bako

A logic grid puzzle game built around zebra/Einstein puzzles, rendered in a cozy 16-bit aesthetic. Solve deduction puzzles by placing clues on a grid and eliminating impossibilities until only one solution remains.

## Getting Started

Prerequisites: Node.js ^24.0.0 || ^22.12.0 (matching package.json engines).

1. Install dependencies:

   ```sh
   npm install
   ```

2. Start the development server:

   ```sh
   npm run dev
   ```

3. Open the app: navigate to `http://localhost:5173` in your browser.

4. Run tests:

   ```sh
   npm run test
   ```

## How to Play

Tako Bako presents logic grid puzzles with several categories of clues. For example, "The cat owner lives next door to the fish keeper" or "The Swiss plays tennis." Players deduce correct assignments using these tools:

1. **Mark / Eliminate** -- Click a cell to cycle through states: empty, yes (a ✓), then no (an ×). Place a guess or rule one out with the same action, without committing to an answer. A readiness meter shows how many affirmative matches (✓) you have placed versus the total required. Submit when progress reaches full completion.

2. **Undo** -- Revert the last mark. The undo stack is cleared whenever a new puzzle is fetched or you return to the landing page, so marks never carry over between puzzles.

3. **Smart marking (Efficiency)** -- Toggle smart marking on from the board toolbar. It is an advanced-player speed tool: placing a ✓ automatically rules out the other squares in the same row and column. Turn it off when you want full control of every mark.

4. **Check** -- Once your board meets the readiness requirement, submit it via the Check button. Tako Bako sends a puzzle token and your completed board to the API layer, which verifies the answer against Yokaiba. Correct deductions advance your Puzzle Challenge course.

5. **Share** -- Copy the current page URL to the clipboard. The link always encodes the seed and mode: challenge links add tier and level, while shared links add template and difficulty (mutually exclusive), so others can open the same puzzle or jump directly into a Puzzle Challenge course. Opening a puzzle URL loads that route without adding a duplicate browser-history entry. Pasted seed codes contain 1–128 ASCII letters, digits, or hyphens; shared puzzle difficulty ranges from 1 to 12.

Four current scenarios are available: Tournament Order (a compact 4×4 warm-up designed for step-by-step deduction), Open Division (a broader 5×5 challenge), Championship Bridge (a five-row bridge into the expert three-grid board), and Championship Circuit (an expert 5×5 puzzle with three grids). Tournament Order v1 remains available for legacy shared links.

You can filter clues as All, To review, or Used, and mark individual clues as used or unused to track your reasoning. Used-clue status is saved per puzzle, separately from board marks. Keyboard users can move through grid cells with arrow keys; the grid selector exposes one active tab, and clue filters announce their selected state. Dialogs expose their title and description to assistive technology.

### Puzzle Challenge

Tako Bako includes a guided progression called Puzzle Challenge. The course has four levels in each tier and maps directly to Yokaiba's 12-level scale: Beginner uses Tournament Order levels 1-4; Intermediate uses Open Division 5-7 then Championship Bridge 8; Advanced uses Championship Bridge 9 then Championship Circuit 10-12. Complete each level sequentially to unlock the next. A Hint button starts with a clue, then offers an elimination or one revealed placement as progress increases. Daily puzzles change at midnight UTC for every player. Your daily puzzle locks to your current level and advances automatically upon a correct deduction. You can also play shared puzzles from links, replay the current tier, or start the daily puzzle fresh. Reset your Challenge progress at any time without affecting saved boards or shared puzzle links.

## Development

Run the full quality gate with `npm run check` -- this executes linting, tests, and builds for both the app and API layer.

Selected test contracts and their links to product behavior are listed in [docs/test-traceability.md](docs/test-traceability.md). The follow-up scores and verification evidence are in [docs/test-quality-review.md](docs/test-quality-review.md).

Use individual commands during active development:

- Lint source code: `npm run lint`
- Run tests: `npm run test`
- Build for production: `npm run build`
- Preview the production build locally: `npm run preview`

Build output goes to the `dist` directory. The TypeScript compiler runs separately for the app (`tsconfig.app.json`) and API layer (`tsconfig.api.json`).

Vite proxies `/api/puzzle` requests to Yokaiba during development, routing queries to `/v1/puzzles/generate` with translated query parameters.

## Deployment

`vercel.json` declares this as a Vite project with `buildCommand: npm run build` and `outputDirectory: dist`. The five Vercel serverless function handlers live in `api/`: `/api/puzzle` handles GET requests for puzzle generation and POST requests for verification; `/api/hint` provides bounded assistance; `/api/clue-strategies` classifies clues; `/api/events` forwards anonymous calibration outcomes; and `/api/health` reports app and upstream puzzle-service readiness. Supporting server modules live in `server/`, and API tests live in `tests/api/`. Course requests opt into Yokaiba's deterministic seed fallback when a requested level is unavailable, so a player is not stranded at a 422 response. Unrecognized upstream validation responses become bounded, non-cacheable gateway errors. Browser-side CORS configuration is not required because the API layer shares the same origin.

### API metrics

Puzzle and health API metrics use the `tako_bako_api_metric` log label. Each record includes the operation, outcome, HTTP status, and a finite non-negative duration in milliseconds. Operation-specific records may include retry and upstream-status details.

The app root serves strict Content-Security-Policy, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, and X-Frame-Options headers for all non-asset routes (`/(.*)`). Static assets at `/assets/(.*)` receive immutable caching for one year with `Cache-Control: public, max-age=31536000, immutable`.

## Configuration

### Puzzle verification

Tako Bako forwards completed boards to Yokaiba via the `/api/puzzle` endpoint. Before deploying this feature, configure the same `PUZZLE_TOKEN_SECRET` on the Yokaiba Worker (using `wrangler secret put PUZZLE_TOKEN_SECRET`) and redeploy it. The token is issued with each generated puzzle and is never exposed as a solution; without the secret, the player keeps working normally but solution checking is unavailable.

The intended maximum end-to-end puzzle age is five minutes from generation. The API stamps each newly generated response with `X-Tako-Bako-Generated-At`; that stamp survives edge caching, and the browser derives its session-cache expiry from it rather than starting a new five-minute window. Consequently an edge response served during the CDN's `stale-while-revalidate=3600` period is usable for the current request but is not saved in session storage once it is five minutes old. Missing, malformed, expired, or implausibly future generation stamps disable browser caching, and every accepted expiry is capped to five minutes from the browser's current time. A one-minute future tolerance accommodates modest server/client clock skew.

The shared policy in `src/cache-policy.ts` sets a 300-second fresh lifetime and a 3,600-second stale-while-revalidate lifetime. The API uses those values for `s-maxage=300` and `stale-while-revalidate=3600`, while the browser derives its five-minute session-cache deadline from the same fresh lifetime. Upstream rate-limit headers are forwarded to the client. A single transient upstream 5xx is retried before the API returns a user-friendly 502/504 failure, while rate-limit and validation responses are never retried. Course requests opt into deterministic fallback before the API surfaces a remaining `difficulty_unavailable` response. Outcome events carry schema version 1 and the event-specific hint/mistake counters, and never include a player identifier, seed, or answer cells. Elapsed time is omitted until a puzzle has started, then bounded to 0–24 hours. Yokaiba continues to accept legacy version 0 events from older clients.

Session cache entries expire when their freshness deadline is reached. During bounded cleanup, older puzzle records without a `createdAt` timestamp use their expiry time to determine eviction order; unrelated session-storage keys are preserved.

### Optional Jev clue labels and hint selection

Set `OPENROUTER_API_KEY`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` in the Vercel project's server-side environment variables to enable Jev. The shared Redis limiter allows up to 60 model decisions per client per minute and 10,000 per UTC day across the deployment. It stores an HMAC of the final address in Vercel's `x-forwarded-for` chain rather than the raw address. If Redis or OpenRouter is not configured, rejects its key, or is unavailable, model requests are skipped and the deterministic hint and label fallbacks remain available. `JEV_MODEL` is optional and defaults to `~typesafe/jev-latest`; set it to a pinned model ID when repeatable labels matter. Keep these values out of browser code and the repository.

Set a separate spend limit and usage alert for the OpenRouter key in the provider account. The application quota limits normal request volume; the provider limit caps spend if application configuration changes or the key is misused.

Known Yokaiba clue constraint kinds receive deterministic strategy labels. Cached puzzles retain their parsed clue strategy metadata. Jev classifies unrecognized clue text after Yokaiba accepts the puzzle token. On an explicit hint request, Tako Bako first asks Yokaiba for the progress-based hint, forwarding the completed hint count as Yokaiba's `hintIndex` so the same kind advances deterministically instead of repeating its first result. It then derives compact counts for affirmative and negative marks, readiness, hints, mistakes, elapsed time, used clues, and used clue strategies and asks Jev for one bounded player-state label. Deterministic policy maps that label to a Yokaiba hint kind: a first request stays within the existing progress-based strength, and later escalation can advance by at most one strength step. If the policy selects a different strength, the server asks Yokaiba for that strength at the same hint index before Jev ranks the solver result and unused clue candidates. Stronger candidates outside the policy's limit are removed before ranking.

Jev never decides puzzle correctness and cannot invent a hint. The OpenRouter classification request receives only aggregate gameplay features; the ranking request receives clue candidates and marked cells. Neither request receives the signed puzzle token or solution. Missing provider configuration or an unusable player-state result falls back to the deterministic progress-based strength. A failed or invalid candidate-ranking result falls back to the solver hint or, while a state policy is active, an in-policy supplied candidate. Clue labels still require a signed puzzle token so the API can validate the puzzle with Yokaiba before making a model request.

Puzzle Challenge's 1–12 progression remains deterministic. A future Practice mode could use local, anonymous counts by reasoning strategy to identify current gameplay patterns, while keeping obvious easier/same/harder decisions deterministic and asking Jev only when signals conflict. Such a profile should describe recent play rather than infer fixed ability, and should remain local or aggregated without identity.

## Project Structure

```
src/       Application source
  main.ts                Entry point: app shell, event handling, rendering, state management
  app.ts                 Application mounting: state, event wiring, rendering, persistence
  app-view.ts            View state derivation and app rendering from the current state
  app-routing.ts         Play-mode and puzzle-settings routing from the browser URL
  puzzle.ts              Core puzzle types: Mark, Clue, Category, Puzzle, Board, Answer
  puzzle-board.ts        Board helpers: markBoard, answerFromBoard, boardSolveProgress, squareKey
  puzzle-parser.ts       Parses puzzle payloads into validated Puzzle models
  puzzle-storage.ts      Persists and loads boards and used-clue records
  puzzle-cache.ts        Freshness-aware session cache enforcing a 5-minute end-to-end puzzle age
  puzzle-loader.ts       Loads puzzles through the cache, retrying rate-limited generation
  yokaiba.ts             Yokaiba generation endpoint and shared query-parameter builder
  curriculum.ts          Tier/course definitions, level mapping, course resolution
  progress.ts            Puzzle Challenge progress storage (localStorage v1)
  scenarios.ts           Scenario catalog and ID resolution
  shared-puzzle.ts       Parses shared URLs and short codes for paste-to-open flow
  daily.ts               Daily puzzle seed generation from UTC date parts
  sections.ts            Curricular rendering: curriculum cards, puzzle header, board toolbar,
                         grid workspace tabs, clue panel with filtering
  answer-verification.ts Parses and validates answer-verification responses
  hint-request.ts        Builds hint requests and parses validated hint responses
  clue-strategy.ts       Compatibility barrel for clue-strategy consumers
  clue-strategy-catalog.ts Clue strategy catalog: labels and descriptions
  clue-strategy-constraints.ts Constraint-to-strategy mapping for known clue forms
  clue-strategy-results.ts Parses and filters Jev clue-classification results
  events.ts              Builds anonymous calibration game-event payloads
  player-state.ts        Bounded player-state response parsing and deterministic hint policy
  ui.ts                  Reusable HTML rendering primitives: buttons, badges, dialogs, panels, tabs
  ui-controls.ts         Icon-button, status, and control-group rendering helpers
  ui-grid.ts             Three-state puzzle-grid cell rendering
  ui-tabs.ts             ARIA tablist rendering with roving tab focus
  ui-dialog.ts           Focus-trapping and keyboard handling for dialogs
  ui-types.ts            Shared UI types
  style.css              Base stylesheet
  expert-grid.css        Expert-grid layout overrides
  brand/                 Brand assets (PNG sprites)
api/         Five Vercel API function handlers
  puzzle.ts   GET /puzzle (generate) and POST /puzzle (verify) handler
  hint.ts     POST /hint assistance proxy
  clue-strategies.ts POST /clue-strategies Jev-assisted clue classification
  events.ts   POST /events anonymous calibration proxy
  health.ts   GET /health readiness check
server/      Shared API modules
  jev.ts                OpenRouter Decisions API client for Jev labels and hints
  jev-rate-limit.ts     Rate limiting for Jev requests
  event-payload.ts      Calibration event payload construction
  clue-strategy-input.ts Clue-strategy request input validation
tests/api/   API tests, kept outside Vercel's function discovery directory
index.html      App entry HTML
vite.config.ts  Dev proxy: /api/puzzle → /v1/puzzles/generate
vercel.json     Vercel deployment config, security headers, output dir
```
