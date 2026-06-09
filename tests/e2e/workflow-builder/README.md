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

**Running without wiping the DB.** Set `PLAYWRIGHT_SKIP_DB_RESET=1` to skip the
global reset+seed and run against your already-seeded local stack — useful while
developing (the seed fixtures these tests rely on must already exist):

```bash
PLAYWRIGHT_SKIP_DB_RESET=1 npm run test:e2e -- tests/e2e/workflow-builder
```

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
