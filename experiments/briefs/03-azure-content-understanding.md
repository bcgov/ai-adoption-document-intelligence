# E03 — Azure Content Understanding

**Branch**: `experiment/03-content-understanding` — branched from `experiment/02-mistral-doc-ai-azure` (chained stack)
**Read first**: `experiments/briefs/_shared-rules.md` — the lessons-learned subsections (production-grade prompts, iteration kit pattern, force-resync runbook entry, sync-provider cache emission, and Foundry quota retry tuning) all apply directly. **Read those before writing any code.**

## Goal

Test Azure Content Understanding (CU) as a product against the seeded handwritten-form dataset. Add a new provider at `apps/temporal/src/ocr-providers/azure-content-understanding/` that deploys our canonical schema as a CU "analyzer," submits documents to it, and maps results to canonical `OCRResult`. Compare against E01 (custom-trained neural Azure DI) and E02 (Mistral on Foundry) in the cross-engine consolidation after E05.

## What CU is (and isn't)

CU is **not** something you build on top of Azure Foundry. It's a generative AI product where you POST a JSON "analyzer" describing your schema, then submit documents to its analyze endpoint. CU internally:

1. Performs OCR (its own ML-based layout extraction).
2. Sends extracted content + the analyzer schema to a generative model (GPT-Vision or similar).
3. Returns structured JSON conforming to the schema, with confidence scores and grounding citations.

Pricing splits content-extraction charges (OCR layer) from generative-model token charges (LLM layer). Source: [Microsoft Learn — Content Understanding overview](https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/overview).

## Tasks

1. **Read the Mistral Azure provider** thoroughly — it's the closest pattern: Foundry-style auth, schema-aware engine, structured-output schema with per-field descriptions + global prompt + nullable-numerics flag. The activity at `apps/temporal/src/ocr-providers/mistral-azure/mistral-azure-ocr-process.ts` and the schema converter at `apps/temporal/src/ocr-providers/mistral/field-definitions-to-mistral-annotation-format.ts` are the references. CU is async (poll-based) instead of sync, but the rest of the pattern transfers.

2. **Capture a real CU response BEFORE writing the mapper** (per the runbook: "Don't trust the brief's preamble until you've inspected one real response"). Either:
   - Use the smoke-test script you'll write in step 3 below, OR
   - One-shot `curl` against the analyze endpoint with one sample.
   Save the raw response to `apps/temporal/src/__fixtures__/experiment-03/cu-response-1-81.json`. Build the mapper against the actual shape, not against assumed fields. CU's response includes `documents[*].fields[*]` with `type`, `valueString` / `valueNumber` / `valueArray`, `confidence`, and `spans` (grounding citations) — but the exact shape varies by API version. Anchor the mapper to the captured fixture.

3. **Set up the iteration kit before any benchmark run.**
   - Copy `experiments/results/02-mistral-doc-ai-azure/iteration/` to `experiments/results/03-content-understanding/iteration/`. Replace the Mistral-specific bits in `prompt.md` with CU equivalents (CU's analyzer schema accepts a top-level `description` plus per-field `description` strings — same conceptual surface, different keys).
   - Add `apps/temporal/scripts/iterate-cu-extraction.ts` lifted from `iterate-mistral-extraction.ts`. Same skeleton: load image + ground truth + iteration files, build the analyzer schema, call CU, compare, dump diff.
   - Smoke-test on `synth-full (1)` (synth samples are typed and clean — ideal for prompt tuning). Iterate until per-field accuracy ≥ 95% before triggering the full benchmark.

4. **Create `apps/temporal/src/ocr-providers/azure-content-understanding/`** with:
   - `analyzer-schema-builder.ts` — converts our `FieldDefinition[]` to CU analyzer JSON. CU's analyzer schema vocabulary is documented in Microsoft Learn; map our `field_type` (string/number/date/etc.) to CU's field-type vocabulary, and our `field_format` to CU's value-format hints. **Accept a `descriptions` overlay (per-field) and a global instruction string.** Pattern from `field-definitions-to-mistral-annotation-format.ts`.
   - `azure-cu-deploy-analyzer.ts` — idempotently deploy an analyzer named `${AZURE_CU_ANALYZER_PREFIX}-${templateModelKey}`. POST if not present; PATCH if schema differs; no-op if identical. Cache deployment status in memory.
   - `azure-cu-analyze.ts` (the activity) — submit a document to the analyze endpoint, poll for completion (CU is async), fetch the result. Activity must accept `documentAnnotationPrompt`, `fieldDescriptions`, and any nullable-numerics flag, and forward them to the schema builder. Return both `ocrResult` and `cuResponse` (raw, for the cache-persistence path).
   - `cu-to-ocr-result.ts` — map CU response (which already has structured fields) to canonical `OCRResult`. The `documents[0].fields` shape carries the structured fields; populate `keyValuePairs` for downstream compatibility too.

5. **Register activity types** in all three registries (per `ADDING_OCR_PROVIDERS.md`):
   - `azureContentUnderstanding.deployAnalyzer` (one-time per template, idempotent; short timeout, ~3 retries)
   - `azureContentUnderstanding.analyze` (per document; **30 attempts × 15 s × 1.5x × 60 s cap retry** for the same Foundry-quota reasons as `mistralAzureOcr.process`; generous startToClose, ~20 m to absorb slow analyses)

6. **Define a workflow graph** at `docs-md/graph-workflows/templates/experiment-03-content-understanding-workflow.json`. CU is async (analyze → poll → fetch), but if the SDK exposes a single "wait for completion" call you can use the sync pattern. Either way:
   - Start from `experiment-02-mistral-doc-ai-azure-workflow.json` for the post-processing chain (cleanup → checkConfidence → reviewSwitch → store) and the **`ocrResponse` output port** for cache persistence.
   - Replace `mistralAzureOcr.process` with `azureContentUnderstanding.analyze` (and add `azureContentUnderstanding.deployAnalyzer` upstream if needed, gated on a one-shot ctx flag).
   - Set `templateModelId` default to `seed-sdpr-monthly-report-template` (NOT a stale UUID — see the runbook entry).
   - Embed `documentAnnotationPrompt` + `fieldDescriptions` + any flags as `parameters` on the analyze activity node, sourced from the iteration kit content.

7. **Pre-flight check after the first sample completes.** Per the runbook's "verify the structured-output mode is actually running" item: pull ONE row from `benchmark_ocr_cache`, confirm CU's response has populated structured fields. If empty, search Microsoft Q&A for the analyzer-config strictness flag (CU likely has its own equivalent of `strict: true`).

8. **Run the workflow on one real document end-to-end** through the iteration kit. Verify per-field accuracy ≥ 90% on `synth-full (1)`. If not, iterate prompts before scaling up.

9. **Run a benchmark programmatically** via `./scripts/run-experiment-benchmarks.sh 03`. Tag is auto-set by the script. Save the export to `experiments/results/03-content-understanding/benchmark-run.json`.

10. **Mock-based tests** at `apps/temporal/src/experiment-03-content-understanding.test.ts` — same two-layer pattern (static template assertions + runtime against local Temporal cluster, gated on `process.env.CI`). Replay the recorded fixture from step 2.

11. **Write `experiments/results/03-content-understanding/SUMMARY.md`** including:
    - Analyzer schema deployed, including which CU vocabulary maps to which of our field types
    - Fields with grounding-citation hits vs misses (CU's distinguishing feature vs E02)
    - Observations on CU's confidence scores vs other engines
    - Per-experiment retrospective subsection (lessons learned during E03; same template as E02's retrospective)
    - Concrete `_shared-rules.md` updates and E04 implications

## Pre-emptive guidance from E02 lessons

These specific gotchas tripped us up on E02 — apply ahead of time:

1. **Verify the strict-mode equivalent immediately.** Mistral on Foundry needed `json_schema.strict: true`; Foundry silently skipped annotation otherwise. CU's analyzer config has its own analogue. Look for `strict`, `allowAdditionalFields`, or similar flags. The single-document smoke test will surface this in seconds.

2. **`Authorization: Bearer` is the Foundry header.** Don't reach for `api-key` until you've checked an existing client.

3. **Foundry RPM quota is ~10 by default.** The per-activity retry policy MUST be 30 × 15 s / 1.5x / 60 s cap (or equivalent) before the first 33+ sample benchmark. The activity-registry default for `mistralAzureOcr.process` is the canonical example.

4. **Numeric-field nullability.** Our SDPR ground truth uses `""` for blank cells and `"0"` for explicit zeros — distinct values. If CU's analyzer schema requires a number, you can't represent blank. Add `numericFieldsNullable` support to the analyzer-schema-builder; emit `["number", "null"]` (or CU's equivalent) when the toggle is on.

5. **Sync vs async cache emission.** Whether CU's activity is sync or async, return `{ ocrResult, cuResponse }` and wire `cuResponse → ctx.ocrResponse` so `benchmark-sample-workflow.ts`'s `persistOcrCache` step writes a row per sample. Without this, fixture capture and replay break.

6. **Force-resync after dataset edits.** If you add or rename samples in `data/datasets/samples-mix/public/`, run `FORCE_RESYNC_LOCAL_DATASETS=true npm run start:dev` once. Drop the env var on the next start.

7. **Capture a real CU response before writing the mapper.** The brief's preamble below describes what CU *should* return; reality may differ by API version. Run a one-shot curl or the iteration script first; build the mapper against the captured fixture; replay it in the unit tests.

## Architecture pattern note

E05 will explicitly recreate the CU pattern (Azure DI Read + LLM + schema) with our own components, so we can compare CU-as-a-product against our self-assembled equivalent. Keep the analyzer-schema-builder in E03 cleanly separated so E05 can study it.

## Watch for

- **Analyzer schema deployment is a learning curve.** The vocabulary (`type`, `description`, `valueFormat`, `methodCallout`) is specific. Test with a small subset first (3–5 fields) before deploying the full 74-field SDPR schema.
- **Cost on long documents** is surprising — both layers bill.
- **Confidence scores aren't directly comparable** to DI's or Mistral's. Ensure your `OCRResult` mapper normalises to 0–1 for `check-ocr-confidence.ts`.
- **CU is async** — analyze endpoint returns 202 + operation-location header. Poll with exponential backoff; respect the `Retry-After` header. Default timeout should be generous (30 s+) per page.
- **Multiple input documents** in a single request is supported in CU "Pro mode" (preview API version) but not needed here. Stick with single-doc-per-call.

## Cross-engine audit follow-through

Parent-branch `docs-md/EXTRACTION_PROVIDER_ARCHITECTURE.md` lists gaps in existing engines. CU is the third engine to land; if any "shared-concern" gaps surface during this work that the parent audit missed, raise them in your SUMMARY.md retrospective rather than silently fixing.
