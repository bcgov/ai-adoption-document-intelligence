# Seeded runs, and a usability pass over Run / replay

**Scope only — nothing built yet.** Written 2026-08-09 at Alex's request, out of
the batch-four close-out conversation.

> *"do we have a demo that shows a workflow that has a previous run, so you can
> see the replay state? … In my conversation with the reviewer i was saying how the
> 'run' feature isn't tested through well. Would be nice if you could run a
> workflow, have it part of the demos and also reflect on the usability of that
> feature."*

Three constraints he set:

1. **The seeded run must come from an actual run.** No fabricated run rows, no
   hand-written node statuses. Same rule the demo set already lives under
   (`docs-md/workflows/DEMO_FABRICATION_AUDIT_20260718.md`).
2. **Reflective — cover a good number of cases.** One green run proves almost
   nothing; the states that matter are the ones nobody has looked at.
3. **Screenshots after running**, into
   [ILLUSTRATED.md](../20260806-ux-review-batch-four/ILLUSTRATED.md),
   then fold the findings in with the reviewer's feedback.

---

## What exists today — checked against the branch, not assumed

**No demo carries a run.** `scripts/seed-feature-demos.mjs` makes exactly three
kinds of call — `POST /api/workflows`, `PUT /api/workflows/:id`,
`POST /api/dynamic-nodes`. It never triggers an execution. All 14 demos open at
"Not run yet", so every run-time surface is invisible in the demo set: node
status badges, wire-peek values, node result strips, the failed-node treatment,
taken-edge path drawing, the cache-evicted alert, and replay in its entirety.

**A run needs a published version, and the seeder already produces one.**
`resolveLineageAndVersion` 409s only when the lineage has no `headVersion`;
`POST /api/workflows` + `PUT` creates one. So no publish step is needed —
this was the main thing that could have made the whole idea expensive, and it
doesn't.

**The states the product can actually show**

| Level | Values |
|---|---|
| Run (`RunSummaryStatus`) | `running` · `succeeded` · `failed` · `cancelled` |
| Node (`NodeRunStatusValue`) | `pending` · `running` · `succeeded` · `failed` · `skipped` (cache hit) · `cancelled` (reserved — the runtime never writes it) |

Plus two things that are neither, and that no screenshot has ever caught:

- **`selectedEdgeId` (G-014)** — the one outgoing edge a node routed to, set by a
  `switch`'s matched case, a `humanGate` timing out onto its fallback, or an
  `errorPolicy: "fallback"` diversion. `computeTakenEdges` uses it to draw the
  path a finished run actually followed.
- **The replay version pin (G-004)** — `startReplay(runId, version)` holds the
  workflow version the run executed against, and all five exits from replay have
  to drop it. Replaying a run whose graph has since changed is the only way to
  see this work.

**Run history lists tries as well as real runs.** The visibility query in
`temporal-client.service.ts:listRunsForWorkflow` builds its clauses from lineage,
status, start time and version — **there is no `RunTrigger` clause**. So the
disposable canvas previews that `POST /:id/tries` stamps `"try"` (D-17) appear in
the author's Run history next to production runs. The attribute is not missing —
the dev namespace registers `Keyword06:RunTrigger` as a search attribute — so
filtering them out is one clause, not a schema change. That is a finding in its own
right; it also means the seeded run set will look busier than intended unless the
seeder's executions go through `/runs`.

---

## Coverage matrix — eight states, every one from a real execution

Ordered by how much is currently unseen, not by ease.

| # | State | Produced by | What it makes visible | External deps |
|---|---|---|---|---|
| 1 | **Succeeded run** | The existing try-in-place chain (`file.prepare` only) | Green badges, wire-peek values, result strips, a replayable history row | none |
| 2 | **Failed run** | A node given input that genuinely fails | Red badge + `errorMessage`, the failed treatment from item 6, the `failed` history filter | none *(candidate activity to be picked — see risks)* |
| 3 | **Error path taken** | A node with `errorPolicy: "fallback"` that really fails | The red error edge drawn as **taken**, via `selectedEdgeId` — items 5 and 6 territory, never photographed | none |
| 4 | **Branch decision** | A `switch` whose condition evaluates against a real prepared file | Taken-edge path drawing; the un-taken cases staying dim | none |
| 5 | **Cache hit** | Run the same deterministic graph **twice** | `skipped` nodes with `cacheHit`, and the cache-evicted alert's only live habitat | none |
| 6 | **In-flight run** | A `humanGate` genuinely waiting for a person | Run status `running`, `pending` node badges — the only state a finished run can never show | none; leaves one Temporal execution open |
| 7 | **Cancelled run** | Start a Try, then another — the first is cancelled server-side (D-17) | A real row behind the `cancelled` filter | none |
| 8 | **Replay against an older version** | Run at v1, then `PUT` a v2 | The version pin, and the replay banner saying something true | none |

Five workflows, roughly seven executions. Nothing here needs Azure, an LLM, or a
credential — which is the point: the barrier that stopped the reviewer testing Run
was the worker and the deno-runner, and a seeded run removes it for everyone
downstream.

---

## The work, in order

### A · A separate script that executes the runs

**Not part of `npm run seed:demos`.** Alex's objection, 2026-08-09: the seeder is
HTTP-only against `:3002` today — backend and DB up and it works — and a run pass
would quietly give it a Temporal worker dependency and turn seconds into a minute.
The dynamic-node demo is precedent for a best-effort infra dependency, but
precedent is not a reason to add a second one. So the runs get their own explicit
step, `npm run seed:demo-runs`, invoked when you want the run and replay states.

Checked: `seed:demos` is only ever invoked by hand — `tests/global-setup.ts`
mentions it in a comment and does not call it. Nothing in CI is affected either way.

- Reuse the shape of `tests/e2e/workflow-builder/helpers/workflow-api.ts` —
  `POST /:id/runs`, then poll `GET /:id/runs/:runId/node-statuses` until every
  node is terminal. ~30 lines of plain `fetch`; the helper itself is Playwright-
  typed and can't be imported into a `.mjs` script.
- Runs **after** the demos exist. `seed:demos` deletes and recreates its
  workflows every time, so a re-seed orphans the runs and this script has to be
  re-run — a printed note, and an argument for the split, since a welded-in pass
  would silently redo seven executions on every unrelated reseed.
- Nothing external: `file.prepare` against local Postgres and local blob. No
  Azure, no LLM, no credential, no egress, no cost.
- The in-flight `humanGate` run (state 6) stays open by design. Worth a printed
  note so nobody hunts for a hung workflow.

#### Why the fixtures can't just live in the seed file

Alex asked the obvious cheaper question — run it once, capture the fixtures, bake
them in. **There is nothing to bake.** Checked against the schema and the
controller:

- `apps/shared/prisma/schema.prisma` has **no run model at all**. Runs live in
  Temporal's own database.
- `GET /:id/runs/:runId/node-statuses` is a **live Temporal query**
  (`queryNodeStatuses`) against that execution's history, with a cross-lineage
  ownership check on the decoded start args.
- `GET /:id/runs` is the **Temporal visibility API**
  (`listWorkflowExecutions`), not a table.
- The only DB-backed run artifact is `ActivityOutputCache` — the preview values
  behind the wire peek and the result strips.

Seeding that one table alone would produce a demo with preview values, an empty
Run history and no status badges: a half-state that looks like data and isn't.
That is precisely what the no-fabricated-artifacts rule exists to stop.

#### The retention fact this surfaced — it dents the original plan too

Measured on the running dev Temporal, 2026-08-09:

```
Config.WorkflowExecutionRetentionTtl   24h0m0s
```

So **every run — seeded, hand-made, or a developer's own — becomes unreplayable
after 24 hours.** After that, `node-statuses` throws `WorkflowNotFoundError`, the
controller's retention heuristic maps it to **410 Gone** with *"Run history no
longer available — use the cached preview endpoint instead"*, and the cached
previews (which have their own `expiresAt`) are all that is left.

Two consequences:

1. **For the demos** — a seeded run set goes stale in a day unless the dev
   namespace's retention is raised. That is one environment variable on the
   `temporalio/auto-setup` container (`DEFAULT_NAMESPACE_RETENTION`) or one
   `temporal operator namespace update --retention 30d`. Dev environment, not
   product.
2. **For the product** — "what replay does once history is gone" stops being an
   edge case and becomes the *normal* case for any run older than a day. It is a
   designed degradation that nobody has ever looked at, and it belongs in the
   usability pass as a state to photograph deliberately (state 9), not as a
   footnote.

### B · Screenshots

New entries in
`feature-docs/20260806-ux-review-batch-four/capture-screenshots.mjs`
(shot ids continue from 28), each **asserting before it saves** — the rule the
batch-four shots already follow, so a frame can't contradict its caption. Roughly
ten: the green canvas, the failed node and its message, the taken error path, the
switch's taken path, a cache-skipped node, the in-flight canvas, Run history with
mixed statuses and its filters, the replay banner with its version pin, a wire
peek showing a real value, and a node result strip.

### C · The usability pass — the actual deliverable

Walk the run surfaces in a browser and write findings in the batch-four format:
numbered, each with evidence, the key file, and a recommendation. Things already
worth looking at hard, from reading the code:

- **`RunStateProvider` starts every mount at `activeRunId = null`.** Reload after
  a run and the canvas honestly says "Not run yet"; the run is fine, but you have
  to know to open Run history and re-open it. Defensible design, never tested on
  a person. It is also what made `tier3-try-preview` unsound.
- **Nothing on the canvas says a workflow has history.** Run history is a drawer
  behind the top bar; on load there is no cue that eleven runs exist.
- **Tries and runs share one history** (see above). An author's list fills with
  disposable previews.
- **`skipped` reads as "didn't happen"** but means "served from cache".
- **Am I in the past?** Replay has five exits and a version pin; whether the
  canvas makes "this is a recording" obvious is exactly the kind of thing
  the reviewer catches and tests don't.

### D · Docs

`docs-md/workflows/FEATURE_DEMO_SEEDER.md` (the new pass, its worker dependency,
the open humanGate run), the regenerated `FEATURE_DEMO_GUIDE.md`, and an
ILLUSTRATED.md section carrying the shots plus the written change log.

---

## Risks and open questions

- **Which activity fails cleanly** for state 2 — it has to be a real, meaningful
  failure (a node erroring), not a crash that takes the run down before any node
  reports. Needs one experiment against the running worker; it decides the shape
  of two of the eight states.
- **Seeding time and worker load.** Seven executions on every `npm run
  seed:demos`. If it drags, the run pass gets its own flag rather than being
  dropped.
- **The e2e suite reseeds.** Anything the specs assume about the demo set has to
  survive runs now existing on those workflows — checked before, not after.
- **No test coverage for the seeder itself.** It's a dev script and has none
  today; the new pass follows that precedent rather than inventing a harness
  for it. Flagged, not assumed.

## Prerequisites

Full stack — frontend, backend, Temporal worker **and** deno-runner. No DB reset
between seeding and screenshots.

## Rough size

Two pieces of about equal weight: the seeder pass with its runs, and the browser
walk with the write-up. The findings that come out of C are the part with unknown
size, because they're the part that hasn't been looked at.
