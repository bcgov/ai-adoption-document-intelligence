# E02 — Mistral Document AI on Azure Foundry

**Branch**: `experiment/02-mistral-doc-ai-azure` — branched from `experiment/01-neural-doc-intelligence` (chained stack)
**Read first**: `experiments/briefs/_shared-rules.md`

## Goal

Add a parallel provider that calls Mistral Document AI through **Azure AI Foundry** (deployment `mistral-document-ai-2512` on the user's `strukalex-8338-resource` in eastus2), alongside the existing public-API provider at `apps/temporal/src/ocr-providers/mistral/`. Public-API path stays intact for fallback comparison.

## Goal of "fork-not-replace"

The existing Mistral provider is paired with a Mistral subscription and the public `api.mistral.ai` endpoint. The Foundry deployment is paid through the Azure subscription, may lag the public model version, has different auth + endpoint shape, and is regionally bound. Keeping both providers lets us benchmark them against each other.

## Tasks

1. **Read the existing Mistral provider thoroughly** — `apps/temporal/src/ocr-providers/mistral/`. Understand request/response shape, mapper, field-definitions converter. Most of the converters and mapper should be reusable; you'll mostly fork the activity (the HTTP call) and the auth handling.

2. **Create `apps/temporal/src/ocr-providers/mistral-azure/`** with:
   - `mistral-azure-ocr-process.ts` (the activity) — calls Foundry endpoint with Foundry auth; on success returns the same `MistralOcrApiResponse` shape so the existing mappers work.
   - Re-export or thin-wrap the existing Mistral mapper / converter where possible. Don't fully duplicate them.
   - The Foundry endpoint URL exact path needs to be resolved by reading Microsoft's "Mistral Document AI on Azure AI Foundry" docs (the base is `https://strukalex-8338-resource.services.ai.azure.com`).

3. **Register a new activity type** `mistralAzureOcr.process` in `apps/temporal/src/activity-registry.ts` with appropriate timeout/retry. Mistral Doc AI's annotation step "can be slower and may result in timeouts" per Microsoft docs, so allow generous timeouts.

4. **New env vars** are already declared in `.env.sample` on the parent: `MISTRAL_DOC_AI_AZURE_ENDPOINT`, `MISTRAL_DOC_AI_AZURE_KEY`. The user has already populated their override file.

5. **Define a workflow graph** at `docs-md/graph-workflows/templates/experiment-02-mistral-doc-ai-azure-workflow.json`. **Start by copying `docs-md/graph-workflows/templates/mistral-standard-ocr-workflow.json`** — same node structure, but swap `activityType: "mistralOcr.process"` → `"mistralAzureOcr.process"` and update `metadata.name` / `metadata.description`. The auto-discovery seed (`seedExperimentWorkflows()`) will pick up the JSON and create lineage + version + benchmark definition automatically.

6. **Run the workflow** on one real document via the real Foundry API. Confirm `OCRResult` produced.

7. **Run a benchmark programmatically** via the backend benchmark API. Tag the run with `experiment-02-mistral-azure`.

8. **Mock-based tests** — record the Foundry response once, replay in tests.

9. **Write `experiments/results/02-mistral-doc-ai-azure/SUMMARY.md`** including: a comparison row against the public-API provider, any version mismatches observed, auth/endpoint differences documented.

## Architecture verification (already confirmed)

Mistral Document AI is a two-stage system per [Mistral docs](https://docs.mistral.ai/capabilities/document_ai/annotations):

> Mistral OCR uses Mistral LLMs to understand content extracted by OCR-ing a document. The OCR endpoint produces markdown + bboxes. The `document_annotation` step runs an LLM over that with a user-provided schema.

E05 explicitly recreates this pattern with our own components.

## Differences vs the public Mistral API to handle

- **Endpoint URL shape** — `https://<resource>.services.ai.azure.com/...` (Foundry pattern), not `https://api.mistral.ai/v1/ocr`.
- **Auth header** — Azure key-based (`api-key` header) instead of `Bearer` token.
- **Possibly lagging model version** — Foundry deployment is `mistral-document-ai-2512` (December 2025); public API may be ahead.
- **Rate limits** are per-deployment on Foundry, not per-account.
- **`document_annotation` requires a schema** — same as public; the existing `field-definitions-to-mistral-annotation-format.ts` converter should work unchanged.

## Watch for

- The mapper currently assumes a specific response shape. If Foundry returns a slightly different shape (extra wrapper, different confidence-scoring fields), the mapper needs to be parameterized or duplicated.
- Cost telemetry differs: Foundry bills per the deployment's pricing; public API has its own pricing.
- The `MOCK_MISTRAL_OCR=true` env flag (existing for public-API path) — decide whether to extend to cover the Azure path or leave separate.

## Cross-engine audit follow-through

The parent-branch `docs-md/EXTRACTION_PROVIDER_ARCHITECTURE.md` audited the existing public-Mistral provider against the 12-item checklist. Read that doc before starting; if any gaps were marked "fix during E02," address them in this branch.
