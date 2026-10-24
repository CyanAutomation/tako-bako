# Tako Bako agent skills

These repository skills capture implementation details that are easy to miss when changing one layer of Tako Bako. Each `SKILL.md` is scoped to a recurring kind of work and can be loaded independently.

| Skill | Use it for |
|---|---|
| [Gameplay state and routing](gameplay-state-routing/SKILL.md) | Puzzle modes, shared URLs, scenarios, Challenge progress, daily puzzles, or saved state. |
| [API and provider boundaries](api-provider-boundaries/SKILL.md) | Vercel handlers, Yokaiba or Jev integration, request validation, caching, privacy, or API metrics. |
| [Accessible gameplay UI](accessible-gameplay-ui/SKILL.md) | Board, clue, dialog, navigation, keyboard, responsive, or accessibility changes. |
| [Test and contract maintenance](test-contract-maintenance/SKILL.md) | Tests, documented behavior contracts, README/operations docs, or the quality gate. |
| [GitHub Actions operations](github-actions-operations/SKILL.md) | CI, workflow validation, scheduled Kaseki jobs, or their helper scripts. |

## Choosing a skill

- A change crossing browser state and API contracts can use both **Gameplay state and routing** and **API and provider boundaries**.
- UI changes should use **Accessible gameplay UI**; use **Test and contract maintenance** as well when behavior or documented contracts change.
- Workflow changes should use **GitHub Actions operations** and preserve the assertions in `tests/kaseki-workflows.test.ts`.
- For repository-wide changes, the project quality gate is `npm run check` (Node.js `^24.0.0`).

