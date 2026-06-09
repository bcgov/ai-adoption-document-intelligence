# E2E Test Catalog

Human-readable index of the Playwright end-to-end tests for the workflow-builder
and the broader app views. Generated from the specs under
[`tests/e2e/workflow-builder/`](../../tests/e2e/workflow-builder/) and
[`tests/e2e/app-views/`](../../tests/e2e/app-views/).

**35 tests** total: 33 run by default, 2 behind opt-in tags.

> **See also:** the per-suite READMEs explain the design decisions —
> [workflow-builder/README.md](../../tests/e2e/workflow-builder/README.md) and
> [app-views/README.md](../../tests/e2e/app-views/README.md).

---

## How to list / run them yourself

```bash
# List every test (no execution):
npx playwright test tests/e2e/workflow-builder tests/e2e/app-views --list

# Run the default suite (hermetic — excludes @infra/@llm), no DB wipe:
PLAYWRIGHT_SKIP_DB_RESET=1 npm run test:e2e -- tests/e2e/workflow-builder tests/e2e/app-views

# Include the infra tier (needs Temporal worker + deno-runner):
PLAYWRIGHT_SKIP_DB_RESET=1 RUN_INFRA=1 npm run test:e2e -- tests/e2e/workflow-builder

# Include the live-LLM tier (costs tokens):
RUN_LLM=1 npm run test:e2e -- tests/e2e/workflow-builder

# Interactive UI mode (great for browsing what each test does):
npm run test:e2e:ui
```

`--list` is always the source of truth; this doc is a curated summary.

## Tags

| Tag | Meaning | In default run? |
|-----|---------|-----------------|
| _(none)_ | Hermetic — needs only frontend + backend + DB | ✅ |
| `@infra` | Needs the Temporal worker and/or the deno-runner sidecar | ❌ (set `RUN_INFRA=1`) |
| `@llm` | Drives the real LLM — non-deterministic, costs tokens | ❌ (set `RUN_LLM=1`) |

---

## Workflow builder — `tests/e2e/workflow-builder/specs/`

### `tier1-editor-load.spec.ts` — editor load & auto-layout
Guards the recent fix that auto-lays-out position-less workflows on open.

| Test | What it verifies |
|------|------------------|
| seeded `standardOcr` renders laid out | The seeded OCR workflow (no node positions) renders as a spread-out graph, not stacked. |
| seeded `standardOcrMistral` renders laid out | Same, for the Mistral seed. |
| seeded `multiPageReport` renders laid out | Same, for the 16-node multi-page seed. |
| API-authored position-less workflow renders laid out on open | A freshly-created workflow with no `metadata.position` gets dagre-laid-out on open. |
| a workflow that already has positions is left untouched | Auto-layout is a no-op when positions exist — authored left-to-right columns are preserved. |

### `tier1-node-config.spec.ts` — node settings panel
| Test | What it verifies |
|------|------------------|
| selecting a node opens its settings with label + type badge | Clicking a node opens the per-node panel showing its label and a type badge. |
| the Advanced toggle reveals raw bindings | The Advanced toggle is operable (raw port bindings) without error. |
| editing the label updates the node | Editing the node label field updates the node. |

### `tier1-versioning.spec.ts` — version history
| Test | What it verifies |
|------|------------------|
| two published versions appear with a head badge; compare opens | Two API-published versions show in the history drawer with one head badge, and Compare opens the diff modal. |

### `tier1-library.spec.ts` — save as library
| Test | What it verifies |
|------|------------------|
| the Save-as-Library modal publishes a library lineage | The modal round-trips a create (201) and the persisted lineage carries `metadata.kind: "library"`. |

### `tier1-sources.spec.ts` — document source nodes
| Test | What it verifies |
|------|------------------|
| a `source.upload` node renders and opens its settings panel | A source-entry workflow renders, and selecting the source node shows its settings + the Upload affordance. |

### `tier1-dynamic-node.spec.ts` — dynamic-node list & editor
| Test | Tag | What it verifies |
|------|-----|------------------|
| the list page renders with a New button | — | `/dynamic-nodes` mounts with the New button (pure UI). |
| a published node appears in the list and opens in the editor | `@infra` | Publishing a node (Deno toolchain) lists it, and opening it shows the editor + signature preview + code pane. |

### `tier2-canvas-render.spec.ts` — canvas render (API-built graphs)
| Test | What it verifies |
|------|------------------|
| every node and edge from the config is rendered | A 3-node/2-edge graph built via the API renders all nodes + edges. |
| the multi-page report seed renders its full graph | The dense 16-node seed renders without dropping nodes. |

### `tier2-canvas-drag.spec.ts` — real drag-to-connect
| Test | What it verifies |
|------|------------------|
| dragging from a source handle to a target handle adds an edge | The genuine React Flow connection gesture produces a new edge (one focused smoke; breadth is covered by the API-built render tests). |

### `tier3-agent-stubbed.spec.ts` — AI agent chat (stubbed model)
Deterministic: replays a UI-message stream captured from the live backend.

| Test | What it verifies |
|------|------------------|
| renders a streamed text response | The chat renders a streamed assistant reply. |
| renders tool-call chips from a workflow-building turn | `createWorkflow` + `addNode` tool-call chips render from the captured turn. |
| model picker and abort control are present | The model picker and abort control are present in the drawer. |

### `tier3-agent-live.spec.ts` — AI agent chat (live model)
| Test | Tag | What it verifies |
|------|-----|------------------|
| builds a workflow from a natural-language prompt | `@llm` | The real agent persists a workflow from an NL prompt (asserts the server-side effect). Non-deterministic — opt-in. |

### `tier3-try-infra.spec.ts` — Try-in-place execution
| Test | Tag | What it verifies |
|------|-----|------------------|
| Upload & Try a source workflow starts a run | `@infra` | Uploading the sample PDF to a source workflow kicks off a Temporal run and surfaces the success affordance. |

---

## App views — `tests/e2e/app-views/specs/`

### `smoke.spec.ts` — view smoke tests
Each view loads with mock auth and renders its heading without a page error.

| Test | View / route |
|------|--------------|
| Upload mounts and renders its heading | `/` |
| Processing queue mounts and renders its heading | `/queue` |
| Template Models mounts and renders its heading | `/template-models` |
| Tables mounts and renders its heading | `/tables` |
| HITL Review mounts and renders its heading | `/review` |
| Classify mounts and renders its heading | `/classify` |
| Settings mounts and renders its heading | `/settings` |
| Groups mounts and renders its heading | `/groups` |
| Dynamic nodes — new page mounts the editor | `/dynamic-nodes/new` |

### `groups.spec.ts` — Groups page (deeper)
| Test | What it verifies |
|------|------------------|
| renders the heading and admin create-group affordance | As an admin, the heading + create-group button render. |
| the create-group modal opens with its fields and cancels cleanly | The modal opens with name/description/submit and cancels cleanly. |
| submitting an empty name surfaces a validation error | Submitting with no name shows the inline "Name is required" validation (no backend mutation). |

### `tables.spec.ts` — Tables (reference data)
Uses the seeded `payment_schedule` table (no writes).

| Test | What it verifies |
|------|------------------|
| the list shows the seeded reference table | `/tables` lists the seeded "Payment Schedule" table. |
| opening a table shows its detail with the Rows tab | Clicking it navigates to the detail route and shows the Rows tab. |

---

## Coverage notes & future polish

- Most app views (Upload, Queue, Template Models, Tables, HITL, Classify,
  Settings) carry **no `data-testid`s**, which caps them at heading/text-level
  smoke. Adding testids (e.g. Tables rows, the HITL queue) unlocks deeper tests.
- The router has **no catch-all (`path: "*"`)** route — unknown paths hit React
  Router's default error boundary rather than the app shell. A `NotFound` route
  is a possible small polish.
- The Dynamic-nodes editor uses Monaco, whose web worker fails to initialise
  under headless Chromium; that page's smoke asserts the editor shell mounts but
  not zero page errors.
