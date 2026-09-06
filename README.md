# Tako Bako

A logic grid puzzle game built around zebra/Einstein puzzles, rendered in a cozy 16-bit aesthetic. Solve deduction puzzles by placing clues on a grid and eliminating impossibilities until only one solution remains.

## Getting Started

Prerequisites: Node.js 20.19+ or 22.12+ (matching Vite's supported runtime).

1. Install dependencies:

   ```sh
   npm install
   ```

2. Start the development server:

   ```sh
   npm run dev
   ```

3. Open the app: navigate to `http://localhost:5173` in your browser.

## How to Play

Tako Bako presents logic grid puzzles with several categories of clues. For example, "The cat owner lives next door to the fish keeper" or "The Swiss plays tennis." Players deduce correct assignments using these tools:

1. **Mark / Eliminate** -- Click a cell to cycle through states: empty, yes (a ✓), then no (an ×). Place a guess or rule one out with the same action, without committing to an answer. A readiness meter shows how many matches you have found versus total required. You must have at least one ✓ in each row and column before checking your deduction.

2. **Undo** -- Revert the last mark. All previous marks remain available on the undo stack until the page reloads.

3. **Smart marking (Assist)** -- Toggle smart marking on from the board toolbar. When enabled, placing a ✓ automatically rules out the other squares in the same row and column. Turn it off when you want full control of every mark.

4. **Check** -- Once your board meets the readiness requirement, submit it via the Check button. Tako Bako sends a puzzle token and your completed board to the API layer, which verifies the answer against Yokaiba. Correct deductions advance your Puzzle Challenge course.

5. **Share** -- Copy the current page URL to the clipboard. The link encodes the seed, template, and difficulty so others can open the same puzzle.

Three scenarios are available: Tournament Order (a compact 4×4 warm-up), Open Division (a broader 5×5 challenge), and Championship Circuit (an expert 5×5 puzzle with three grids). The active grid tab switches between them when a puzzle has multiple grids.

You can filter clues as All, Unmarked, or Used, and mark individual clues as used or unused to track your reasoning.

### Puzzle Challenge

Tako Bako includes a guided progression called Puzzle Challenge. The course has four levels in each tier and maps directly to Yokaiba's 12-level scale: Beginner uses levels 1-4, Intermediate 5-8, and Advanced 9-12. Complete each level sequentially to unlock the next. Your daily puzzle locks to your current level and advances automatically upon a correct deduction. You can also play shared puzzles from links, replay the current tier, or start the daily puzzle fresh. Reset your Challenge progress at any time without affecting saved boards or shared puzzle links.

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

`vercel.json` declares this as a Vite project with `buildCommand: npm run build` and `outputDirectory: dist`. Shared-origin API functions live in `api/`: `/api/puzzle` handles GET requests for puzzle generation and POST requests for verification. The API forwards requests to Yokaiba at `https://yokaiba.scheimann.workers.dev`, applying caching headers (`s-maxage=300, stale-while-revalidate=3600`) and translating upstream error codes. Browser-side CORS configuration is not required because the API layer shares the same origin. Import the repository into Vercel with Git integration: pushes to `main` deploy production; pull requests deploy previews.

The app root serves strict Content-Security-Policy, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, and X-Frame-Options headers for all non-asset routes. Static assets receive immutable caching for one year.

## Configuration

### Puzzle verification

Tako Bako forwards completed boards to Yokaiba via the `/api/puzzle` endpoint. Before deploying this feature, configure the same `PUZZLE_TOKEN_SECRET` on the Yokaiba Worker (using `wrangler secret put PUZZLE_TOKEN_SECRET`) and redeploy it. The token is issued with each generated puzzle and is never exposed as a solution; without the secret, the player keeps working normally but solution checking is unavailable.

The API caches puzzle responses at the edge with `s-maxage=300` and `stale-while-revalidate=3600`. Upstream rate-limit headers are forwarded to the client. Yokaiba timeouts produce a 504 with a user-friendly message. When a seed cannot produce the requested difficulty, Yokaiba returns HTTP 422 with `difficulty_unavailable` and optionally `availableDifficultyLevels`; the API surfaces both on the client.

## Project Structure

```
src/       Application source
  main.ts    Entry point: app shell, event handling, rendering, state management
  puzzle.ts  Core puzzle model: Board, Mark, Puzzle types, parsePuzzle, markBoard,
             answerFromBoard, boardSolveProgress, save/load helpers
  curriculum.ts   Tier/course definitions, level mapping, course resolution
  progress.ts     Puzzle Challenge progress storage (localStorage v1)
  scenarios.ts    Scenario catalog and ID resolution
  daily.ts        Daily puzzle seed generation from UTC date parts
  sections.ts     Curricular rendering: curriculum cards, puzzle header, board toolbar,
                  grid workspace tabs, clue panel with filtering
  ui.ts           Reusable HTML rendering primitives: buttons, badges, dialogs, panels, tabs
  style.css       Base stylesheet
  expert-grid.css Expert-grid layout overrides
  brand/          Brand assets (PNG sprites)
api/         Vercel API functions
  puzzle.ts   GET /puzzle (generate) and POST /puzzle (verify) handler
  health.ts   GET /healthz readiness check
index.html      App entry HTML
vite.config.ts  Dev proxy: /api/puzzle → /v1/puzzles/generate
vercel.json     Vercel deployment config, security headers, output dir
```
