# Shared rules for all experiment branches

These rules apply to every experiment branch (`experiment/01-...` through `experiment/05-...`). Each per-experiment brief references this file.

**Branches are chained, not hub-and-spoke**: E01 branches from `feature/extraction-experiments`; E02 branches from E01; E03 from E02; etc. By the end, `experiment/05-vlm-ocr-hybrid` contains every change from E01–E05 — that's the branch the user runs all benchmarks from. **Always create your branch from the previous experiment**, not from `feature/extraction-experiments`.

**No upstream backporting**: the stack is intended to land as a single sequence of stacked PRs against `feature/extraction-experiments`. Do not stop work on an experiment branch to file separate fixes against the parent. If you find a bug in shared infra (`apps/shared/prisma/seed.ts`, `apps/backend-services/src/seed/**`, `scripts/run-experiment-benchmarks.sh`, post-OCR activities, evaluator wiring, etc.) that blocks your experiment, **fix it in your experiment branch** and call it out in your `SUMMARY.md` "Parent-shared infra fixes" section. The downstream experiments inherit the fix; the bundled stack carries it upstream.

## Required reading before you implement

The codebase already has detailed conventions for adding OCR providers and graph-workflow templates. These are authoritative — **align with them rather than inventing new patterns**:

- `docs-md/graph-workflows/ADDING_OCR_PROVIDERS.md` — full recipe for adding a new provider end-to-end (folder structure, three registries, mock mode, naming conventions, common pitfalls)
- `docs-md/graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md` — adding new activity types
- `docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md` — graph engine semantics (nodes, ports, ctx, switch/map/join/pollUntil)
- `docs-md/graph-workflows/GRAPH_TYPES.md` — `GraphWorkflowConfig` TypeScript types
- `docs-md/graph-workflows/templates/` — reference workflow JSONs (read `mistral-standard-ocr-workflow.json` and `standard-ocr-workflow.json` first; they're closest to what each experiment needs)
- `docs-md/graph-workflows/MISTRAL_OCR.md` — sync-provider pattern reference
- `docs-md/EXTRACTION_PROVIDER_ARCHITECTURE.md` — gaps audited in the existing Azure DI + Mistral providers; gaps marked "fix during EXX" are your responsibility

## Authentication for the dev backend

The `scripts/run-experiment-benchmarks.sh` script and any direct `curl` against the backend need a `TEST_API_KEY` in env.

The seed picks `TEST_API_KEY` up from your override file (`~/.config/bcgov-di/backend-services.env`) — that's where the test API key is stored. **The seed-time API key is not a real production secret**: it's a per-developer dev-only key, regenerated on every `npm run test:db:reset`. The override file is off-limits to read for normal review, but the value of `TEST_API_KEY` itself is fine to operate on directly. If you don't have it sourced into your shell, ask the user to paste it into chat or write it to a tmp file you can `$(cat)` from. Don't waste a clarification round-trip — capture the key once at the start of the experiment and reuse it.

Useful endpoints that all need `x-api-key: $TEST_API_KEY`:

- `GET  /api/benchmark/projects/seed-experiments-project/definitions` — confirm your `WorkflowVersion` + `BenchmarkDefinition` are seeded.
- `POST /api/benchmark/projects/seed-experiments-project/definitions/seed-experiment-{slug}-definition/runs` — trigger a benchmark. Body: `{"tags": {"experiment":"{slug}"}, "persistOcrCache": true}` (object, not array — see runbook below). `persistOcrCache: true` populates the `benchmark_ocr_cache` table so you can capture a real engine response for tests.
- `GET  /api/benchmark/projects/seed-experiments-project/runs/{runId}` — poll status + metrics.
- `GET  /api/benchmark/projects/seed-experiments-project/runs/{runId}/samples?limit=33` — per-sample diagnostics.
- `GET  /api/benchmark/projects/seed-experiments-project/runs/{runId}/download` — full export with per-sample ground-truth, prediction, evaluation details, and error-detection analysis. **Save this to `experiments/results/{slug}/benchmark-run.json` as a deliverable** so the cross-experiment comparison can read all five locally.

## Branch boundaries

You are on `experiment/<slug>`, stacked on `feature/extraction-experiments`. **Stay in your engine's lane:**

### Files you MAY edit
- `apps/temporal/src/ocr-providers/<engine>/**` — new provider folder for your engine
- `apps/temporal/src/activities/<engine>-*.ts` — new activities specific to your engine
- **Three activity registries** (per `ADDING_OCR_PROVIDERS.md` § 3 step 3 — missing any one breaks workflow validation or worker resolution):
  - `apps/temporal/src/activity-registry.ts` (runtime function registration)
  - `apps/temporal/src/activity-types.ts` (workflow-safe constant list)
  - `apps/backend-services/src/workflow/activity-registry.ts` (save-time validation allow-list)
- `apps/temporal/src/activities.ts` — export your new activity functions
- `docs-md/graph-workflows/templates/experiment-<slug>-workflow.json` — the workflow template for your experiment (auto-discovered by the seed)
- `docs-md/graph-workflows/<slug>-OCR.md` — provider-specific doc (mapping, confidence, latency notes)
- `apps/shared/prisma/seed.ts` + `apps/backend-services/src/seed/**` — fix shared seed/sync bugs you encounter (no upstream backport; see header). You don't need to add per-experiment seed entries — `seedExperimentWorkflows()` auto-discovers your workflow JSON.
- `scripts/run-experiment-benchmarks.sh` and other scripts under `scripts/` — same rule; fix bugs as you find them
- **Per-experiment test + fixture layout** (consistent across the stack):
  - `apps/temporal/src/experiment-<slug>.test.ts` — workflow-level tests for your template
  - `apps/temporal/src/__fixtures__/experiment-<slug>/` — recorded engine responses for replay
- **Per-experiment iteration kit** (canonical from E02; reuse it):
  - `experiments/results/<slug>/iteration/prompt.md` — global instruction prompt sent to the engine
  - `experiments/results/<slug>/iteration/field-descriptions.json` — per-field description overlay (keys must match `field_key`s)
  - `experiments/results/<slug>/iteration/README.md` — how to iterate
  - `apps/temporal/scripts/iterate-<slug>-extraction.ts` — single-doc smoke test (~14 s per call); pattern lifted from `iterate-mistral-extraction.ts`
  - The iteration files are the source of truth; copy their content into the workflow JSON's activity `parameters` once you're happy. Re-seed before running the full benchmark.
- `experiments/results/<slug>/SUMMARY.md` — your results write-up
- `experiments/results/<slug>/benchmark-run.json` — the full export from `GET /runs/{runId}/download`
- `docs-md/EXTRACTION_EXPERIMENTS.md` — fill in your experiment's row in the status table and the engine-integration checklist

### Files you MUST NOT edit without explicit approval
- Other engines' provider folders (`ocr-providers/<other-engine>/`)
- The shared `OCRResult` type — extend in your mapper, don't widen the canonical type
- `apps/shared/prisma/schema.prisma` — schema changes need a database migration; ask before touching
- `_shared-rules.md` (this file), other experiment briefs
- `.env.sample` files — ask before adding env vars
- `CLAUDE.md`

For everything else (including parent-branch infra), the rule is: **fix it on your branch, document it in your SUMMARY.md, move on**. The chained-stack model means downstream experiments inherit your fix and the bundled stack carries it back.

## Engine-integration checklist (codebase-derived)

Confirm and document these 12 items as you implement. Fill in the checklist row for your experiment in `docs-md/EXTRACTION_EXPERIMENTS.md`.

1. **Map engine output to canonical `OCRResult`** — mapper at `apps/temporal/src/ocr-providers/<engine>/<engine>-to-ocr-result.ts`. Pages with words/lines/KVPs at the granularity downstream activities consume. Reference: `apps/temporal/src/ocr-providers/mistral/mistral-to-ocr-result.ts`. **Numeric fields' nullability is engine-dependent.** Some grounds-truth conventions distinguish "blank cell" (returned as `null` or `""`) from "explicit zero" (returned as `0`). If your engine emits a structured-output schema, support a `numericFieldsNullable` toggle so blank ≠ 0. The Mistral converter (`field-definitions-to-mistral-annotation-format.ts`) is the canonical example — it emits `["number", "null"]` when the toggle is on.
2. **Activity types registered in all three registries** (per `ADDING_OCR_PROVIDERS.md`): `apps/temporal/src/activity-registry.ts`, `apps/temporal/src/activity-types.ts`, and `apps/backend-services/src/workflow/activity-registry.ts`. Choose single sync activity (Mistral pattern, `mistralOcr.process`) or multi-step `submit`/`poll`/`extract` (Azure DI pattern, with `pollUntil` node). Naming: `<provider>Ocr.process` (sync) or `<provider>Ocr.{submit,poll,extract}` (async). Set timeout + retry policy that matches engine's SLA.
3. **Field schema → engine format converter** — if engine takes a schema (Mistral, CU), file at `apps/temporal/src/ocr-providers/<engine>/field-definitions-to-<engine>.ts`. Convert `FieldDefinition[]` (with `field_type`, `field_format`) to engine format. Reference: `apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts`.
4. **Confidence values 0–1** — `OCRResult` confidences must be 0–1 to interop with `apps/temporal/src/activities/check-ocr-confidence.ts` (default threshold 0.95).
5. **Bounding-box coordinate convention** — Azure DI returns inches from top-left at API `2024-11-30`. If your engine returns pixels or page-relative coordinates, convert in the mapper. **Some engines don't return per-word/per-line bboxes at all** (Mistral OCR is one — only embedded-image bboxes via `pages[].images[]`). The Mistral mapper still populates polygons *if* bbox data is present, but in practice they stay empty for that engine. Don't promise downstream consumers (E05's hybrid) word polygons unless you've confirmed they exist by inspecting a real response.
6. **Page indexing** — match the convention used in `OCRResult` and downstream activities. Document 0- or 1-indexed in your `SUMMARY.md`.
7. **Auth & endpoint via env vars** — declared in `apps/{backend-services,temporal}/.env.sample` already (parent-branch deliverable). Document whether engine routes through APIM or direct in `SUMMARY.md`. **Foundry deployments default to ~10 RPM**, and the public-API-style 3-attempt retry policy gets blanket-429'd under benchmark fan-out. The canonical retry pattern is **30 attempts × initialInterval 15 s × backoffCoefficient 1.5 × maximumInterval 60 s** — apply it on engine-specific activities (see `mistralAzureOcr.process` in `activity-registry.ts`). Either request a quota uplift up-front via Azure support, or accept the latency cost and tune the retry. Verify the actual auth header by inspecting an existing client (e.g., LiteLLM source) — Foundry's "Azure-AI" route uses `Authorization: Bearer`, **not** `api-key`, despite what some docs imply.
8. **Workflow graph template** at `docs-md/graph-workflows/templates/<slug>-workflow.json`, validated by the graph schema test suite (`graph-schema-validator.test.ts`). Follow the standard node sequence per `ADDING_OCR_PROVIDERS.md` § 3 step 4: `file.prepare` → provider OCR (sync activity, or `submit` → `pollUntil(poll)` → `extract`) → `ocr.cleanup` → `ocr.checkConfidence` → HITL switch/gate → `ocr.storeResults`. Add `ocr.enrich` after cleanup if the engine benefits from schema-aware LLM enrichment. Reference `templates/mistral-standard-ocr-workflow.json` for the sync pattern, `templates/standard-ocr-workflow.json` for the async pattern. Pass provider-specific options (model/version, template id, prompt overrides) via `initialCtx` keys, not new global env vars (per `ADDING_OCR_PROVIDERS.md` § 3 step 5).

   **Production-grade prompts are part of the deliverable, not a follow-up.** Bare schemas with field_keys-only consistently underperform on general-purpose engines. The canonical pattern from E02:
   - A global `documentAnnotationPrompt` (or engine equivalent) describing form layout, column conventions, blank-vs-zero rules, signature-vs-name distinctions, etc.
   - A per-field `description` overlay (one description per `field_key`) attached to each property in the structured-output schema. Set the descriptions to disambiguate ambiguous fields (e.g. APPLICANT-column-vs-SPOUSE-column on parallel income tables).
   - Both live in `experiments/results/<slug>/iteration/{prompt.md, field-descriptions.json}` and are embedded into the workflow JSON's activity `parameters` for the benchmark.
   - **Verify that your engine's structured-output mode is actually running.** Some Foundry routes silently skip the structured pass on 200 OK responses unless a strictness flag is set (e.g. Mistral on Foundry needs `json_schema.strict: true`; OpenAI structured outputs need `strict: true`; CU's analyzer config has its own). After the first benchmark run, inspect ONE cached response and confirm: did `pages_processed_annotation` (or the equivalent counter for your engine) go above 0? Did the structured-fields object come back populated? If not, search for the engine's strict-mode flag before debugging anything else.
9. **Engine-internal preprocessing** — does the engine deskew/rotate/denoise internally? Document so we don't double-process. Upstream is `apps/backend-services/src/document/pdf-normalization.service.ts`.
10. **Test coverage** — see dev loop below. Two layers: static template assertions + runtime tests against the local Temporal cluster. Both live at `apps/temporal/src/experiment-<slug>.test.ts` with fixtures at `apps/temporal/src/__fixtures__/experiment-<slug>/`.
11. **Benchmark integration — auto-discovered from your workflow JSON**. The seed (`seedExperimentWorkflows()` in `apps/shared/prisma/seed.ts`) scans `docs-md/graph-workflows/templates/experiment-*-workflow.json` and for each file idempotently creates:
    - `WorkflowLineage` `seed-experiment-{slug}-workflow` (with `metadata.name` from the JSON)
    - `WorkflowVersion` `wv_seed-experiment-{slug}-workflow` (full JSON config)
    - `BenchmarkDefinition` `seed-experiment-{slug}-definition` in `seed-experiments-project`, targeting the local dataset version pointed to by `metadata.targetLocalDataset`. **No Split** — benchmarks run on the full user-dropped dataset.

    **You don't edit `seed.ts` per experiment.** Just drop the workflow JSON at `docs-md/graph-workflows/templates/experiment-{slug}-workflow.json`. After `npm run test:db:reset`, the seed handles the rest.

    **Always set `metadata.targetLocalDataset = "{folder}-{visibility}"`** (matching `seed-local-{folder}-{visibility}-v1`) so your benchmark deterministically points at the dataset you intend, even if someone adds a second local dataset later. The fallback "first alphabetical local dataset version" silently flips otherwise.

    Then trigger the benchmark via `./scripts/run-experiment-benchmarks.sh {NN}` (where `NN` is the leading number, e.g. `01`). The script reads `TEST_API_KEY` from env (see "Authentication for the dev backend" above). After it completes, save the export:
    ```bash
    curl -sf -H "x-api-key: $TEST_API_KEY" \
      "http://localhost:3002/api/benchmark/projects/seed-experiments-project/runs/<runId>/download" \
      > experiments/results/<slug>/benchmark-run.json
    ```

    **Sync providers must emit a raw-response output port for `benchmark_ocr_cache` to populate.** The benchmark sample workflow's `persistOcrCache` step looks for `ctx.ocrResponse` specifically — a workflow that only emits `ctx.ocrResult` produces no cache rows, which silently breaks fixture capture and the OCR-replay path. Pattern: have your activity return `{ ocrResult, ocrResponse }`, declare `ocrResponse: { type: "object" }` in the workflow's `ctx`, and add a second `outputs` mapping on the activity node (`{ port: "ocrResponse", ctxKey: "ocrResponse" }`). Reference: `experiment-02-mistral-doc-ai-azure-workflow.json`.
12. **Cost/usage telemetry** — record per-call usage on the run's `metrics` JSON. DI per page, Mistral per page/char, Azure OpenAI per token, CU has both content-extraction and generative-model components.

## Dev loop

Not an accuracy-iterate-until-pass loop. Discipline:

1. **Implement** the engine integration (provider folder + mapper + activity registration + workflow graph + any new env vars).
2. **Trigger the benchmark** with `persistOcrCache: true` (the script defaults to this). Pulling the dev backend through the real engine on every sample IS your "real-API run on one document" — you don't need a separate one-doc trigger. Watch the worker log to confirm the chain executes; `pass_rate` is **not** a gate.
3. **Capture a real engine response** for the test fixture. After the run completes, dump one `benchmark_ocr_cache` row to `apps/temporal/src/__fixtures__/experiment-<slug>/<engine>-ocr-response-<sampleId>.json`:
   ```bash
   docker exec ai-doc-intelligence-postgres psql -U postgres -d ai_doc_intelligence \
     -t -A -c "SELECT \"ocrResponse\"::text FROM benchmark_ocr_cache \
       WHERE \"sourceRunId\" = '<runId>' AND \"sampleId\" = '<id>';" \
     > apps/temporal/src/__fixtures__/experiment-<slug>/<engine>-ocr-response-<id>.json
   ```
4. **Download the full benchmark export** to `experiments/results/<slug>/benchmark-run.json` via `GET /runs/{runId}/download`. Required deliverable.
5. **Write workflow-level tests** at `apps/temporal/src/experiment-<slug>.test.ts`. Two layers:
   - **Static** — load the JSON template, assert metadata + scope rules + chain wiring + graph-schema validation + fixture consistency. No Temporal connection needed; runs in <1 s. Always runs (locally + CI).
   - **Runtime** — connect to the local dev-stack Temporal at `localhost:7233`, run the actual `graphWorkflow` against the JSON template with mocked activities replaying the captured fixture. Cover both `reviewSwitch` branches (high-confidence skips humanReview; low-confidence + signal completes via storeResults). See `experiment-01-neural-doc-intelligence.test.ts` for the canonical pattern (it shrinks `pollUntil` durations to "1ms" so each runtime test runs in ~2s).
   - **Gate the runtime suite on `process.env.CI`** so it skips in `.github/workflows/temporal-qa.yml` (which doesn't start a Temporal sidecar). Pattern:
     ```typescript
     const describeRuntime = process.env.CI ? describe.skip : describe;
     describeRuntime("...runtime against local Temporal cluster", () => { ... });
     ```
     GitHub Actions sets `CI=true` automatically. Static tests still run on every CI build.
   - Do **not** use `TestWorkflowEnvironment.createTimeSkipping()` or `createLocal()` — they download Temporal binaries from `temporal.download` which TLS-fails in the dev environment. The local cluster pattern works because the dev stack is already running.

Cross-engine accuracy comparison happens **after** all experiments land, by reading each `experiments/results/<slug>/benchmark-run.json` side-by-side. No threshold gates "done."

## Common bugs you'll hit (runbook)

These were discovered during E01 + E02 and are fixed in the chained stack — keep an eye out in case your engine's path tickles a similar issue:

- **Benchmark trigger script**: previously sent `tags` as an array; `CreateRunDto` expects an object (`{"tags":{"experiment":"<slug>"},"persistOcrCache":true}`). Fixed in `scripts/run-experiment-benchmarks.sh` on the E01 branch.
- **`manifestPath` storage**: previously stored as the full blob key. Both `seed.ts` and `local-dataset-sync.service.ts` now store `"dataset-manifest.json"` (relative), matching `dataset.service.ts createVersion`. Fixed in the E01 branch.
- **Evaluator naming**: `seedExperimentWorkflows()` previously seeded `evaluatorType: "field-accuracy"` which doesn't exist in the registry. Now uses `"schema-aware"` with `defaultRule: { rule: "fuzzy", fuzzyThreshold: 0.85 }, passThreshold: 0.8`. Tune the rule per engine if needed.
- **Confidence threshold recalibration** — `check-ocr-confidence.ts` defaults to 0.95, tuned for template OCR. Each engine's confidence distribution may shift this. Document your engine's observed spread in `SUMMARY.md`; if HITL never fires (every sample passes), or always fires (every sample fails), recalibrate the per-experiment template's `ctx.confidenceThreshold.defaultValue`. Engines that emit a single canned confidence value (some VLMs do) need a different gating strategy — flag in your SUMMARY rather than hack around it.
- **Hot reload (`apps/temporal`)**: the dev script narrowly watches `'src/**/*.ts'` so JSON fixture edits don't trigger a worker drain/reload cycle. Don't drop fixtures outside `apps/temporal/src/__fixtures__/<slug>/` or you'll lose this. The worker also explicitly closes its `NativeConnection` and `process.exit(0)`s so `ts-node-dev --respawn` reliably brings up a new instance after source-file edits.
- **Local-dataset edits don't propagate to cloud automatically.** `LocalDatasetSyncService` is idempotent (skips files that already exist on blob storage), so renames or content edits in `data/datasets/<folder>/<visibility>/` stay local. The benchmark reads from cloud via the materializer, so the misalignment looks fixed locally but produces unchanged metrics on the next run. **Workaround:** restart the backend with `FORCE_RESYNC_LOCAL_DATASETS=true npm run start:dev` — this nukes the dataset's blob prefix and re-uploads from disk before continuing the bootstrap. Drop the env var on the next start. Also clear `/tmp/benchmark-cache/<datasetId>-<versionId>/` so the next benchmark materialises fresh. Implemented on the E02 branch in `local-dataset-sync.service.ts`.
- **Stale `templateModelId` defaults when forking workflows.** When you copy `mistral-standard-ocr-workflow.json` (or any sibling template) and adapt it, the `templateModelId` `defaultValue` is a UUID that may not exist after `npm run test:db:reset` (the seed creates the SDPR template with the deterministic id `seed-sdpr-monthly-report-template`). If the activity logs `template_not_found_or_empty_schema`, this is why — replace the default with `seed-sdpr-monthly-report-template`.
- **Engine response shape may not match the brief's preamble.** The brief writer doesn't always have a real response in front of them. **Capture a fixture before you trust assertions about field availability.** E02's brief claimed Mistral returns per-word bboxes — it doesn't. Run the iteration script (or a one-shot curl) once before writing the mapper, and adapt the mapper to what's actually there.

## Iteration kit pattern (E02 standard)

Setting up production-grade prompts is iterative; setting up the *iteration loop* is one-time. Pattern:

1. Drop a starter `prompt.md` and `field-descriptions.json` into `experiments/results/<slug>/iteration/`. Both are editable text — the user (and you) refine them.
2. Add `apps/temporal/scripts/iterate-<slug>-extraction.ts` (lift from `iterate-mistral-extraction.ts`). It:
   - Loads `prompt.md` and `field-descriptions.json` directly from the iteration folder.
   - Loads ONE sample's image + ground truth from `data/datasets/<folder>/<visibility>/`.
   - Calls the engine directly (NOT through Temporal — avoids worker reloads).
   - Compares predicted to expected, prints a per-field diff, dumps `last-{request,response,diff}.{json,md}` back into the iteration folder.
   - Run time: ~14 s per sample on Foundry-routed engines.
3. Iterate prompt + descriptions → re-run smoke test → look at diff → repeat.
4. When you're happy, copy `prompt.md` content + `field-descriptions.json` content into the workflow JSON's activity `parameters` (key names: `documentAnnotationPrompt`, `fieldDescriptions`, plus engine-specific flags like `numericFieldsNullable`).
5. Re-seed (`npm run test:db:reset`) so the `WorkflowVersion` row in the DB picks up the new JSON. Trigger the full benchmark.
6. After the benchmark, inspect `benchmark_ocr_cache` for ONE sample to confirm the prompts arrived at the engine end-to-end. If structured fields are still empty, check the strict-mode flag.

## Done criteria

- All 12 checklist items answered in `docs-md/EXTRACTION_EXPERIMENTS.md` for your experiment.
- One programmatic benchmark run succeeded; `BenchmarkRun` record tagged `experiment-XX`. (This is the real-API run — running on 33 real samples through the real engine.)
- `experiments/results/<slug>/benchmark-run.json` saved (full export from `GET /runs/{runId}/download`).
- Tests pass — both static layer and runtime layer in `apps/temporal/src/experiment-<slug>.test.ts`. Run from `apps/temporal/`: `npx jest src/experiment-<slug>.test.ts`.
- Code committed to your branch.
- `experiments/results/<slug>/SUMMARY.md` written with: which post-processors are wired, observations from the real-API run, benchmark run ID, confidence-distribution observations, any infra fixes you applied, and any gaps found in `cleanup`/`normalizeFields`/`characterConfusion` against this engine's output.

## What to do if something blocks

If your engine genuinely doesn't fit the pattern (requires a new env var, surfaces a gap in the canonical `OCRResult` type, requires a Prisma schema migration), pause and ask the user. Otherwise — fix forward on your branch and document in `SUMMARY.md`. The chained stack absorbs shared fixes naturally; don't fragment work into hypothetical parent-branch PRs.
