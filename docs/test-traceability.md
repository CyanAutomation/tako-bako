# Test contract traceability

These repository-local IDs connect selected tests to a stable behavior contract. Product contracts link to the corresponding README section. The Kaseki IDs document operational workflow requirements because those are CI behaviors rather than player-facing requirements. These IDs are local references; they do not represent external issue numbers.

| ID | Contract | Source | Tests |
|---|---|---|---|
| `TB-URL-01` | Puzzle generation forwards the selected template and seed. A selected difficulty requests Yokaiba's deterministic seed fallback. Query parameter order is irrelevant. | [README: Share](../README.md#how-to-play); [README: puzzle verification](../README.md#puzzle-verification) | [Generation parameter tests](../src/yokaiba.test.ts); [proxy forwarding tests](../tests/api/puzzle.test.ts) |
| `TB-URL-02` | The development proxy sends puzzle requests to the Yokaiba generation endpoint with the selected template, seed, and difficulty. | [README: Development](../README.md#development) | [Vite proxy test](../src/yokaiba.test.ts) |
| `TB-INPUT-01` | Shared seed codes contain 1–128 ASCII letters, digits, or hyphens. Difficulty values range from 1 to 12. Player links discard unsupported difficulty values; API requests reject them before forwarding. | [README: Share](../README.md#how-to-play); [README: Puzzle Challenge](../README.md#puzzle-challenge) | [Input parser tests](../src/puzzle-input.test.ts); [API boundary tests](../tests/api/puzzle.test.ts) |
| `TB-CHALLENGE-01` | The twelve player-facing courses map to the documented Yokaiba templates and difficulty levels, including the bridge transitions. | [README: Puzzle Challenge](../README.md#puzzle-challenge) | [Curriculum mapping test](../src/curriculum.test.ts) |
| `TB-DAILY-01` | Every player receives the same daily seed, with rollover at midnight UTC. | [README: Puzzle Challenge](../README.md#puzzle-challenge) | [Daily seed rollover test](../src/daily.test.ts) |
| `TB-ACCESS-01` | Grid navigation exposes a labelled selector, one active keyboard-focusable tab, a labelled tab panel, and bounded arrow-key navigation. | [README: How to Play](../README.md#how-to-play) | [UI tab and keyboard tests](../src/ui.test.ts) |
| `TB-ACCESS-02` | Icon actions have an accessible name, and decorative SVGs are hidden from assistive technology. | [README: How to Play](../README.md#how-to-play) | [Icon action test](../src/ui.test.ts) |
| `TB-ACCESS-03` | Clue filters form a labelled single-choice control that exposes exactly one selected option. | [README: How to Play](../README.md#how-to-play) | [Filter control test](../src/ui.test.ts); [filtered clue view test](../src/sections.test.ts) |
| `CI-KASEKI-01` | Kaseki jobs run only on `main`, share repository-wide serialization, use read-only checkout access, and do not persist checkout credentials. | [Kaseki workflow contract](#kaseki-workflow-contracts) | [Workflow structure tests](../tests/kaseki-workflows.test.ts) |
| `CI-KASEKI-02` | Kaseki submissions use normal pull requests and cap diffs at 102,400 bytes. | [Kaseki workflow contract](#kaseki-workflow-contracts) | [Submission configuration test](../tests/kaseki-workflows.test.ts) |
| `CI-KASEKI-03` | Idempotency keys are stable UUIDv5 values for a repository, workflow, and run. Polling succeeds only for a completed run with exit code zero; failures, cancellation, unsupported states, and timeout fail the job. | [Kaseki workflow contract](#kaseki-workflow-contracts) | [Idempotency and polling tests](../tests/kaseki-workflows.test.ts); [workflow helper scripts](../scripts/kaseki/) |

## Kaseki workflow contracts

The two scheduled workflows are operationally restricted to the `main` branch. They serialize runs at repository scope, request only `contents: read`, and disable persisted checkout credentials. Their submissions create normal pull requests with a maximum diff of 102,400 bytes. The polling helper reports completion only when the remote run is completed with exit code zero; failed and cancelled runs, unknown states, and an expired polling deadline fail the workflow.
