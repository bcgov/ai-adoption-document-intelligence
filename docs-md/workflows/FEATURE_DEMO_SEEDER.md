# Feature Demo Seeder

A dev tool that seeds one pre-built workflow per visual feature of the workflow
builder and generates a click-through guide with a **direct editor deep-link +
a few steps** for each. It lets you spot-check a single feature without walking
the whole [MANUAL_TEST_PLAN.md](MANUAL_TEST_PLAN.md) from scratch.

- **Script:** [`scripts/seed-feature-demos.mjs`](../../scripts/seed-feature-demos.mjs)
- **Command:** `npm run seed:demos`
- **Generated output:** [FEATURE_DEMO_GUIDE.md](FEATURE_DEMO_GUIDE.md) (this is a
  *generated* artifact — see [Why it's generated](#why-its-generated))
- **Second, opt-in step:** `npm run seed:demo-runs` executes **real** Temporal
  runs against the demos, so the run-time surfaces have something true behind
  them — see [Seeded runs](#seeded-runs--npm-run-seeddemo-runs).

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

Because it recreates the workflows, it also **orphans any seeded runs** — follow
it with `npm run seed:demo-runs` if you want them back.

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
| Grouping | groups, container boxes, simplified view, exposed params, node-swap, auto-arrange (Part 6); single-row top bar (Part 16) |
| Workflow-as-API | `source.api` + Run drawer trigger URL / schema / sample curl (Part 11) |
| Document sources | `source.upload` node settings — MIME types / size cap / ctx key (Part 13) |
| Try-in-place | run a workflow & see previews (Part 9) — needs worker |
| Run states — branch & error path | a `switch` routing on real data + an `errorPolicy` fallback edge, both **runnable** (Part 9 / 5.2) — needs worker |
| Run states — waiting on a person | a `humanGate` that really waits (Part 9 / 4) — needs worker |
| Run states — replay across versions | two versions, so a run pinned to v1 can be replayed while head is v2 (Part 12) — needs worker |
| Versioning | history & revert, seeded with **two** versions (Part 12) |
| Library | a `library`-kind workflow (Part 10) |
| Dynamic node | palette DYN entry, DYN pill, Edit script (Part 14) — **best-effort**, see below |

Part 16 (UX polish) isn't a separate workflow — its checks (switch diamond, single-row top bar, hover-to-extend, node pills) are folded into the steps of the control-flow, grouping and typed-I/O demos.

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
   `?agentChat=<id>` deep link is stable across reseeds, and the row is written
   with `isDemo: true`.

`isDemo` is what makes the replay openable by whoever follows the link. Ordinary
conversations are private to their `createdBy` actor, and a demo seeded under one
identity was invisible to everyone else — the drawer's *Show past conversations*
came up empty for anybody but the seeder. A demo row is instead visible to every
member of its group and **read-only for all of them**: `POST /api/agent/chat`
refuses a turn on one with `demo-conversation-read-only`, and the switcher badges
it **demo replay** and withholds delete. `createdBy` still records who seeded it
(`SEED_USER_SUB`'s actor, else the group's `ApiKey.actor_id`) but no longer
decides who can see it.

The guide then renders an **🤖 AI agent chat logs** section: each row has a
**💬 Chat log** link (`?agentChat=<id>` — opens the drawer and replays the whole
conversation) and a **▶ Workflow** link (the graph the agent produced).

**To add a scenario:** capture a live run (drive the agent, then export the
conversation via `GET /api/agent/conversations/:id` and the workflow via
`GET /api/workflows/:id`), write a `scripts/agent-demo-fixtures/scenario-N.json`
(`{ conversationId, title, provider, model, workflow: { name, description, config }, steps, messages }`),
and add its filename to `AGENT_DEMO_FIXTURES` in `seed-feature-demos.mjs`.

## Seeded runs — `npm run seed:demo-runs`

The seeder above only builds **graphs**. It never executes one, so every demo
opens at "Not run yet" and the whole run-time half of the builder — node status
badges, wire-peek values, node result strips, the failed-node treatment,
taken-edge drawing, cache-hit `skipped` nodes, and replay — is invisible unless
you stand up the stack and run something yourself.

`npm run seed:demo-runs` fixes that by executing **real** Temporal runs against
the demos:

```bash
npm run seed:demos      # build the graphs   (backend + DB)
npm run seed:demo-runs  # run them for real  (+ Temporal worker)
```

- **Script:** [`scripts/seed-demo-runs.mjs`](../../scripts/seed-demo-runs.mjs)
- **Shared identifiers:** [`scripts/demo-run-targets.mjs`](../../scripts/demo-run-targets.mjs)
  — the demo titles and node ids both scripts need, in one place.

### Why it is a separate command

`seed:demos` is HTTP-only against `:3002`: backend and DB up and it works, in a
couple of seconds. Folding a run pass into it would quietly give it a **Temporal
worker** dependency and turn those seconds into a minute, on every unrelated
reseed. The runs therefore get their own explicit, opt-in step.

### Why it executes rather than inserting fixtures

There is nothing to insert. `apps/shared/prisma/schema.prisma` has **no run
model at all**: `GET /:id/runs` is Temporal's visibility API and
`GET /:id/runs/:runId/node-statuses` is a live query against that execution's
history. The only DB-backed run artifact is `ActivityOutputCache` — seeding that
alone would give you preview values, an empty run history and no status badges,
which is exactly the half-real artifact
[DEMO_FABRICATION_AUDIT_20260718.md](DEMO_FABRICATION_AUDIT_20260718.md) exists
to prevent.

### What it produces

| State | Where it lands |
|---|---|
| **Succeeded** run | Try-in-place demo — the upload-and-Try over `file.prepare` |
| **Cache hit** (`skipped` + `cacheHit`) | Try-in-place demo — the same graph re-run with the same inputs |
| **Failed** run | Try-in-place demo — a blob key that resolves to nothing |
| **Branch taken** (`selectedEdgeId`) | Branch/error demo — the switch compares `preparedData.fileType`, a value the prepare step really computed |
| **Error path taken** (`selectedEdgeId`) | Branch/error demo — `errorPolicy: "fallback"` diverts a genuine failure down the red edge |
| **In-flight** run | Human-gate demo — a `humanGate` genuinely waiting |
| **Cancelled** run | Human-gate demo — a second Try cancels the first server-side (D-17) |
| **Run pinned to an older version** | Replay demo — started with `workflowVersionId` = v1 while head is v2 |

Every activity involved (`file.prepare`, `document.updateStatus`) runs against
local Postgres and local blob storage: **no Azure, no LLM, no credential, no
egress, no cost.** Eight executions, a few seconds each.

The one state it does **not** produce is *expired history* — a run only becomes
unreplayable once Temporal retention-cleans it, and the dev namespace keeps 30
days (`DEFAULT_NAMESPACE_RETENTION` in `docker-compose.yml`). There is no way to
age a run on demand.

### It leaves one execution open, on purpose

The human-gate demo's newest run is parked on a gate waiting for a
`humanApproval` signal nobody sends. That **is** the in-flight state; it is not
a hung workflow, and the script says so when it finishes. Re-running the script
cancels it and parks a fresh one, so the count never grows.

Re-running `seed:demos`, though, deletes and recreates the workflows — which
orphans every run above, including the waiting one. An orphan has no lineage
left for the next Try to cancel, so it sits until its 30-day gate timeout.
Terminate it by hand if it bothers you:

```bash
docker exec temporal temporal workflow list --address 127.0.0.1:7233 \
  --query "ExecutionStatus='Running'"
docker exec temporal temporal workflow terminate --address 127.0.0.1:7233 \
  --workflow-id <id> --reason "orphaned by demo reseed"
```

### Prerequisites

Everything `seed:demos` needs, **plus the Temporal worker**
(`npm run dev:temporal-worker`, or the `dev: all` task). The deno-runner is not
needed — none of these graphs contain a dynamic node. If the runs are accepted
but nothing executes them, the script says so.

### Test coverage

There is none, and that is deliberate: the demo seeder is a dev script with no
harness today, and the run pass follows that precedent rather than inventing
one. What it does instead is **assert before it prints** — every state is
checked against the live API (the switch really took `to-pdf`, the re-run really
came back `skipped` with a `cacheHit`, the first Try really reads `cancelled`)
and the script fails loudly rather than reporting a state it did not observe.

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

Real OCR-output previews, **dynamic-node runs** (need `PLATFORM_API_KEY` on the
worker — the *editor surface* is now seeded as a demo; publish/security gates
are covered by e2e), and the agent chat.

Cache-hit re-runs (9.6/9.9) used to be on this list; `npm run seed:demo-runs`
now seeds one. **Expired run history** is the state nothing can seed on demand —
it needs a run older than the namespace's 30-day retention.
