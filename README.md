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
Vercel function requests a `tournament-order-v1` puzzle from Yokaiba, so browser
CORS configuration is not required. Import the repository into Vercel with Git
integration: pushes to `main` deploy production and pull requests deploy previews.
