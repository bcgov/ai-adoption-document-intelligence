# E03 — Azure Content Understanding

**Branch**: `experiment/03-content-understanding` — branched from `experiment/02-mistral-doc-ai-azure` (chained stack)
**Read first**: `experiments/briefs/_shared-rules.md`

## Goal

Test Azure Content Understanding (CU) as a product against the seeded handwritten-form dataset. Add a new provider at `apps/temporal/src/ocr-providers/azure-content-understanding/` that deploys our canonical schema as a CU "analyzer," submits documents to it, and maps results to canonical `OCRResult`.

## What CU is (and isn't)

CU is **not** something you build on top of Azure Foundry. It's a generative AI product where you POST a JSON "analyzer" describing your schema, then submit documents to its analyze endpoint. CU internally:

1. Performs OCR (its own ML-based layout extraction)
2. Sends extracted content + the analyzer schema to a generative model (GPT-Vision or similar)
3. Returns structured JSON conforming to the schema, with confidence scores and grounding citations

Pricing splits content-extraction charges (OCR layer) from generative-model token charges (LLM layer). Source: [Microsoft Learn — Content Understanding overview](https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/overview).

## Tasks

1. **Read the Mistral Azure provider** (E02 should be done first; if not, read the public Mistral provider). The Mistral Azure provider is the closest pattern: Foundry-style auth, schema-aware engine, async polling.

2. **Create `apps/temporal/src/ocr-providers/azure-content-understanding/`** with:
   - `analyzer-schema-builder.ts` — converts our `FieldDefinition[]` to CU analyzer JSON. CU's analyzer schema vocabulary is documented in Microsoft Learn; map our `field_type` (string/number/date/etc.) to CU's field-type vocabulary, and our `field_format` to CU's value-format hints.
   - `azure-cu-deploy-analyzer.ts` — idempotently deploy an analyzer named `${AZURE_CU_ANALYZER_PREFIX}-${templateModelKey}`. POST if not present; PATCH if schema differs; no-op if identical. Cache deployment status in memory.
   - `azure-cu-analyze.ts` (the activity) — submit a document to the analyze endpoint, poll for completion (CU is async), fetch the result.
   - `cu-to-ocr-result.ts` — map CU response (which already has structured fields) to canonical `OCRResult`. The `documents[0].fields` shape carries the structured fields; populate `keyValuePairs` for downstream compatibility too.

3. **Register activity types** in `apps/temporal/src/activity-registry.ts`:
   - `azureContentUnderstanding.deployAnalyzer` (one-time per template, idempotent)
   - `azureContentUnderstanding.analyze` (per document; async polling internally)

4. **New env vars** are already declared in `.env.sample` on the parent: `AZURE_CU_ENDPOINT`, `AZURE_CU_KEY`, `AZURE_CU_ANALYZER_PREFIX`. User has populated their override file.

5. **Define a workflow graph** at `docs-md/graph-workflows/templates/experiment-03-content-understanding-workflow.json`. CU is async (analyze → poll → fetch), so use the **async pattern from `standard-ocr-workflow.json`** as the template (file.prepare → submit → pollUntil(poll) → extract → cleanup → checkConfidence → reviewSwitch → store). Replace the Azure DI nodes with `azureContentUnderstanding.deployAnalyzer` (one-time, idempotent) → `azureContentUnderstanding.analyze`. Most post-processors expect text-level `OCRResult` shape; CU's structured output may bypass some — document which post-processors apply and which don't in `SUMMARY.md`. The auto-discovery seed picks up the JSON automatically.

6. **Run the workflow** on one real document end-to-end.

7. **Run a benchmark programmatically**. Tag with `experiment-03-content-understanding`.

8. **Mock-based tests** — record CU's response once, replay.

9. **Write `experiments/results/03-azure-content-understanding/SUMMARY.md`** including: analyzer schema deployed, fields with grounding-citation hits vs misses, observations on CU's confidence scores vs other engines.

## Architecture pattern note

E05 will explicitly recreate the CU pattern (Azure DI Read + LLM + schema) with our own components, so we can compare CU-as-a-product against our self-assembled equivalent.

## Watch for

- **Analyzer schema deployment is a learning curve**. The vocabulary (`type`, `description`, `valueFormat`, `methodCallout`) is specific. Test with a small subset first.
- **Cost on long documents** is surprising — both layers bill.
- **Confidence scores aren't directly comparable** to DI's or Mistral's. The audit doc on the parent describes this; ensure your `OCRResult` mapper normalizes to 0–1 for `check-ocr-confidence.ts`.
- **CU is async** — analyze endpoint returns 202 + operation-location header. Poll with exponential backoff; respect the `Retry-After` header. Default timeout should be generous (30s+) per page.
- **Multiple input documents** in a single request is supported in CU "Pro mode" (preview API version) but not needed here. Stick with single-doc-per-call.

## Cross-engine audit follow-through

Parent-branch `docs-md/EXTRACTION_PROVIDER_ARCHITECTURE.md` lists gaps in existing engines. CU is the third engine to land; if any "shared-concern" gaps surface during this work that the parent audit missed, raise them back rather than silently fixing.
