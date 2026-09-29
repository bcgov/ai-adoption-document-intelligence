# D1 / D2 — "Standard workflow is failing at Poll OCR step"

**Reviewer:** dbarkowsky · **Walkthrough steps blocked:** GALLERY 9 (reading results)
and 10 (run history) · **Branch:** `feature/visual-workflow-builder`

---

## Short version

The Standard OCR Workflow **runs green end to end on this branch** once the
environment is correct — nine of nine steps, verified below. dbarkowsky's Poll OCR
failure was a real failure, but nothing in the run told him *why*: every failed
step on the canvas reported the string **`"Activity task failed"`** and nothing
else, because that is the message Temporal puts on its `ActivityFailure`
envelope while the activity's own message sits on `.cause`. That is why he
could not diagnose it himself and had to ask "what has changed since develop?".

Three things are fixed:

1. **Failed steps now say what failed.** The runner unwraps the cause chain, so
   the canvas shows the activity's real message.
2. **The poll's 404 now explains itself**, in the style Submit OCR already used.
3. **A genuine regression against `develop`:** `azureOcr.poll` declared an
   output port (`ocrResponse`) that the activity never returned (it returned
   `response`), so `ocrResponseRef` was silently never written on every
   reworked template. Fixed by making the runtime match the catalog.

Steps 9 and 10 are unblocked. Details, evidence and the one environment
requirement follow.

---

## 1. Reproduction

The dev stack was already up (`npm run dev` — frontend :3000, backend :3002,
Temporal worker; docker infra including temporal/postgres/minio/deno-runner).

The walkthrough's step 8/9/10 workflow is **Standard OCR Workflow**, seeded as
lineage `seed-workflow-standard-ocr`, version `wv_seed-workflow-standard-ocr`.
Its graph is `docs-md/workflows/templates/standard-ocr-workflow.json`:

```
prepareFileData → submitOcr → updateApimRequestId → pollOcrResults
  → extractResults → postOcrCleanup → checkConfidence → reviewSwitch
  → (humanReview) → storeResults
```

Runs were started straight against Temporal (`temporal workflow start --type
graphWorkflow`) with the same argument shape
`TemporalClientService.startGraphWorkflow` uses, against a real seeded document
(`sample-invoice.pdf`). This is the same execution path the **Try** button
takes — `POST /api/workflows/:id/tries` only stamps `RunTrigger` differently.

### 1a. First blocker hit — a stale generated Prisma client (environment)

```
Message: Activity task failed
Cause:   Cannot read properties of undefined (reading 'findUnique')
         at findFresh (apps/temporal/src/activities/cache/activity-output-cache.activities.ts:57)
```

`prisma.activityOutputCache` was `undefined`. The `ActivityOutputCache` model
lives in `apps/shared/prisma/schema.prisma:901` and its migration
(`20260525014452_add_activity_output_cache`) had been applied — the table
existed — but the **generated** clients under `apps/temporal/src/generated/`
and `apps/backend-services/src/generated/` predated it. Those directories are
`.gitignore`d (`apps/temporal/.gitignore:6`,
`apps/backend-services/.gitignore:50`), so they are per-developer artefacts and
go stale silently.

Fix is the documented one, not a code change:

```bash
cd apps/backend-services && npm run db:generate
```

This is **not** what dbarkowsky reported (it fails at the *first* cached activity
node, `prepareFileData`, not at Poll OCR) but it blocks any reproduction, so it
is recorded here — see §5.

### 1b. The workflow, once the environment is right

`workflow-id repro-poll-ocr-3` — **COMPLETED**, all nine nodes succeeded:

```
completedNodes: prepareFileData, submitOcr, updateApimRequestId,
                pollOcrResults, extractResults, postOcrCleanup,
                checkConfidence, reviewSwitch, storeResults
```

So there is no unconditional Poll OCR breakage on this branch.

### 1c. Credentials: ruled out, and they fail somewhere else

This box has **real** Azure Document Intelligence credentials — the worker
logged `useMock:false` on the poll activity, i.e. the run went to live Azure.

Both credential-shaped failures land on **Submit OCR**, not Poll OCR, so
neither can produce dbarkowsky's symptom:

- **No credentials at all** — `apps/temporal/src/activities/submit-to-azure-ocr.ts:106-116`
  throws *"Azure Document Intelligence credentials not configured. Set
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY
  environment variables."* before Poll is ever scheduled.
- **Credentials fine, model missing** — reproduced (`workflow-id
  repro-badmodel-2`) by overriding the OCR model to `no-such-model-xyz`:

  ```
  Message: Failed to submit document to Azure OCR. Status: 404 Model
  "no-such-model-xyz" may not exist in this resource, or the model ID may be
  wrong. … Verify AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT points to the same
  resource where the model was created.
      at submitToAzureOCR (apps/temporal/src/activities/submit-to-azure-ocr.ts:175)
  ```

  Note how good that message is. Poll had no equivalent — see §2b.

### 1d. Reproducing a failure **at Poll OCR**

For Poll to fail after Submit succeeded, the two steps must be talking about
**different Azure models** — an analyze result is scoped to the model it was
submitted under, so `GET /documentModels/{other}/analyzeResults/{id}` misses.

Reproduced as `workflow-id repro-poll-ocr-modelmismatch`:

```
Results:
  Status   FAILED
  Failure
    Message: Activity task failed
    Cause:
        Message: Failed to poll OCR results. Status: 404
            at pollOCRResults (apps/temporal/src/activities/poll-ocr-results.ts:191)
```

Per-node statuses (`getNodeStatuses`, the exact map the canvas polls):

```
prepareFileData      skipped   (cache hit)
submitOcr            succeeded
updateApimRequestId  succeeded
pollOcrResults       failed    errorMessage: "Activity task failed"
```

Node attribution is correct — Submit's failure in §1c was painted on Submit —
so dbarkowsky really did fail at Poll OCR. **And the only thing the product told him
was `"Activity task failed"`.**

---

## 2. Root cause

### 2a. The blocking defect: the real error never reached the developer

`apps/temporal/src/graph-engine/graph-runner.ts:210` (and the map-branch twin at
`node-executors.ts:1225`) recorded:

```ts
errorMessage: error instanceof Error ? error.message : String(error),
```

Temporal wraps every activity failure in an `ActivityFailure` whose own
`message` is the constant `"Activity task failed"`; the `ApplicationFailure` the
activity threw hangs off `.cause`. So `error.message` was **always** the
envelope. Every red step in the canvas, the run-history drawer and
`GET /api/workflows/:id/runs/:runId/node-statuses` carried that one string, for
every failure mode — a missing credential, a wrong model, a code defect and a
blob miss were indistinguishable.

This is the answer to "what has changed since the develop branch": the
per-node status map is itself new on this branch
(`484df7b0a feat(workflow-builder): per-node status streaming + canvas badges …`),
so `develop` never surfaced a per-step message at all and this defect arrived
with the surface that shows it.

### 2b. The poll's 404 said nothing actionable

`poll-ocr-results.ts:191` threw a bare `Failed to poll OCR results. Status: 404`
— no model id, no request id, no hint — while its sibling Submit OCR had
carried a full diagnostic hint for the identical status code since before this
branch.

### 2c. Genuine regression vs `develop`: a poll output port that does not exist

`azureOcr.poll`'s catalog entry
(`packages/graph-workflow/src/catalog/activities/azure-ocr-poll.ts:33-40`)
declares an output named **`ocrResponse`**. The activity returned
**`response`** (`apps/temporal/src/types.ts:232-236`, `PollResult.response`).

The graph runner binds outputs by reading `result[port]`
(`node-executors.ts`, `executePollUntilNode`) and writes whatever it finds —
including `undefined` — so **a port the activity does not return writes
`undefined` into ctx without complaint.**

Diff against `develop` for the standard template:

```diff
-      "outputs": [{ "port": "response", "ctxKey": "ocrResponseRef" }],
+      "outputs": [
+        { "port": "ocrResponse", "ctxKey": "ocrResponseRef" },
+        { "port": "status", "ctxKey": "ocrStatus" }
+      ],
```

Introduced by **`fc255284e fix(workflow-builder): rework demos + templates into
real functional chains`**. The reasoning is on the record in
`docs-md/workflows/DEMO_FABRICATION_AUDIT_20260718.md:134`:

> `azureOcr.poll`: input `documentId` (gone), output **`response` → real port is
> `ocrResponse`** — downstream `extract.ocrResponse` reads a ctx key nothing
> writes.

The audit read the port name off the *catalog*, corrected every template to it,
and never changed the *runtime* — which inverted the bug instead of fixing it.

Proof from the green run of §1b, before the fix. The poll activity's result in
Temporal history:

```json
{"status":"succeeded","response":{"documentId":"13e0338e…","blobPath":"…/azure-response.json",…}}
```

and the workflow's final refs:

```
refs present: ['cleanedResultRef', 'ocrResultRef']      ← ocrResponseRef ABSENT
```

`ocrResponseRef` was never written. The run still passed only because
`azureOcr.extract` falls back to loading the payload by `documentId`. The
visible damage is exactly GALLERY step 9's subject: the **Poll OCR Results**
step had no output bound, so its preview card had nothing to show — and step 9
says in terms that a blank card is a bug.

Six templates were left binding the phantom `ocrResponse`; four still bound the
working `response`, so the two halves of the repo disagreed.

---

## 3. What changed

| File | Change |
|---|---|
| `apps/temporal/src/graph-engine/describe-node-error.ts` | **New.** Walks the `cause` chain and returns the outermost message that is not a Temporal envelope (`"Activity task failed"`, `"Child Workflow execution failed"`, …). Cycle-safe, depth-bounded, never returns empty. |
| `apps/temporal/src/graph-engine/graph-runner.ts` | Failed-node `errorMessage` now uses `describeNodeError(error)`. |
| `apps/temporal/src/graph-engine/node-executors.ts` | Same for nodes failing inside a map branch. |
| `apps/temporal/src/activities/poll-ocr-results.ts` | 404 now names the request id and the model, says an analyze result belongs to the model it was submitted with, points at `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, and mentions Azure's 24-hour result retention. Non-404 statuses are unchanged. `modelId` added to the error log. |
| `apps/temporal/src/types.ts` | `PollResult.response` → `PollResult.ocrResponse`, with the reason recorded on the field. |
| `apps/temporal/src/activities/poll-ocr-results.ts` | All four return sites emit `ocrResponse`. |
| `apps/temporal/src/test/mock-activities.ts` | Mock poll result follows the rename. |
| `docs-md/workflows/templates/` ×5 | `experiment-01`, `experiment-05`, `experiment-07`, `experiment-08`, `standard-ocr-workflow-sdpr` — the four-plus templates still binding `response` moved to `ocrResponse`. One line each; no reformatting. |
| `docs-md/workflows/DAG_WORKFLOW_ENGINE.md`, `WORKFLOW_BUILDER_GUIDE.md`, `WORKFLOW_NODE_CATALOG.md` | Port name corrected in the three places the docs still taught `response`. |

**Direction of the rename.** The catalog is the contract the builder, the
validator and auto-wire all consume (`89d72a73f feat(workflow-builder): backend
+ temporal validators consume catalog`), and `azureOcr.extract`'s *input* port
is already `ocrResponse`. Renaming the runtime to match is the only option that
leaves the builder able to validate the wiring; renaming the catalog would have
broken auto-wire's ability to connect poll → extract by name.

No `any` types, no backwards-compatibility shim (the rename is complete on both
sides), no new DB writes, so the transaction and audit rules do not apply.

---

## 4. Evidence it works

### Unit tests

```
$ cd apps/temporal && npx jest src/activities/poll-ocr-results.test.ts \
                               src/graph-engine/describe-node-error.test.ts
PASS src/graph-engine/describe-node-error.test.ts
PASS src/activities/poll-ocr-results.test.ts
Test Suites: 2 passed, 2 total
Tests:       21 passed, 21 total
```

New coverage:

- `describe-node-error.test.ts` — 7 cases: unwraps one envelope, unwraps nested
  envelopes, keeps a specific message with no cause, falls back when the whole
  chain is generic, survives a cause cycle, handles thrown non-`Error` values,
  prefers the outermost specific message.
- `poll-ocr-results.test.ts` — 4 new cases: the 404 names request id and model;
  the 404 names `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`; a 500 gets no
  model-mismatch hint; and the result's keys are exactly
  `["ocrResponse", "status"]` — the test that would have caught the phantom port.

### Wider suites

```
$ cd apps/temporal && npx jest src/activities src/graph-engine src/cache
Test Suites: 66 passed, 66 total
Tests:       713 passed, 713 total

$ cd apps/temporal && npx tsc --noEmit -p tsconfig.json
TSC_EXIT=0

$ cd apps/backend-services && npx jest src/workflow/graph-schema-validator.spec.ts \
      src/workflow/migrate-graph-config-ocr-refs.spec.ts \
      src/workflow/shipped-template-library-refs.spec.ts
Test Suites: 3 passed, 3 total
Tests:       59 passed, 59 total
```

**Pre-existing failure, not mine:** `apps/temporal/src/graph-workflow.test.ts`
fails 32 tests. Verified by `git stash`ing every change and re-running on the
clean tree — same 32 failures, same empty messages (suite-level, environmental).
Untouched by this work.

### Live runs, after the fix

**Green path** — `workflow-id verify-poll-green`:

```
poll activity result -> {"status":"succeeded","ocrResponse":{"documentId":"13e0338e…",
                         "blobPath":"…/azure-response.json","storage":"blob",
                         "status":"succeeded","byteLength":7553}}

final status:    completed
completed nodes: 9
refs present:    ['cleanedResultRef', 'ocrResponseRef', 'ocrResultRef']
```

`ocrResponseRef` is present — it was absent on the identical run before the fix.
The Poll OCR step now has a real output to preview, which is what GALLERY step 9
asks the reader to click.

**Failure path** — `workflow-id verify-poll-404`, the same model-mismatch that
produced dbarkowsky's symptom. `getNodeStatuses` — the exact map the canvas renders —
now returns:

```
pollOcrResults -> Failed to poll OCR results. Status: 404 No analyze result
"e8387e24-35ef-474b-ac89-c1afb89ef797" under model "prebuilt-layout". An analyze
result belongs to the model it was submitted with, so check that this step polls
the SAME model id the Submit OCR step used, and that
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT points at the resource the document was
submitted to. Azure also discards analyze results after 24 hours.
```

Before: `"Activity task failed"`.

---

## 5. What a developer needs set up (D5 overlaps this)

Not fabricated fixes — these are the real environment requirements a
developer must satisfy before the Standard OCR Workflow can run. All three
were needed on this box.

1. **Generated Prisma clients must match the schema.** After any pull that
   touches `apps/shared/prisma/schema.prisma`, run migrations as normal and
   then, from `apps/backend-services`, `npm run db:generate`. The generated
   directories are gitignored, so a stale client is invisible in `git status`
   and fails at the first cached activity node with
   `Cannot read properties of undefined (reading 'findUnique')`.
2. **Azure Document Intelligence credentials.** `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`
   and `AZURE_DOCUMENT_INTELLIGENCE_API_KEY` in the Temporal worker's
   environment. Without them the run stops at **Submit OCR** with a message
   naming both variables. There is no code fix needed here — the message is
   already correct and actionable.
3. **The OCR model must exist in that resource.** The seeded Standard OCR
   Workflow ships `modelId: "sdpr_synth_test"`, a **custom trained model**, not
   an Azure prebuilt. A developer whose endpoint points at a different resource
   gets a 404 at **Submit OCR** naming the model. Either point at the resource
   that holds it, or change the workflow's *OCR Model* setting to a prebuilt
   (e.g. `prebuilt-layout`) — Prepare File's model parameter offers them in a
   combobox.

**Alternative with no Azure account at all:** set `MOCK_AZURE_OCR=true` in the
worker environment. Submit and Poll both short-circuit to canned responses
(`submit-to-azure-ocr.ts:88`, `poll-ocr-results.ts:88`) and the whole workflow
runs green, which is enough to walk GALLERY steps 8–10.

---

## 6. Residual finding, not fixed here

**`modelId` reaches Submit and Poll by two independent routes**, and nothing
keeps them equal:

- Submit's model comes from `nodes.prepareFileData.parameters.modelId` (a static
  node parameter; `file.prepare`'s catalog entry declares `modelId` as a
  *parameter*), threaded through `PreparedFileData.modelId`.
- Poll's model comes from `ctx.modelId` (an *input port*, per `azureOcr.poll`'s
  catalog entry), defaulted from the workflow's ctx declaration.

On `develop` both read `ctx.modelId`, so they could not disagree — the split
arrived with `fc255284e`. The workflow's exposed *OCR Model* parameter now edits
only the first of the two. Anything that moves one and not the other (editing
the exposed param, a benchmark override, an `initialCtx.modelId`) puts Submit
and Poll on different models and produces exactly the 404 reproduced in §1d.

Both seeded values are currently `sdpr_synth_test`, so the default path is safe
and this is latent rather than live. The proper fix is for Submit to *return*
the model it used and for Poll to bind from that — one source of truth — which
means a new catalog output on `azureOcr.submit` plus template rewiring. That is
a larger change than D1 warrants and is recorded here rather than smuggled in.
The improved 404 message names the mismatch explicitly, so if anyone does trip
it they are told what happened rather than left guessing.

---

## 7. Walkthrough status

- **Step 9 (reading results) — unblocked.** The workflow completes end to end,
  and the Poll OCR step now writes `ocrResponseRef`, so it has a result to open.
- **Step 10 (run history) — unblocked.** Completed runs are in history and
  replayable; the run used above (`verify-poll-green`) is one.
- **D1 / D2 —** the code defects are fixed and the diagnosis surface is fixed.
  The remaining reason a given developer sees Poll OCR fail is environmental,
  and the product now says which one.
