# Running the tests

## Quick reference

| Command | Runs | Needs |
|---|---|---|
| `npm run test:unit` | All workspace unit tests (jest/vitest) | nothing (they mock) |
| `npm run test:all` | **Everything** — unit + live integration + e2e (incl. `@infra`) | the full local stack up (see below) |
| `npm run test:e2e` | Playwright e2e, **deterministic subset only** | frontend + backend up |
| `RUN_INFRA=1 npm run test:e2e` | e2e incl. `@infra` (real runs) | + Temporal worker + deno-runner |
| `RUN_LLM=1 npm run test:e2e` | e2e incl. `@llm` (**hits paid LLM APIs**) | + LLM credentials |

**Run absolutely everything, including the paid LLM tests:**
`RUN_LLM=1 npm run test:all`.

## No silent green

Tests that need a live dependency are **opt-in**, and the two states are honest:

- **Not opted in** → they are **excluded / skipped** — reported as *filtered* (Playwright) or *skipped* (Jest), **never counted as passed**. So a green run never hides a test that didn't actually execute.
- **Opted in** → they **run for real and fail loudly** if the dependency is missing. E.g. `RUN_INTEGRATION=1` with the deno-runner down fails with *"deno-runner required … but unreachable"*; an `@infra` e2e with no worker times out and fails. A missing dependency surfaces — it never passes silently.

### The opt-in flags

| Flag | Gates | Set by |
|---|---|---|
| `RUN_INFRA=1` | Playwright `@infra` e2e — need the Temporal worker + deno-runner (real Try runs, dynamic-node execution) | `test:all` |
| `RUN_LLM=1` | Playwright `@llm` e2e — hit the real LLM (Azure/Anthropic); non-deterministic + **cost money** | you, explicitly |
| `RUN_INTEGRATION=1` | Jest live-integration suites (e.g. `dyn-run.activity.integration.test.ts`) that hit the live deno-runner | `test:all` |

`@infra` / `@llm` are excluded via `grepInvert` in [`playwright.config.ts`](../playwright.config.ts);
`RUN_INTEGRATION` gates the Jest suites via `describe.skip`.

## Prerequisites for `test:all`

`test:all` runs everything that can execute against the **local stack**, so that stack must be up and seeded — otherwise the dependent tests fail (by design). Start it with the `dev: all` VS Code task (or the equivalent), which brings up:

- Postgres + MinIO + Temporal + the **deno-runner** (docker infra)
- the **backend** (`:3002`), **frontend** (`:3000`), and the **Temporal worker**
- a **seeded DB** — if the DB was reset without a seed, API calls 401; run `npm run db:seed` (from `apps/backend-services`)

Dynamic-node **run** tests additionally need the worker started with a
`PLATFORM_API_KEY` (any non-empty value locally) — see
[workflow-builder/MANUAL_TEST_PLAN.md](workflow-builder/MANUAL_TEST_PLAN.md).

`test:all` intentionally does **not** set `RUN_LLM` — those tests cost money and
need credentials, so they stay an explicit opt-in (`RUN_LLM=1 npm run test:all`).
