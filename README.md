# Tako Bako

A logic grid puzzle game built around zebra/Einstein puzzles, rendered in a cozy 16-bit aesthetic. Solve deduction puzzles by placing clues on a grid and eliminating impossibilities until only one solution remains.

## Development

```sh
npm install
npm run dev
```

Run the full quality gate with `npm run check`, which executes linting, tests, and builds for both the app and API layers.

## How to Play

Tako Bako presents logic grid puzzles with several categories of clues. For example, "The cat owner lives next door to the fish keeper" or "The Swiss plays tennis." Players deduce the correct assignments using these tools:

1. **Mark** -- Click a cell to place your current guess about what belongs there (e.g., a person assigned to a house number).
2. **Eliminate** -- Right-click a cell to mark it as impossible, narrowing down options without committing to an answer.
3. **Check** -- Once satisfied with your grid, submit it to Yokaiba for verification against the official solution.
4. **Share** -- Export your puzzle link, encoding the seed and selected scenario so others can replay or compare.

Three scenarios are available: Tournament Order (a compact 4x4 warm-up), Open Division (a broader 5x5 challenge), and Championship Circuit (an expert 5x5 puzzle with three grids).

## Deployment

`vercel.json` builds the Vite app and serves `dist`. The same-origin `/api/puzzle`
Vercel function requests an allowlisted Yokaiba scenario, so browser CORS
configuration is not required. Shared links retain the requested seed and selected scenario even when Yokaiba uses
a derived replay seed for difficulty selection. Import the repository into Vercel with Git
integration: pushes to `main` deploy production and pull requests deploy previews.

## Configuration

### Puzzle verification

Tako Bako forwards completed boards to Yokaiba for answer checking. Before deploying
this feature, configure the same `PUZZLE_TOKEN_SECRET` on the Yokaiba Worker (using
`wrangler secret put PUZZLE_TOKEN_SECRET`) and redeploy it. The token is issued with
each generated puzzle and is never exposed as a solution; without the secret, the
player keeps working normally but solution checking is unavailable.
