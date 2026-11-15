# Tako Bako agent skills

These repository skills capture implementation details that are easy to miss when changing one layer of Tako Bako. Each `SKILL.md` is scoped to a recurring kind of work and can be loaded independently.

| Skill | Use it for |
|---|---|
| [Gameplay state and routing](gameplay-state-routing/SKILL.md) | Puzzle modes, shared URLs, scenarios, Challenge progress, daily puzzles, or saved state. |
| [API and provider boundaries](api-provider-boundaries/SKILL.md) | Vercel handlers, Yokaiba or Jev integration, request validation, caching, privacy, or API metrics. |
| [Hint and clue strategy pipeline](hint-clue-strategy/SKILL.md) | Hint request context, solver strategies, deterministic fallbacks, or optional Jev ranking and labeling. |
| [Accessible gameplay UI](accessible-gameplay-ui/SKILL.md) | Board, clue, dialog, navigation, keyboard, responsive, or accessibility changes. |
| [Test and contract maintenance](test-contract-maintenance/SKILL.md) | Tests, documented behavior contracts, README/operations docs, or the quality gate. |
| [GitHub Actions operations](github-actions-operations/SKILL.md) | CI, workflow validation, scheduled Kaseki jobs, or their helper scripts. |
| [Deployment and runtime operations](deployment-runtime-operations/SKILL.md) | Vercel build/runtime configuration, production headers, environment setup, or deployment verification. |

## Choosing a skill

- For hint or clue behavior, use **Hint and clue strategy pipeline**; also use **API and provider boundaries** when changing request validation, routes, privacy, or provider calls, and **Accessible gameplay UI** when changing its presentation.
- For a change crossing browser state and API contracts, use both **Gameplay state and routing** and **API and provider boundaries**.
- UI changes use **Accessible gameplay UI**. Add **Test and contract maintenance** when observable behavior, tests, or documented contracts change.
- Workflow files and helpers use **GitHub Actions operations**. Vercel settings, production headers, and post-deployment checks use **Deployment and runtime operations**.
- `npm test` runs the Node test suite; `npm run test:e2e` builds the app and runs Playwright browser tests; `npm run check` runs lint, Node tests, documentation checks, and the production build. CI also runs Chromium smoke coverage. The project targets Node.js `^26.0.0`.

