# Extraction Experiments Suite

## Context

The system currently extracts fields from documents through Azure Document Intelligence (DI) **template** models, with a stack of post-processing activities applied to OCR output. Recently, Mistral OCR was added (against the public Mistral API). We want to compare the existing pipeline against several alternative engines on difficult handwritten forms and pick a production stack.

This spec covers the **parent branch** (`feature/extraction-experiments`) and the **5 stacked experiment branches**. The parent contains shared scaffolding only; each experiment branch contains a single engine integration plus benchmark results.

This branch is stacked on `feature/neural-model-training` (PR #134, currently open). The neural training capability that PR adds is a prerequisite for E01.

## Goals

- Add 5 new extraction approaches as stacked experiment branches, benchmark each against the existing template baseline using the existing `BenchmarkRun` infrastructure.
- Identify the best approach for difficult handwritten forms.
- Inventory and validate the post-processing techniques the user has built (currently scattered across 9 activities).
- Make the Azure OpenAI deployment **selectable per workflow node** (so a single workflow can compare gpt-4o vs gpt-5.5 without redeploying).
- Add a local-folder-based dataset seed convention so the user can drop documents + ground-truth into the repo and have them populated by `npm run db:seed`.

## Non-Goals

- No formal `OcrProvider` interface refactor — providers continue to follow the activity-registry-as-loose-abstraction pattern. Re-evaluate after experiments land.
- No frontend node-parameter editor on the parent branch — the deployment-selection backend plumbing lands here, but the UI control is deferred to E04 (or later).
- No PDF→image rendering activity, no plain-OCR-mode for DI Read, no unified usage/cost block on `OCRResult`, no `confidence_normalized` field on the parent. Each experiment branch adds what it needs.
- No worktrees, no parallel implementation. Experiments run sequentially on stacked branches.
- No production rollout plan. This is a research suite; production decisions follow benchmark results.

## Stacking

```
develop
  └── feature/neural-model-training         (PR #134, open — neural training capability)
      └── feature/extraction-experiments    (this branch — shared scaffolding)
          ├── experiment/01-neural-doc-intelligence
          ├── experiment/02-mistral-doc-ai-azure
          ├── experiment/03-azure-content-understanding
          ├── experiment/04-vlm-direct
          └── experiment/05-vlm-ocr-hybrid
```

PR strategy: each experiment opens its own draft PR targeting the parent. Parent PR targets `feature/neural-model-training`. The whole stack rebases onto develop once #134 merges.

## Parent-branch deliverables

### 1. Brief library at `experiments/briefs/`

Each brief is a markdown checklist I follow when implementing that experiment. The shared rules are appended to every brief by reference.

- `_shared-rules.md` — file-edit boundaries, the codebase-derived engine-integration checklist (below), the dev loop, result-storage conventions
- `01-neural-doc-intelligence.md`
- `02-mistral-doc-ai-azure.md`
- `03-azure-content-understanding.md`
- `04-vlm-direct.md`
- `05-vlm-ocr-hybrid.md`

#### Engine-integration checklist (derived from this codebase)

Every new engine integration confirms and documents these items, each tied to actual files / patterns in our codebase:

1. **Map engine output to canonical `OCRResult`** — mapper at `apps/temporal/src/ocr-providers/<engine>/<engine>-to-ocr-result.ts` (Mistral has the reference implementation). Must produce pages with words/lines/KVPs at the granularity downstream activities expect.

2. **Activity-type registration in `apps/temporal/src/activity-registry.ts`** — choose single sync activity (Mistral pattern) or multi-step `submit`/`poll`/`extract` (Azure DI pattern). Set timeout + retry policy that matches engine's SLA.

3. **Field schema → engine format converter** — if the engine accepts a schema (Mistral, CU), file at `apps/temporal/src/ocr-providers/<engine>/field-definitions-to-<engine>.ts`. Convert the DB's `FieldDefinition[]` (with `field_type`, `field_format`) to engine format.

4. **Confidence values on a 0–1 scale** — `OCRResult` confidences must be 0–1 to interop with `apps/temporal/src/activities/check-ocr-confidence.ts` (default threshold 0.95) and downstream HITL routing.

5. **Bounding-box coordinate convention** — match what post-processing activities consume. Azure DI returns inches from top-left at API `2024-11-30`. Other engines return pixels / page-relative — convert in the mapper.

6. **Page indexing convention** — match the indexing used in `OCRResult` and in `apps/temporal/src/activities/ocr-normalize-fields.ts`. Document 0- or 1-indexed.

7. **Auth & endpoint via env vars** — declare in `apps/{backend-services,temporal}/.env.sample`. Document whether engine is routed through APIM (`api.gov.bc.ca`) or direct (`*.cognitiveservices.azure.com` / similar). Existing app routes Azure DI through APIM; experiments use direct access.

8. **Workflow graph definition** — provide a graph-workflow JSON that wires the engine + applicable post-processing nodes (`ocr.cleanup`, `ocr.spellcheck`, `ocr.characterConfusion`, `ocr.normalizeFields`, `ocr.enrich`, `ocr.checkConfidence`, `ocr.storeResults`). Persist via the dataset seed extension or the workflow CRUD API.

9. **Engine-internal preprocessing acknowledgment** — does the engine deskew / rotate / denoise internally? If yes, document so we don't double-process. The existing PDF normalization at `apps/backend-services/src/document/pdf-normalization.service.ts` is the upstream step every engine receives.

10. **Test coverage** — see the dev loop below: one real-API integration test on bring-up, then mock-based workflow tests once stable.

11. **Benchmark integration** — run via the existing `BenchmarkRun` flow against a seeded `Dataset`. Tag the run with `experiment-XX`. Use the existing benchmark API endpoint (user provides the API key for programmatic runs).

12. **Cost/usage telemetry** — record per-call usage on the run's `metrics` JSON. Engines have different shapes: DI bills per page, Mistral per page/char, Azure OpenAI per input/output token, CU has both content-extraction and generative-model components.

#### Dev loop per experiment

Per the user's clarification — this is **not an accuracy-iterate-until-pass loop**. The discipline is:

1. **Implement** the engine integration (provider folder + mapper + activity registration + workflow graph + env vars).
2. **Run the workflow on one real document** via the real API. Confirm it produces an `OCRResult` end-to-end with no errors.
3. **Run a benchmark programmatically** via the backend's benchmark API endpoint against the seeded dataset. Confirm results land in `BenchmarkRun` with metrics filled in.
4. **Stable point reached** when steps 2 and 3 succeed without manual intervention.
5. **Write Jest tests that mock the engine API** (record actual responses once, replay in tests) and verify the workflow runs correctly against the mocks. These tests live in `apps/temporal/src/ocr-providers/<engine>/__tests__/` (or alongside).

Accuracy comparison across engines happens **after** all experiments land, by reading their `BenchmarkRun` records side-by-side. No threshold gates an experiment's "done" status — only the dev-loop steps 1–5.

### 2. Experiment hub doc at `docs-md/EXTRACTION_EXPERIMENTS.md`

Index of experiments with status table, how to run each, where results live in the existing `BenchmarkRun` system.

### 3. Provider architecture assessment at `docs-md/EXTRACTION_PROVIDER_ARCHITECTURE.md`

Documents current state (activity-registry, no formal interface, divergent lifecycles) and the explicit decision to defer formalization. Each new engine adds its folder under `apps/temporal/src/ocr-providers/<name>/` following the Mistral pattern.

**Audit of existing providers against the engine-integration checklist.** Per the user's ask ("check if any considerations were missed when adding new OCR engines"), this doc audits both existing providers — Azure DI (template models) and Mistral (public API) — against the 12-item codebase-derived checklist. Each gap found is captured as either:

- A small fix on the parent branch (if it's a documentation gap or a missed mapper concern that affects all engines)
- A scoped TODO inside the experiment brief that is most affected (if it's specific to that engine's flow)

Expected gaps to surface (not exhaustive):

- Mistral's confidence values may not all be 0–1 calibrated against `check-ocr-confidence.ts`'s threshold semantics — confirm during audit.
- Cost/usage telemetry isn't recorded today on either provider — fix scope decided during audit.
- Bounding-box coordinate convention is implicit; needs explicit documentation.
- The current Mistral provider's annotation-format converter may not handle all `field_type` / `field_format` permutations — confirm and capture gaps.

The audit is documentation only on the parent. Code fixes for any gaps that block experiments happen on the relevant experiment branch.

### 4. `.env.sample` updates (templates only — never the override file)

Add to `apps/backend-services/.env.sample` and `apps/temporal/.env.sample`:

```
# Azure Content Understanding (Experiment 03)
AZURE_CU_ENDPOINT=
AZURE_CU_KEY=
AZURE_CU_ANALYZER_PREFIX=

# Mistral Document AI on Azure Foundry (Experiment 02)
MISTRAL_DOC_AI_AZURE_ENDPOINT=
MISTRAL_DOC_AI_AZURE_KEY=

# Azure OpenAI deployments allowed for workflow node selection (comma-separated)
# Default deployment AZURE_OPENAI_DEPLOYMENT (existing) is the fallback.
AZURE_OPENAI_DEPLOYMENTS=gpt-4o,gpt-5.5
```

The user redirects `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` / `AZURE_DOCUMENT_INTELLIGENCE_API_KEY` and `AZURE_OPENAI_*` to their personal Azure account by overriding the values in `~/.config/bcgov-di/{backend-services,temporal}.env`. **Claude does not read those files.**

### 5. Workflow-node deployment-selection backend plumbing

Today, `apps/temporal/src/activities/enrich-results.ts:106` reads `process.env.AZURE_OPENAI_DEPLOYMENT` directly. The graph-workflow node-parameter machinery already supports passing arbitrary `parameters: Record<string, unknown>` to activities (`apps/temporal/src/graph-workflow-types.ts:90-96`), and `callAzureOpenAI()` already accepts a `deployment` argument. We just need to thread it.

Changes:

- `apps/temporal/src/activities/enrich-results.ts` — read `params.azureOpenAiDeployment ?? process.env.AZURE_OPENAI_DEPLOYMENT`. Pass through to `callAzureOpenAI()`.
- `apps/backend-services/src/azure/azure-openai.controller.ts` (new) — `GET /api/azure-openai/deployments` returns `{ deployments: string[] }` parsed from `AZURE_OPENAI_DEPLOYMENTS`. Mirrors the existing `GET /api/models` pattern. Full Swagger decorators per `CLAUDE.md`.
- DTO in `apps/backend-services/src/azure/dto/azure-openai-deployments-response.dto.ts`.
- Tests for the new controller; tests for the env-var-respecting deployment override.

UI dropdown deferred to E04 brief.

### 6. Dataset seed feature — local-folder convention

Convention: `data/datasets/<dataset-name>/{public,private}/`

Per dataset folder layout:

```
data/datasets/handwritten-forms-2026/
├── public/
│   ├── manifest.json
│   ├── documents/
│   │   ├── form-001.pdf
│   │   └── form-002.pdf
│   └── ground-truth/
│       ├── form-001.json
│       └── form-002.json
└── private/                    # gitignored
    ├── manifest.json
    ├── documents/
    └── ground-truth/
```

`manifest.json` lists samples and their files. Format matches the existing `ManifestSample` interface in `apps/backend-services/src/benchmark/ground-truth-generation.service.ts`:

```json
{
  "datasetName": "handwritten-forms-2026",
  "templateModelKey": "sdpr-monthly-report",
  "samples": [
    {
      "id": "form-001",
      "inputs":      [{ "path": "documents/form-001.pdf", "mimeType": "application/pdf" }],
      "groundTruth": [{ "path": "ground-truth/form-001.json", "format": "field-key-value-json" }],
      "metadata": { "subset": "handwritten" }
    }
  ]
}
```

Ground-truth file format (`field-key-value-json`): a flat JSON object mapping `field_key` → string value, matching the canonical `FieldDefinition.field_key` from the template model:

```json
{
  "client_name": "JANE DOE",
  "report_month": "2026-04",
  "total_amount": "1234.56"
}
```

Seed extension (`apps/shared/prisma/seed.ts`):

- Scan `data/datasets/`. For each subdirectory, read `public/manifest.json` and (if present) `private/manifest.json`.
- For each manifest, idempotently:
  - Find or create `Dataset` row (by name + group)
  - Create a `DatasetVersion` row, marked `frozen: false` until populated
  - Upload each document file to blob storage at the existing path convention (`OperationCategory.BENCHMARK`)
  - Create a `Sample` row per manifest sample with the blob paths
  - Upload ground-truth JSON to blob; create `DatasetGroundTruthJob` rows with `status: completed` and the ground-truth blob path
- Skip a dataset if it already has rows for that version (idempotent re-runs)
- Log a per-dataset summary at the end

`.gitignore` updates:

```
# Local benchmark data (private subset never committed)
data/datasets/*/private/**
!data/datasets/*/private/.gitkeep
```

`public/` stays tracked. Each existing dataset folder gets a `private/.gitkeep` so the path exists for the seed scanner without committing real samples.

The user drops their documents into either `public/` (when the dataset is shareable) or `private/` (their personal test set). The user said they will tell me where to drop the files — **the spec assumes they drop them inside this convention** before running seed.

## Experiment-branch deliverables (one per branch)

Each experiment branch follows the same shape, executed sequentially:

- New provider folder under `apps/temporal/src/ocr-providers/<engine>/` (or extension of an existing folder)
- Response mapper at `<engine>-to-ocr-result.ts` and (if applicable) field-schema converter at `field-definitions-to-<engine>.ts`
- New activity types registered in `apps/temporal/src/activity-registry.ts`
- A workflow definition (graph) committed to seed, wiring the engine into the existing pipeline alongside applicable post-processing activities
- **Real-API workflow run** end-to-end on at least one document
- **Programmatic benchmark run** via the backend benchmark API against the seeded dataset (user provides API key)
- Once stable, **Jest tests with mocked engine responses** verifying the workflow runs correctly
- Engine-integration checklist (12 items) filled in inside `docs-md/EXTRACTION_EXPERIMENTS.md` for that experiment
- Brief `SUMMARY.md` per experiment in `experiments/results/<slug>/SUMMARY.md` recording: which post-processors are wired, observations from the real-API run, benchmark run ID(s), any gaps found in existing providers during audit

### E01: Neural DI + post-processing inventory

**Branch**: `experiment/01-neural-doc-intelligence`

The neural training capability already lives on `feature/neural-model-training` (PR #134) — this experiment **uses** it. The work is:

1. Audit existing post-processing activities (located by exploration):
   - `post-ocr-cleanup.ts` (Unicode, dehyphenation)
   - `ocr-spellcheck.ts` (dictionary-based)
   - `ocr-character-confusion.ts` (built-in confusion rules + `ConfusionProfile` DB model)
   - `ocr-normalize-fields.ts` (field-format application)
   - `enrichment-rules.ts` (type-aware: trim, char-confusion, date, number)
   - `enrichment-llm.ts` (Azure OpenAI semantic correction)
   - `enrich-results.ts` (orchestrator)
   - `check-ocr-confidence.ts` (threshold routing)
   - `document-validate-fields.ts` (cross-field validation)
2. For each: confirm it works against neural-model output (where neural's output shape differs from template's, document the gap).
3. Build a workflow that wires all applicable post-processors after the neural extraction node.
4. Train a neural model from the seeded dataset's training split.
5. Run a `BenchmarkRun` against the test split. Compare F1-by-field-class against the existing template baseline.
6. Write findings to `experiments/results/01-neural-doc-intelligence/SUMMARY.md`.

### E02: Mistral Document AI on Azure

**Branch**: `experiment/02-mistral-doc-ai-azure`

Existing `apps/temporal/src/ocr-providers/mistral/` calls `https://api.mistral.ai/v1/ocr` (public API). This experiment adds a **parallel** provider `apps/temporal/src/ocr-providers/mistral-azure/` against the existing Foundry deployment `mistral-document-ai-2512` at `strukalex-8338-resource` (eastus2). The public-API path stays intact for fallback comparison.

Differences to handle vs the public API:
- Different endpoint URL shape (`https://<resource>.services.ai.azure.com/models/...` or similar)
- Foundry-style auth header
- Possibly lagging model version vs public API

### E03: Azure Content Understanding

**Branch**: `experiment/03-content-understanding`

Test the Azure Content Understanding **product** (not custom Foundry infrastructure). CU's product surface is: deploy a JSON "analyzer" describing your schema, then submit documents to the analyze endpoint. New provider `apps/temporal/src/ocr-providers/azure-content-understanding/`:

1. On startup (or on first use), POST our canonical schema as a CU analyzer named `${AZURE_CU_ANALYZER_PREFIX}-${templateModelKey}` (idempotent — skip if already exists).
2. Per document: POST to the analyzer's analyze endpoint, poll, fetch result.
3. Map CU's structured output to canonical `OCRResult` shape.

**Architecture verification (per the user's ask).** CU is an OCR-first → generative-AI-extraction product. From Microsoft Learn: "Content Understanding performs machine learning-based OCR ... Azure OpenAI with GPT Vision processes the extracted content, maps it to custom or industry-defined schemas, and generates a structured JSON output." Pricing explicitly separates content-extraction charges (OCR layer) from generative-model token charges (LLM layer). Brief includes the full citation. This confirms the OCR-then-LLM-with-schema pattern that E05 will recreate explicitly.

Auth + endpoint resolved through `AZURE_CU_ENDPOINT` / `AZURE_CU_KEY` (the parent's `.env.sample` declares these; the user puts real values in their override file).

### E04: VLM-direct

**Branch**: `experiment/04-vlm-direct`

Pure VLM. Send the document image directly to a vision model with a structured-output prompt. New provider `apps/temporal/src/ocr-providers/vlm-direct/`. Requires a PDF→image rendering activity (added on this branch, not the parent).

Variants to benchmark:
- Single-pass image + schema → JSON
- Chain-of-thought (CoT): prompt asks model to reason about layout first, then extract
- Self-consistency: 3-pass + majority vote per field

Workflow node parameter `azureOpenAiDeployment` selects the underlying model. By default benchmarks both `gpt-4o` and `gpt-5.5` side-by-side.

### E05: VLM-OCR hybrid

**Branch**: `experiment/05-vlm-ocr-hybrid`

Recreates the Mistral / CU pattern with components we control: Azure DI Read (plain layout, no field extraction) → markdown + bbox annotations → VLM with the original image + the schema. New provider `apps/temporal/src/ocr-providers/vlm-ocr-hybrid/`. Requires a "plain OCR" mode for Azure DI Read (added on this branch).

**Verification of the underlying pattern (per the user's ask).** Mistral Document AI is an OCR-first system: per the Mistral docs, the OCR endpoint produces markdown + bboxes, and the `document_annotation` step runs an LLM over that with a user-provided schema. Azure CU follows the same shape (verified in E03). E05 replicates this pattern explicitly with our own components — DI for the OCR layer, an Azure OpenAI deployment for the LLM-annotation layer.

Variants:
- OCR markdown + image (primary)
- OCR markdown only (no image)
- OCR markdown + bbox spatial hints + image

## Azure resource plan

### Already deployed — use as-is

| Resource | Account | RG | Region | Used by |
|----------|---------|----|----|---------|
| `gpt-4o` deployment (cap 50) | `ai-jobstoreai2846ai731114335138` | `rg-strukalex-7536_ai` | westus | Existing LLM enrichment + E04/E05 baseline |
| `mistral-document-ai-2512` deployment (cap 10) | `strukalex-8338-resource` | `rg-strukalex-8338` | eastus2 | E02 |
| Document Intelligence (AIServices kind) | `ai-jobstoreai2846ai731114335138` | `rg-strukalex-7536_ai` | westus | E01 + E05 (direct, bypassing APIM) |

### To provision now

| Resource | Account | RG | Region | Reason |
|----------|---------|----|----|--------|
| `gpt-5.5` deployment | `ai-jobstoreai2846ai731114335138` | `rg-strukalex-7536_ai` | westus | E04/E05 alternative model; same account as gpt-4o for clean per-node switching |

`gpt-5.5` (model version `2026-04-24`) is the latest 5.x with `chatCompletion: true`. Vision input support is not flagged explicitly in the model capabilities listing but is documented as native for the 5.x family — **we validate this by sending a test image during E04** and switch to `gpt-5.4` (or earlier confirmed-vision variant) if 5.5 rejects images.

### Deferred provisioning (handled at the start of E03)

- Content Understanding analyzer deployment under `strukalex-8338-resource`. The CU service itself is already enabled on that account (it has `allowProjectManagement=true`); deploying analyzers is a runtime call, not infrastructure provisioning.

## TODO captured (not parent-branch work)

- **APIM-vs-direct DI access**: today, the app's existing DI calls go through APIM (`api.gov.bc.ca`). Experiments need direct access (`*.cognitiveservices.azure.com`). Verify the existing DI client code (`apps/temporal/src/activities/submit-to-azure-ocr.ts`, `apps/backend-services/src/template-model/template-model-ocr.service.ts`) doesn't have APIM-specific path manipulation that breaks under direct access. Capture as a TODO inside `experiments/briefs/01-neural-doc-intelligence.md` so E01 catches it before benchmarking.

## Cross-engine audit of existing providers

The original Azure DI integration was added when DI was the only engine, so several considerations didn't apply at the time. Mistral was added second but with a different lifecycle (sync vs async) and didn't surface all gaps. With 4 more engines arriving, the codebase-derived checklist (above) becomes the canonical guard.

The audit of existing providers (Azure DI templates + Mistral public-API) against the 12-item codebase-derived checklist lives in `docs-md/EXTRACTION_PROVIDER_ARCHITECTURE.md` (parent-branch deliverable #3). Gaps surfaced there are either fixed on the parent (if documentation-only / shared concern) or captured as scoped TODOs in whichever experiment brief is most affected.

Each new engine integration explicitly answers all 12 items in its branch's `SUMMARY.md`.

## Open questions / assumptions

The following decisions were made in-spec without explicit per-question approval; flag if any need to change:

1. **Dataset folder layout**: `data/datasets/<name>/{public,private}/` (per-dataset public/private split) — chosen over `data/datasets/{public,private}/<name>/` because it isolates each dataset cleanly and keeps the gitignore narrow.
2. **VLM plumbing scope on parent**: backend only (env list + endpoint + threading deployment param). Frontend dropdown deferred to E04.
3. **gpt-5.5 deployment timing**: deploy now alongside parent setup, before E01 starts. Lets us validate vision capability early; if 5.5 rejects images, we deploy 5.4 instead before E04.
4. **Same account for gpt-4o and gpt-5.5**: westus, `ai-jobstoreai2846`. Means a single `AZURE_OPENAI_ENDPOINT` value works for both; node-level deployment selection is the only switch.
5. **Mistral public-API path retained**: existing `ocr-providers/mistral/` stays in place; E02 adds `mistral-azure/` alongside it for direct comparison.
6. **No formal `OcrProvider` interface on parent**: each engine continues to add its folder + activity-type registration. Re-evaluate after 2–3 land.

## Candidates for future rounds

Per the user's ask ("Check if I'm missing any other major trends"). These trends from the AI-feedback document and from `research.md` are **not** included in the core five experiments. They are candidates for follow-up rounds, surfaced here so they can be picked up after E01–E05 land. To be re-pitched at the end of the work as recommendations.

| Candidate | One-line description | Why deferred |
|-----------|----------------------|--------------|
| **Confidence-based routing** | Cheap OCR (DI Read) handles high-confidence regions; low-confidence pages/fields escalate to VLM. | Builds on results from E01–E05; meaningful only after we know per-engine per-field error rates. The system already has `check-ocr-confidence.ts` for HITL routing — this would extend it for engine-routing. |
| **Per-field calibration / engine routing** | Different field types (date, signature, handwritten amount) routed to different engines per their per-field accuracy. | Same: needs E01–E05 per-field benchmark numbers as input. |
| **Multi-engine ensemble voting** | Run 3+ engines, vote per-field. Safety net for high-stakes extractions. | Needs E01–E05 in place before there's anything to vote across. |
| **Agentic OCR correction loop** | "OCR agent" reviews low-confidence extractions, re-crops regions, retries with adjusted preprocessing, etc. | Out-of-scope for engine-comparison phase; valuable once we know which engine has which failure modes. |
| **Open-source VLMs** (Qwen2.5-VL, Granite-Docling-258M, PaddleOCR-VL, MinerU 2.5) | Local / on-prem VLMs competitive with frontier models at lower cost. | Useful if cost or data-privacy becomes a driver; not aligned with current Azure-MaaS posture. |
| **OCR-Free models** (Donut Document Understanding Transformer) | Bypass OCR entirely; model encodes document image and emits structured output. | Another architectural class; valuable as a non-OCR baseline. |
| **DeepSeek OCR** | Released October 2025; alternative for on-prem / privacy-sensitive deployments. | Same posture rationale as open-source VLMs. |

When E01–E05 are complete, the experiment hub doc surfaces this list as "Recommended next experiments."

## Sequence of work after spec approval

1. Commit spec on `feature/extraction-experiments` (this branch already created)
2. Output existing-resource keys + override-file instructions to user (DI direct, Mistral on Foundry, gpt-4o)
3. Deploy `gpt-5.5` via `az`; output its key + override-file instructions
4. Implement parent-branch deliverables (briefs, two docs incl. existing-engine audit, `.env.sample` updates, deployment-selection plumbing, dataset seed extension, `.gitignore` rules)
5. Local sanity test: `npm run db:seed` runs without error against an empty dataset folder layout
6. Hand off / start E01 on `experiment/01-neural-doc-intelligence`
