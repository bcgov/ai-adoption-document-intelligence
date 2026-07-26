# Workflow Builder — Playwright E2E suite

End-to-end coverage for the visual workflow builder (Phases 1–8 + the AI agent),
organised in tiers by determinism and infrastructure needs.

## Layout

```
workflow-builder/
├── helpers/
│   ├── wb-test.ts          # auth setup (origin-agnostic), constants, seed ids
│   ├── workflow-api.ts     # create/update/delete workflows + config builders
│   ├── dynamic-node-api.ts # publish/delete dynamic nodes (needs deno-runner)
│   ├── agent-stub.ts       # route-fulfil /api/agent/chat with a recorded stream
│   └── canvas.ts           # xyflow node/edge/handle helpers + layout assertions
├── pages/                  # Page Object Models (editor, agent chat)
├── fixtures/agent/         # captured Vercel AI-SDK UI-message streams
└── specs/                  # the tests (tierN-*.spec.ts)
```

## Tiers & tags

| Tier | Files | Needs | In default CI? |
|------|-------|-------|----------------|
| 1 — deterministic UI | `tier1-*` | frontend + backend + DB | ✅ yes |
| 2 — canvas | `tier2-canvas-render` (API-built), `tier2-canvas-drag` (real drag) | frontend + backend + DB | ✅ yes |
| 3 — agent (stubbed) | `tier3-agent-stubbed` | frontend + backend + DB | ✅ yes |
| 3 — agent (live) | `tier3-agent-live` | **real LLM** (Azure/Anthropic) | ❌ `@llm` |
| 3 — execution | `tier3-try-infra`, `tier1-dynamic-node` (lifecycle test) | **Temporal worker + deno-runner** | ❌ `@infra` |

`@infra` and `@llm` are **excluded by default** (see `playwright.config.ts`
`grepInvert`). The default `npm run test:e2e` is hermetic: no tokens, no worker.

## Running

> ⚠️ **`npm run test:e2e` runs `tests/global-setup.ts`, which does
> `prisma migrate reset --force && db:seed` — it WIPES the dev database.**
> Don't run it against a stack you're actively using without expecting a reset.
> The seed re-creates the `seed-workflow-*` fixtures these tests rely on.

Prereqs: frontend `:3000`, backend `:3002` (and, for the tagged tiers, the
Temporal worker + deno-runner `:9099`) all up — e.g. via the VSCode `Dev: all`
task.

```bash
# Default hermetic suite (Tier 1 + 2 + stubbed agent):
npm run test:e2e -- tests/e2e/workflow-builder

# Include the Deno/Try execution tier:
RUN_INFRA=1 npm run test:e2e -- tests/e2e/workflow-builder

# Include the real-LLM agent tier (costs tokens):
RUN_LLM=1 npm run test:e2e -- tests/e2e/workflow-builder

# Everything:
RUN_INFRA=1 RUN_LLM=1 npm run test:e2e -- tests/e2e/workflow-builder
```

**⚠️ Running without wiping the DB.** By default `tests/global-setup.ts` runs
`prisma migrate reset --force && npm run db:seed` before *any* spec — so a single
test run **destroys your local database**: documents, uploads, run history and
the seeded feature demos. Set `PLAYWRIGHT_SKIP_DB_RESET=1` to run against your
already-seeded stack instead (the seed fixtures these tests rely on must already
exist):

```bash
PLAYWRIGHT_SKIP_DB_RESET=1 npm run test:e2e -- tests/e2e/workflow-builder
```

If it does get wiped: `cd apps/backend-services && npm run db:seed` restores the
templates and benchmarking fixtures, then `node scripts/seed-feature-demos.mjs`
(backend running) restores the 16 `demo-*` workflows. Documents and uploads are
not reproducible.

**Type-check gate.** Global setup type-checks the frontend first, before the
database reset. The suite drives the running dev server, and Vite transforms
modules lazily — so a broken component never surfaces as a build failure, it
surfaces as "canvas never mounted" on every spec. Checking first turns twenty
minutes of debugging tests into one compiler error, and aborts before the
destructive reset. `PLAYWRIGHT_SKIP_TYPE_CHECK=1` bypasses it.

**Parallelism vs the backend rate limiter.** All workers share ONE backend
instance behind a global throttle (`THROTTLE_GLOBAL_LIMIT`, default 100
req/min/IP — every worker is `localhost`). Editor pages are chatty (config +
catalog + per-node preview/status fetches), so unbounded workers make
full-suite runs 429-storm the backend: preview widgets flip to `error`,
canvas interaction stalls, and the same handful of tests flake. Local runs
are therefore capped at **6 workers** (`playwright.config.ts`); if you bump
`THROTTLE_GLOBAL_LIMIT` in your backend env you can raise it with
`PLAYWRIGHT_WORKERS=<n>`.

## Design notes

- **Canvas via API, not drag.** React Flow renders SVG + absolutely-positioned
  handles; simulating drag-to-connect is flaky. The breadth tests build a known
  graph through the backend and assert the *render* (`tier2-canvas-render`); a
  single `tier2-canvas-drag` smoke guards the real gesture.
- **Stubbed agent.** The agent's tools run server-side; the browser only
  consumes a Vercel AI-SDK UI-message stream. `agent-stub.ts` route-fulfils
  `/api/agent/chat` with a stream captured verbatim from the live backend
  (`fixtures/agent/*.sse.txt`), so the chat surface is deterministic. The real
  graph-building effect is asserted in the `@llm` tier.
- **Seed fixtures.** `seed-workflow-standard-ocr`, `-mistral`, and
  `-multi-page-report` are created by `db:seed` with **no node positions** —
  the exact input the edit-mode auto-layout fix handles. `tier1-editor-load`
  guards that they render laid out rather than stacked.
- **Supersedes the manual walkthroughs.** The ad-hoc `feature-docs/**/walkthrough.mjs`
  scripts (Phase 6 + 7) are replaced by `tier1-dynamic-node` / `tier3-agent-*`
  as committed, CI-wired specs.
