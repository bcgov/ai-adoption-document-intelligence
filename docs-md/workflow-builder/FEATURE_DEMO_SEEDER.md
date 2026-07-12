# Feature Demo Seeder

A dev tool that seeds one pre-built workflow per visual feature of the workflow
builder and generates a click-through guide with a **direct editor deep-link +
a few steps** for each. It lets you spot-check a single feature without walking
the whole [MANUAL_TEST_PLAN.md](MANUAL_TEST_PLAN.md) from scratch.

- **Script:** [`scripts/seed-feature-demos.mjs`](../../scripts/seed-feature-demos.mjs)
- **Command:** `npm run seed:demos`
- **Generated output:** [FEATURE_DEMO_GUIDE.md](FEATURE_DEMO_GUIDE.md) (this is a
  *generated* artifact — see [Why it's generated](#why-its-generated))

## Prerequisites

- The **backend** running on `:3002` and the **DB seeded** (the backend
  validates `x-api-key` against a seeded key). If the DB was reset without a
  seed, every request 401s — run `npm run db:seed` (from `apps/backend-services`)
  first. The [try-in-place demo](#what-it-seeds) additionally needs the Temporal
  **worker + deno-runner** live (the `dev: all` task) to actually run.

## Usage

```bash
npm run seed:demos
```

It is **idempotent**: each run deletes the previously-seeded demos (matched by
the `🎯 Demo — ` name prefix, including the library-kind one), recreates them,
then rewrites the guide with the fresh workflow ids. Re-run it after a database
reset (`npm run test:db:reset`) to refresh the links.

### Configuration (env vars)

| Var | Default | Purpose |
|---|---|---|
| `BACKEND_URL` | `http://localhost:3002` | API base URL |
| `FRONTEND_URL` | `http://localhost:3000` | used to build the editor deep-links |
| `TEST_API_KEY` | probed (see below) | `x-api-key` for the API |

**API-key resolution.** The backend validates `x-api-key` against the value the
DB was seeded with — which may be your shell `TEST_API_KEY`, the one in
`apps/backend-services/.env`, or the documented default. The script gathers all
three (loading the backend `.env` the way `playwright.config.ts` does) and
**probes** which one the backend accepts, using the first that authenticates. It
never logs a key value. If none work you get a clear hint (usually: the DB isn't
seeded, or you need to pass the seeded key: `TEST_API_KEY=<key> npm run seed:demos`).

## What it seeds

One workflow per feature (name-prefixed `🎯 Demo — …`), reusing the **same
graph shapes the e2e specs build** (so they're known-valid):

| Demo | Feature (plan ref) |
|---|---|
| Typed I/O | coloured handles & type pills (Part 7) |
| Auto-wire | typed input binding states — auto-bound / unsatisfied (Part 8) |
| Ambiguous | auto-wire ambiguous source picker (Part 8) |
| Validation | on-load warning badge + drawer (5.4) |
| Node settings | settings panel & canvas basics (Part 3) |
| Control-flow | all six control-flow forms + recursive condition editor (Part 4); switch diamond + hover-extend (Part 16) |
| Edges & validateFields | conditional + red error edges + rich `validateFields` rule editor (Part 5) |
| Grouping | groups, simplified view, exposed params, node-swap, auto-arrange (Part 6); three-zone top bar (Part 16) |
| Workflow-as-API | `source.api` + Run drawer trigger URL / schema / sample curl (Part 11) |
| Document sources | `source.upload` node settings — MIME types / size cap / ctx key (Part 13) |
| Try-in-place | run a workflow & see previews (Part 9) — needs worker |
| Versioning | history & revert, seeded with **two** versions (Part 12) |
| Library | a `library`-kind workflow (Part 10) |
| Dynamic node | palette DYN entry, DYN pill, Edit script (Part 14) — **best-effort**, see below |

Part 16 (UX polish) isn't a separate workflow — its checks (switch diamond, three-zone top bar, hover-to-extend, node pills) are folded into the steps of the control-flow, grouping and typed-I/O demos.

### The dynamic-node demo is best-effort

Publishing the demo's custom node (`demo-uppercase`) runs the real publish
toolchain (jsdoc-parse → signature-semantics → ts-check → allowlist), which
needs the **deno-runner** sidecar. When the runner is down, the seeder prints a
`⚠ dynamic-node demo skipped` note and the guide footer says Part 14 isn't
seeded — everything else still seeds normally.

**Stable slug.** The backend restores a soft-deleted lineage on re-publish
(`POST` is create-*or*-restore — it clears the tombstone and appends the next
version, preserving history), so the seeder always publishes under the base
slug `demo-uppercase`: `PUT` when the lineage is already live, `POST` otherwise
(which restores a tombstone from a prior run). No `-N` suffix churn — deleting
the demo node in the UI and re-seeding lands back on `demo-uppercase`.

### AI agent chat-log demos

Beyond the per-feature workflows, the seeder also seeds **agent chat logs** — real
transcripts captured from live runs of the workflow agent (Azure gpt-5.4). Each
one is defined by a fixture in [`scripts/agent-demo-fixtures/`](../../scripts/agent-demo-fixtures/)
holding the captured `messages` (the user prompt + the assistant turn with every
tool call embedded as parts) plus the final workflow `config`.

For each fixture, `seedAgentDemos()`:

1. Re-creates the built workflow via the API (name-prefixed `🎯 Demo — `, so
   `deleteExistingDemos()` sweeps it too).
2. Inserts a `ChatConversation` + its `ChatMessage` rows **directly via Prisma**
   (there is no API to create an arbitrary transcript). The conversation id is
   **fixed by the fixture** (e.g. `demo-agent-ocr-pipeline`) so the guide's
   `?agentChat=<id>` deep link is stable across reseeds, and `createdBy` is the
   actor the seeded `x-api-key` resolves to (`ApiKey.actor_id` for the group) so
   the demo session — which sends that key — can open it.

The guide then renders an **🤖 AI agent chat logs** section: each row has a
**💬 Chat log** link (`?agentChat=<id>` — opens the drawer and replays the whole
conversation) and a **▶ Workflow** link (the graph the agent produced).

**To add a scenario:** capture a live run (drive the agent, then export the
conversation via `GET /api/agent/conversations/:id` and the workflow via
`GET /api/workflows/:id`), write a `scripts/agent-demo-fixtures/scenario-N.json`
(`{ conversationId, title, provider, model, workflow: { name, description, config }, steps, messages }`),
and add its filename to `AGENT_DEMO_FIXTURES` in `seed-feature-demos.mjs`.

## Why it's generated

The guide's value is **deep links to specific workflows** (`/workflows/<id>/edit`),
and those ids don't exist until the workflows are created. The editor route is
id-based (there's no stable slug route) and the create API assigns a random
`cuid`, so a hand-written static doc couldn't carry working links. Generating the
guide right after seeding stamps in the exact ids just created, so the links
always match the DB. The per-feature instructions live once, in the script's
`DEMOS` array — the script uses each entry to both create the workflow and render
its guide section, so config, steps, and link can't drift.

**Trade-off:** because ids are random `cuid`s, the links change on every run.
The committed guide is therefore a snapshot; re-run `npm run seed:demos` to
refresh it for your environment. (The links only resolve against your running,
seeded stack anyway.) If you want permanent, churn-free links, the demos would
need **stable ids via a Prisma seeder** (like `seed.ts` uses for
`seed-workflow-standard-ocr`) — not yet implemented.

## Extending it

Add an entry to the `DEMOS` array in
[`scripts/seed-feature-demos.mjs`](../../scripts/seed-feature-demos.mjs): a
`key`, a `title` (becomes the guide heading), a `config` (a `GraphConfig` — or a
function returning one), optional `kind` (`"library"`), optional `secondVersion`
(to seed a v2, e.g. for the versioning demo), optional `infra: true` (adds a
"needs the worker" note), and `steps` (the numbered instructions). The workflow
and guide section are produced from that single entry.

## Not covered (see the manual plan)

Real OCR-output previews, incremental **cache-hit** re-runs (9.6/9.9),
**dynamic-node runs** (need `PLATFORM_API_KEY` on the worker — the *editor
surface* is now seeded as a demo; publish/security gates are covered by e2e),
and the agent chat.
