[![CI](https://github.com/CyanAutomation/tako-bako/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/CyanAutomation/tako-bako/actions/workflows/ci.yml)

# Tako Bako

A logic grid puzzle game built around zebra/Einstein puzzles, rendered in a cozy 16-bit aesthetic. Solve deduction puzzles by placing clues on a grid and eliminating impossibilities until only one solution remains.

## Getting Started

Prerequisites: Node.js ^20.19.0 || >=22.12.0 (matching Vite's supported runtime).

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

5. **Share** -- Copy the current page URL to the clipboard. The link always encodes the seed and mode: challenge links add tier and level, while shared links add template and difficulty (mutually exclusive), so others can open the same puzzle or jump directly into a Puzzle Challenge course.

Four current scenarios are available: Tournament Order (a compact 4×4 warm-up designed for step-by-step deduction), Open Division (a broader 5×5 challenge), Championship Bridge (a five-row bridge into the expert three-grid board), and Championship Circuit (an expert 5×5 puzzle with three grids). Tournament Order v1 remains available for legacy shared links.

You can filter clues as All, To review, or Used, and mark individual clues as used or unused to track your reasoning.

### Puzzle Challenge

Tako Bako includes a guided progression called Puzzle Challenge. The course has four levels in each tier and maps directly to Yokaiba's 12-level scale: Beginner uses Tournament Order levels 1-4; Intermediate uses Open Division 5-7 then Championship Bridge 8; Advanced uses Championship Bridge 9 then Championship Circuit 10-12. Complete each level sequentially to unlock the next. A Hint button starts with a clue, then offers an elimination or one revealed placement as progress increases. Your daily puzzle locks to your current level and advances automatically upon a correct deduction. You can also play shared puzzles from links, replay the current tier, or start the daily puzzle fresh. Reset your Challenge progress at any time without affecting saved boards or shared puzzle links.

## Development

Run the full quality gate with `npm run check` -- this executes linting, tests, and builds for both the app and API layer.

Use individual commands during active development:

- Lint source code: `npm run lint`
- Run tests: `npm run test`
- Build for production: `npm run build`
- Preview the production build locally: `npm run preview`

Build output goes to the `dist` directory. The TypeScript compiler runs separately for the app (`tsconfig.app.json`) and API layer (`tsconfig.api.json`).

Vite proxies `/api/puzzle` requests to Yokaiba during development, routing queries to `/v1/puzzles/generate` with translated query parameters.

## Deployment

`vercel.json` declares this as a Vite project with `buildCommand: npm run build` and `outputDirectory: dist`. Vercel serverless functions live in `api/`: `/api/puzzle` handles GET requests for puzzle generation and POST requests for verification; `/api/hint` and `/api/events` proxy bounded assistance and anonymous calibration outcomes; `/api/health` reports app and upstream puzzle-service readiness. Course requests opt into Yokaiba's deterministic seed fallback when a requested level is unavailable, so a player is not stranded at a 422 response. Browser-side CORS configuration is not required because the API layer shares the same origin.

The app root serves strict Content-Security-Policy, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, and X-Frame-Options headers for all non-asset routes (`/(.*)`). Static assets at `/assets/(.*)` receive immutable caching for one year with `Cache-Control: public, max-age=31536000, immutable`.

## Configuration

### Puzzle verification

Tako Bako forwards completed boards to Yokaiba via the `/api/puzzle` endpoint. Before deploying this feature, configure the same `PUZZLE_TOKEN_SECRET` on the Yokaiba Worker (using `wrangler secret put PUZZLE_TOKEN_SECRET`) and redeploy it. The token is issued with each generated puzzle and is never exposed as a solution; without the secret, the player keeps working normally but solution checking is unavailable.

The intended maximum end-to-end puzzle age is five minutes from generation. The API stamps each newly generated response with `X-Tako-Bako-Generated-At`; that stamp survives edge caching, and the browser derives its session-cache expiry from it rather than starting a new five-minute window. Consequently an edge response served during the CDN's `stale-while-revalidate=3600` period is usable for the current request but is not saved in session storage once it is five minutes old. Missing, malformed, expired, or implausibly future generation stamps disable browser caching, and every accepted expiry is capped to five minutes from the browser's current time. A one-minute future tolerance accommodates modest server/client clock skew.

The shared policy in `src/cache-policy.ts` sets a 300-second fresh lifetime and a 3,600-second stale-while-revalidate lifetime. The API uses those values for `s-maxage=300` and `stale-while-revalidate=3600`, while the browser derives its five-minute session-cache deadline from the same fresh lifetime. Upstream rate-limit headers are forwarded to the client. A single transient upstream 5xx is retried before the API returns a user-friendly 502/504 failure, while rate-limit and validation responses are never retried. Course requests opt into deterministic fallback before the API surfaces a remaining `difficulty_unavailable` response. Outcome events never include a player identifier, seed, or answer cells.

### Optional Jev clue labels and hint selection

Set `OPENROUTER_API_KEY` in the Vercel project's server-side environment variables to enable Jev. `JEV_MODEL` is optional and defaults to `~typesafe/jev-latest`; set it to a pinned model ID when repeatable labels matter. Keep both values out of browser code and the repository.

Known Yokaiba clue constraint kinds receive deterministic strategy labels. Jev classifies unrecognized clue text and, when the player requests a hint, can choose among unused puzzle clues and the hint returned by Yokaiba for the current progress stage. The OpenRouter request contains clue text and the player's marked cells, but never the signed puzzle token or solution. Jev's result is accepted only when it selects one of those supplied candidates; a missing key, provider error, malformed answer, or low-confidence clue label leaves the existing fallback in place. Clue labels require a signed puzzle token so the API can validate the puzzle with Yokaiba before making a model request.

## Project Structure

```
src/       Application source
  main.ts    Entry point: app shell, event handling, rendering, state management
  puzzle.ts  Core puzzle model: Board, Mark, Puzzle types, parsePuzzle, markBoard,
             answerFromBoard, boardSolveProgress, save/load helpers
  puzzle-cache.ts  Freshness-aware session cache enforcing a 5-minute end-to-end puzzle age
  curriculum.ts   Tier/course definitions, level mapping, course resolution
  progress.ts     Puzzle Challenge progress storage (localStorage v1)
  scenarios.ts    Scenario catalog and ID resolution
  shared-puzzle.ts Parses shared URLs and short codes for paste-to-open flow
  daily.ts        Daily puzzle seed generation from UTC date parts
  sections.ts     Curricular rendering: curriculum cards, puzzle header, board toolbar,
                  grid workspace tabs, clue panel with filtering
  clue-strategy.ts Reasoning strategy labels and validated Jev classification results
  ui.ts           Reusable HTML rendering primitives: buttons, badges, dialogs, panels, tabs
  style.css       Base stylesheet
  expert-grid.css Expert-grid layout overrides
  brand/          Brand assets (PNG sprites)
api/         Vercel API functions
  puzzle.ts   GET /puzzle (generate) and POST /puzzle (verify) handler
  hint.ts     POST /hint assistance proxy
  clue-strategies.ts POST /clue-strategies Jev-assisted clue classification
  jev.ts      Server-side OpenRouter Decisions API client
  events.ts   POST /events anonymous calibration proxy
  health.ts   GET /health readiness check
index.html      App entry HTML
vite.config.ts  Dev proxy: /api/puzzle → /v1/puzzles/generate
vercel.json     Vercel deployment config, security headers, output dir
```
