# Extraction Experiments Suite

## Context

The system today extracts fields via Azure Document Intelligence (DI) **template** models, with a stack of post-processing activities (`apps/temporal/src/activities/`). Mistral OCR was recently added against the public Mistral API. We want to compare the existing pipeline against five alternative engines on difficult handwritten forms and pick a production stack.

This branch (`feature/extraction-experiments`) holds shared scaffolding only. Each of the 5 experiments lives on its own stacked branch.

This branch is stacked on `feature/neural-model-training` (PR #134, open). The neural training capability that PR adds is a prerequisite for E01.

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

Each experiment opens a draft PR targeting the parent. Whole stack rebases onto develop once #134 merges.

## Non-Goals

- No formal `OcrProvider` interface refactor — providers continue to follow the activity-registry-as-loose-abstraction pattern. Re-evaluate after experiments land.
- No frontend node-parameter editor on the parent — backend plumbing only; UI deferred to E04.
- No worktrees, no parallel implementation. Experiments run sequentially.

## Parent-branch deliverables

### 1. Brief library at `experiments/briefs/`

`_shared-rules.md` (engine-integration checklist + dev loop, below) plus `01-neural-doc-intelligence.md` … `05-vlm-ocr-hybrid.md`. Each brief is a checklist for that experiment.

#### Engine-integration checklist (codebase-derived)

Every engine integration confirms and documents these items, each tied to actual files in our codebase:

1. **Map engine output to canonical `OCRResult`** — mapper at `apps/temporal/src/ocr-providers/<engine>/<engine>-to-ocr-result.ts` (Mistral has the reference impl). Pages with words/lines/KVPs.
2. **Activity-type registration in `apps/temporal/src/activity-registry.ts`** — single sync activity (Mistral pattern) or multi-step `submit`/`poll`/`extract` (Azure DI pattern). Set timeout + retry.
3. **Field schema → engine format converter** — if the engine takes a schema (Mistral, CU), file at `apps/temporal/src/ocr-providers/<engine>/field-definitions-to-<engine>.ts`. Converts `FieldDefinition[]`.
4. **Confidence values 0–1** — for interop with `apps/temporal/src/activities/check-ocr-confidence.ts` (default threshold 0.95) and HITL routing.
5. **Bounding-box coordinate convention** — Azure DI returns inches from top-left at API `2024-11-30`; convert in the mapper if engine differs.
6. **Page indexing** — match the convention used in `OCRResult` and `ocr-normalize-fields.ts`.
7. **Auth & endpoint via env vars** — declare in `apps/{backend-services,temporal}/.env.sample`. Document APIM vs direct routing.
8. **Workflow graph definition** — JSON wiring the engine + applicable post-processing nodes (`ocr.cleanup`, `ocr.spellcheck`, `ocr.characterConfusion`, `ocr.normalizeFields`, `ocr.enrich`, `ocr.checkConfidence`, `ocr.storeResults`).
9. **Engine-internal preprocessing** — does the engine deskew/rotate/denoise internally? Document so we don't double-process. Upstream is `apps/backend-services/src/document/pdf-normalization.service.ts`.
10. **Test coverage** — see dev loop.
11. **Benchmark integration** — run via the existing `BenchmarkRun` flow against a seeded `Dataset`. Tag `experiment-XX`. User provides API key for programmatic runs.
12. **Cost/usage telemetry** — record per-call usage on the run's `metrics` JSON. DI per page, Mistral per page/char, Azure OpenAI per token, CU has both.

#### Dev loop per experiment

Not an accuracy-iterate-until-pass loop. Discipline:

1. **Implement** the engine integration.
2. **Run the workflow on one real document** end-to-end. Confirm `OCRResult` produced, no errors.
3. **Run a benchmark programmatically** via the backend benchmark API against the seeded dataset. Confirm results land in `BenchmarkRun`.
4. Stable when 2 and 3 succeed without manual intervention.
5. **Write Jest tests with mocked engine responses** (record-replay) verifying the workflow runs against the mocks.

Cross-engine accuracy comparison happens **after** all experiments land, by reading `BenchmarkRun` records side-by-side. No threshold gates "done."

### 2. Experiment hub doc at `docs-md/EXTRACTION_EXPERIMENTS.md`

Index of experiments + status + how to run each.

### 3. Provider architecture assessment at `docs-md/EXTRACTION_PROVIDER_ARCHITECTURE.md`

Documents the deferred-formal-interface decision. **Audits the two existing providers** (Azure DI templates + Mistral public-API) against the engine-integration checklist. Gaps fixed on parent only if documentation-only or shared; engine-specific gaps captured as scoped TODOs in the affected experiment brief.

### 4. `.env.sample` updates

Add to `apps/backend-services/.env.sample` and `apps/temporal/.env.sample`:

```
# Azure Content Understanding (E03)
AZURE_CU_ENDPOINT=
AZURE_CU_KEY=
AZURE_CU_ANALYZER_PREFIX=

# Mistral Document AI on Azure Foundry (E02)
MISTRAL_DOC_AI_AZURE_ENDPOINT=
MISTRAL_DOC_AI_AZURE_KEY=

# Azure OpenAI deployments allowed for workflow node selection (comma-separated).
# AZURE_OPENAI_DEPLOYMENT remains the default fallback.
AZURE_OPENAI_DEPLOYMENTS=gpt-4o,gpt-5
```

User redirects existing `AZURE_DOCUMENT_INTELLIGENCE_*` and `AZURE_OPENAI_*` to their personal Azure via `~/.config/bcgov-di/{backend-services,temporal}.env` — the override mechanism. Claude does not read those files.

### 5. Workflow-node deployment-selection plumbing

`apps/temporal/src/activities/enrich-results.ts:106` reads `process.env.AZURE_OPENAI_DEPLOYMENT` directly. The graph node already accepts `parameters: Record<string, unknown>` (`graph-workflow-types.ts:90-96`) and `callAzureOpenAI()` already takes `deployment`. Just thread it.

- `enrich-results.ts` — read `params.azureOpenAiDeployment ?? process.env.AZURE_OPENAI_DEPLOYMENT`, pass through.
- `apps/backend-services/src/azure/azure-openai.controller.ts` (new) — `GET /api/azure-openai/deployments` returns `{ deployments: string[] }` parsed from `AZURE_OPENAI_DEPLOYMENTS`. Mirrors `GET /api/models`. Full Swagger decorators per `CLAUDE.md`.
- DTO at `apps/backend-services/src/azure/dto/azure-openai-deployments-response.dto.ts`.
- Tests for the controller and the override behavior.

UI dropdown deferred to E04.

### 6. Dataset seed feature — local-folder convention

Convention: `data/datasets/<dataset-name>/{public,private}/`

```
data/datasets/handwritten-forms-2026/
├── public/
│   ├── manifest.json
│   ├── documents/{form-001.pdf, form-002.pdf, ...}
│   └── ground-truth/{form-001.json, form-002.json, ...}
└── private/                    # gitignored
    └── (same shape as public)
```

`manifest.json` matches the existing `ManifestSample` interface in `apps/backend-services/src/benchmark/ground-truth-generation.service.ts`:

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

Ground-truth `field-key-value-json`: flat JSON mapping `field_key` → string, matching `FieldDefinition.field_key`.

Seed extension (`apps/shared/prisma/seed.ts`): scan `data/datasets/`, read `public/manifest.json` and (if present) `private/manifest.json`. For each manifest, idempotently find/create `Dataset` + `DatasetVersion` + `Sample` rows, upload documents and ground-truth to blob storage (`OperationCategory.BENCHMARK`), create `DatasetGroundTruthJob` rows with `status: completed`.

`.gitignore` adds `data/datasets/*/private/**` (with a `!.gitkeep` exception so the path is scannable when empty).

## Experiments

Each experiment's brief is the source of truth for that branch's work; descriptions here are the elevator pitch.

### E01: Neural DI + post-processing inventory

`experiment/01-neural-doc-intelligence`. Uses the neural training capability from PR #134. Audits the 9 existing post-processing activities (`post-ocr-cleanup`, `ocr-spellcheck`, `ocr-character-confusion` + `ConfusionProfile` DB model, `ocr-normalize-fields`, `enrichment-rules`, `enrichment-llm`, `enrich-results`, `check-ocr-confidence`, `document-validate-fields`) against neural-model output, wires applicable ones into a workflow, trains a neural model from the dataset, runs benchmark vs the template baseline.

Brief includes the **APIM-vs-direct DI TODO**: today, the app's DI calls go through APIM (`api.gov.bc.ca`); experiments need direct (`*.cognitiveservices.azure.com`). Verify `submit-to-azure-ocr.ts` + `template-model-ocr.service.ts` don't have APIM-specific path logic that breaks under direct access.

### E02: Mistral Document AI on Azure

`experiment/02-mistral-doc-ai-azure`. Existing `apps/temporal/src/ocr-providers/mistral/` calls the public API. This adds a **parallel** provider `apps/temporal/src/ocr-providers/mistral-azure/` against `mistral-document-ai-2512` at `strukalex-8338-resource` (eastus2). Public-API path stays for fallback comparison. Differences vs public API: endpoint URL shape (`https://<resource>.services.ai.azure.com/models/...`), Foundry-style auth, possibly lagging model version.

### E03: Azure Content Understanding

`experiment/03-content-understanding`. Tests CU as a product: deploy a JSON "analyzer" (our canonical schema), submit documents to its analyze endpoint, map output to `OCRResult`. New provider at `apps/temporal/src/ocr-providers/azure-content-understanding/`. Auth via `AZURE_CU_ENDPOINT` / `AZURE_CU_KEY`.

CU is OCR-first → generative-AI-extraction (per MS Learn: "Content Understanding performs machine learning-based OCR ... Azure OpenAI with GPT Vision processes the extracted content, maps it to ... schemas"; pricing splits content-extraction from generative-model token charges). Confirms the pattern E05 recreates.

### E04: VLM-direct

`experiment/04-vlm-direct`. Pure VLM: image + structured-output prompt. New provider `apps/temporal/src/ocr-providers/vlm-direct/`. Adds the PDF→image rendering activity on this branch. Variants: single-pass; chain-of-thought; self-consistency 3-pass majority vote. Workflow node param `azureOpenAiDeployment` selects between `gpt-4o` and `gpt-5`.

### E05: VLM-OCR hybrid

`experiment/05-vlm-ocr-hybrid`. Recreates Mistral/CU pattern with components we control: Azure DI Read (plain layout, no field extraction) → markdown + bbox → VLM with image + schema. New provider, plus a "plain OCR" mode for Azure DI Read on this branch. Mistral docs confirm the pattern (OCR endpoint produces markdown + bboxes, `document_annotation` runs LLM with user-provided schema). Variants: OCR markdown + image (primary); OCR markdown only; OCR markdown + bbox spatial hints + image.

## Azure resources

| Resource | Account / Region | Status | Used by |
|----------|------------------|--------|---------|
| Document Intelligence (AIServices kind) | `ai-jobstoreai2846…` (westus) | ✅ already deployed | E01, E05 (direct, bypassing APIM) |
| `gpt-4o` deployment, cap 50 | `ai-jobstoreai2846…` (westus) | ✅ already deployed | Existing LLM enrichment + E04/E05 baseline |
| `mistral-document-ai-2512`, cap 10 | `strukalex-8338-resource` (eastus2) | ✅ already deployed | E02 |
| `gpt-5` deployment, cap 10 | `ai-jobstoreai2846…` (westus) | ✅ deployed (model version `2025-08-07`) | E04, E05 alternative model |
| CU analyzer | `strukalex-8338-resource` (eastus2, has `allowProjectManagement`) | runtime call during E03 | E03 |

`gpt-5` (model version `2025-08-07`, GlobalStandard) was deployed instead of the original gpt-5.5 plan because gpt-5.5 GlobalStandard quota is 0 in this subscription (a quota request would block parent setup). Vision support is documented as native for the 5.x family but not flagged explicitly in capabilities — validated by sending a test image during E04; fall back to `gpt-5-chat` or request `gpt-5.5` quota if vanilla `gpt-5` rejects images. Same account as `gpt-4o` so a single `AZURE_OPENAI_ENDPOINT` works for both; node param is the only switch.

## Future candidates (re-pitch after E01–E05 land)

Trends from `research.md` + AI feedback that aren't in the core five:

- **Confidence-based engine routing** — cheap OCR → escalate low-confidence to VLM
- **Per-field calibration** — different field types → different best engines
- **Multi-engine ensemble voting** — vote per-field
- **Agentic OCR correction loop** — autonomous re-crop / retry on low confidence
- **Open-source VLMs** — Qwen2.5-VL, Granite-Docling-258M, PaddleOCR-VL, MinerU 2.5
- **OCR-Free models** — Donut Document Understanding Transformer
- **DeepSeek OCR** — on-prem / privacy-sensitive option

Most of these need per-engine per-field benchmark numbers from E01–E05 as input.

## Sequence of work after spec approval

1. Output existing-resource keys + override-file instructions (DI direct, Mistral on Foundry, gpt-4o)
2. ~~Deploy `gpt-5` via `az`~~ done (model version `2025-08-07`, capacity 10, GlobalStandard, on `ai-jobstoreai2846` westus)
3. Implement parent-branch deliverables (briefs, two docs incl. existing-engine audit, `.env.sample` updates, deployment-selection plumbing, dataset seed extension, `.gitignore` rules)
4. Sanity test: `npm run db:seed` runs without error against the new dataset folder layout (empty is fine)
5. Hand off / start E01 on `experiment/01-neural-doc-intelligence`
