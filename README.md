# Tako Bako

A cosy 16-bit TypeScript presentation layer for Yokaiba's judo-themed zebra puzzles.

## Development

```sh
npm install
npm run dev
```

Run the full quality gate with `npm run check`.

## Deployment

`vercel.json` builds the Vite app and serves `dist`. The same-origin `/api/puzzle`
Vercel function requests an allowlisted Yokaiba scenario, so browser CORS
configuration is not required. Players can choose Tournament Order, Open Division,
or Championship Circuit; the last is a denser 5×5, three-grid expert puzzle.
Shared links retain the requested seed and selected scenario even when Yokaiba uses
a derived replay seed for difficulty selection. Import the repository into Vercel with Git
integration: pushes to `main` deploy production and pull requests deploy previews.

## Puzzle verification

Tako Bako forwards completed boards to Yokaiba for answer checking. Before deploying
this feature, configure the same `PUZZLE_TOKEN_SECRET` on the Yokaiba Worker (using
`wrangler secret put PUZZLE_TOKEN_SECRET`) and redeploy it. The token is issued with
each generated puzzle and is never exposed as a solution; without the secret, the
player keeps working normally but solution checking is unavailable.
