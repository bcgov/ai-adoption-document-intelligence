# Extraction-engine refactor — continuation / handoff

**Purpose:** survive a chat compaction. Pick up the R1/R2/harness work without re-deriving anything.
**Branch:** `fix/extraction-engine-review-followups` (checked out in the **main repo** at `/home/alstruk/GitHub/ai-adoption-document-intelligence`), ~119 commits ahead of `origin/develop`.
**Tracker:** [docs-md/EXTRACTION_EXPERIMENTS_PR_REVIEW.md](EXTRACTION_EXPERIMENTS_PR_REVIEW.md) §5 — 22 items `[x]`, 4 still open: **R1, R2, T4, T6**.

---

## Environment / how to work (verified this session)

- **Local stack is up:** Temporal (`localhost:7233`), the **app Postgres** (docker container `postgres`), **MinIO** blob storage, `temporal-postgresql`. So integration tests can run real activities against real infra.
- **Run an integration test:** from `apps/temporal`, `DATABASE_URL="postgresql://u:u@localhost:5432/placeholder" npx jest src/experiment-05-vlm-ocr-hybrid.test.ts`. They're gated `process.env.CI || !fixtureExists ? describe.skip : describe` — so they run locally (not CI) when the fixture exists.
- **Fixtures:** `apps/temporal/src/__fixtures__/experiment-0{1..5}/…json` (recorded DI layout, VLM/CU/Mistral responses). e.g. `experiment-05/di-layout-1-81.json`, `vlm-hybrid-response-1-81.json`.
- **Prisma client** (gitignored, must regenerate after schema changes): from `apps/backend-services`, `DATABASE_URL="postgresql://u:u@localhost:5432/placeholder" npm run db:generate`.
- **Typecheck:** `npx tsc --noEmit` per app (`apps/temporal`, `apps/backend-services`, `apps/frontend`).
- **Pre-commit hook (lefthook):** runs Biome `check` (NO autofix) + `tsc` + lint. **Always `npx @biomejs/biome check --write <files>` before `git commit`** or the commit fails on formatting.
- **Commit trailer:** end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Safety:** user's pgbackrest WIP is in `git stash@{0}` (branch `fix/pgbackrest-block-incremental`); untracked `data/` moved to `…/scratchpad/data-blockers-backup/`. Pre-refactor backups: tags `backup/e09-prerebase`, `backup/prestack/*`.
- **Do NOT push** without the user asking. PR target for this branch is `experiment/09-sdpr-hitl-committed` (it's a follow-up stacked on the 12 engine PRs).

## Resolved design decisions (do not re-litigate)

- **Test mocking = "mock ONLY paid services."** Run the REAL activities (real conversion, gate, DB writes, blob reads) against real local Temporal+Postgres+MinIO. Stub only the paid API boundary from the recorded fixtures:
  - VLM (`vlm-direct`/`vlm-hybrid`), CU, Mistral all use **raw `axios`** → use **`axios-mock-adapter`** (already a dependency) to intercept the exact HTTP call and return the fixture. Real activity code runs end-to-end.
  - **Azure DI is SDK-based** (`@azure-rest/ai-document-intelligence`), so axios-mock-adapter can't see it → mock via the existing **`MOCK_AZURE_OCR` env-seam** fed the fixture (the activities already short-circuit the SDK call on that flag and still run the downstream real conversion).
  - The current `buildMockActivities` helper (copied in all 5 `experiment-0X.test.ts`) **over-mocks** (whole activities). Replace it with a shared harness that mocks only the paid boundary. Seed a real document row (app Postgres) + upload the image to MinIO per test.
- **R1 ref handoff = option A** (NOT a `blob.read` node — that's not used as a node anywhere and would put the full response in history). `azureOcr.poll` emits an `OcrPayloadRef` (kept small in history); the consumer resolves it internally. **Done** for the hybrid: `vlmOcrHybrid.extract` now accepts `OCRResponse | OcrPayloadRef` and resolves via `loadOcrResponseFromPort` (commit `a19f9ff1`).
- **R2 variant naming:** `variant: "native" | "azure"` — `native` = direct/public Mistral Document-AI API, `azure` = Azure AI Foundry-hosted.

## Key facts / gotchas

- **Activity registration is in 3 source lists + 2 test fixtures** — any add/remove must touch ALL:
  1. `apps/temporal/src/activity-registry.ts` (runtime `register({...})`)
  2. `apps/temporal/src/activity-types.ts` `REGISTERED_ACTIVITY_TYPES` (workflow-safe const)
  3. `apps/backend-services/src/workflow/activity-registry.ts` (backend metadata)
  4. `apps/temporal/src/activity-registry.test.ts` `EXPECTED_ACTIVITY_TYPES` — **now an exact bijection** (W1), so removing/adding a type here is mandatory or the test fails.
  5. `apps/backend-services/src/workflow/activity-registry.spec.ts` `EXPECTED_ACTIVITY_TYPES` (exact `toHaveLength`).
- **Graph templates** live at `docs-md/graph-workflows/templates/experiment-0X-*-workflow.json`. Node format: `nodes` is an **object keyed by id**; each node has `inputs`/`outputs` as `[{port, ctxKey}]` (data flows via ctx keys), plus `timeout`/`retry`/`parameters`.
- **Regular DI path port contract** (from `standard-ocr-workflow.json`):
  - `file.prepare`: out `preparedData`→`preparedFileData`. Accepts/emits `outputFormat` (`prepare-file-data.ts` passes `input.outputFormat`); `submit-to-azure-ocr.ts` reads `fileData.outputFormat === "markdown"` → requests `outputContentFormat: markdown`.
  - `azureOcr.submit`: in `fileData`←`preparedFileData`; out `apimRequestId`→`apimRequestId`.
  - `azureOcr.poll`: in `apimRequestId`,`modelId`,`documentId`; out `response`→`ocrResponseRef` (an `OcrPayloadRef`).
  - `azureOcr.extract` (the model for ref-resolution): takes `ocrResponse: OCRResponse | OcrPayloadRef`, resolves via `isOcrPayloadRef`/`loadOcrResponseFromPort` from `../ocr-payload-ref`.
- **E05 current graph** `experiment-05-vlm-ocr-hybrid-workflow.json`: `prepareFileData → azureDiReadPlain (azureOcr.readPlain) → vlmOcrHybridExtract → postOcrCleanup → checkConfidence → reviewSwitch → (humanReview|storeResults)`. The `vlmOcrHybridExtract` node reads `layoutResponse`←ctx `layoutResponse` and has a big `parameters` block (documentAnnotationPrompt + fieldDescriptions). Edge groups in the JSON: `nodeIds:["prepareFileData","azureDiReadPlain","vlmOcrHybridExtract"]` etc.

---

## Remaining work (the plan the user approved — option A: do all in sequence)

### R1 — remove `azure-di-read-plain`, use the regular DI activity
- [x] `vlmOcrHybrid.extract` accepts `OcrPayloadRef` (commit `a19f9ff1`).
- [ ] Rewire E05 graph JSON: replace the single `azureDiReadPlain` node with `azureOcrSubmit` (`azureOcr.submit`) + `pollOcrResults` (`azureOcr.poll`); chain `prepareFileData → submit → poll → vlmOcrHybridExtract`; map the hybrid's `layoutResponse` input from ctx `ocrResponseRef` (poll's output). Update the edge-group `nodeIds`.
- [ ] Plumb markdown: ensure `prepareFileData` emits `outputFormat:"markdown"` (add an `outputFormat` input mapped from a ctx key set in the workflow input, OR a node parameter — check how other templates set it; none currently do, so likely add it to the E05 workflow input/ctx).
- [ ] Delete `apps/temporal/src/activities/azure-di-read-plain.ts`; remove `azureOcr.readPlain` from the 3 registration lists + the 2 test fixtures (see gotchas). Remove the `azureDiReadPlain` import/registration.
- [ ] Update the E05 test's static graph-schema expectations (it asserts the chain contains `azureOcr.readPlain`); switch to submit/poll. Validate with the integration test.

### R2 — merge the two Mistral activities into one
- [ ] Fold `apps/temporal/src/ocr-providers/mistral-azure/mistral-azure-ocr-process.ts` into the base `apps/temporal/src/activities/mistral-ocr-process.ts` (develop's production activity) behind a `variant: "native" | "azure"` param (native = public Mistral API w/ confidence granularity; azure = Foundry w/ Bearer auth, omit `confidence_scores_granularity`). Keep one registered activity (`mistralOcr.process`); remove `mistralAzureOcr.process` from the 3 lists + 2 fixtures. Rewire the E02 graph + test. Delete the dup file.
- NOTE: this modifies develop's production `mistral-ocr-process.ts` — run E02's integration test (and any develop mistral tests) to validate.

### Integration-test harness — "mock only paid services"
- [ ] Build a shared helper (e.g. `apps/temporal/src/__testlib__/integration-harness.ts`): starts the real Worker against `localhost:7233`, registers the REAL activities, sets up `axios-mock-adapter` to return fixtures for the VLM/CU/Mistral endpoints + `MOCK_AZURE_OCR=true` with the DI fixture, seeds a document row in the app Postgres + uploads the image blob to MinIO.
- [ ] Convert `experiment-0{1..5}-*.test.ts` from `buildMockActivities` to the new harness.
- [ ] **Rerun all 5** integration suites — acceptance gate (workflows actually run with only paid APIs stubbed).

### T4 / T6 (now runnable — Temporal is local)
- [ ] **T4** (`experiment-04-vlm-direct.test.ts` ~407-435): load the real seeded template `field_schema` instead of the `applicant_`/`spouse_` key-name heuristic; tighten the near-vacuous evidence assertion (`> populated/2`).
- [ ] **T6** (`experiment-02-…test.ts` ~156-159): pass `ocrResponse` through the mock so the persist-cache chain is exercised at runtime.

### Finish
- [ ] Tick R1/R2/T4/T6 in the tracker; final full typecheck (3 apps) + rerun the touched unit + integration suites.

---

## This session's commits already on the branch (for reference)
`7151d3e0` B7 · `6fd37eb2` B1 · `2f8f4564` B2/B3 · `2dc3d077` B4/T1 · `db945bfc` B5 · `3b0c45df` B6 · `35cdea3a` E-1/E-2/T3 · `41e79dce` R4 · `7cc96f23` R5 · `02b1c4a9` R3 · `1649facc` W1 · `f09663b5` H1/H2 · `0fb2a67b` H3/H4/H5 · `cb462918` T2/T5 · `01b29365` U1 · `a19f9ff1` R1-step1. Plus `d1560059` the review doc/tracker.
