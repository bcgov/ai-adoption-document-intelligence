# E04 — VLM-direct extraction

**Branch**: `experiment/04-vlm-direct` — branched from `experiment/03-content-understanding` (chained stack)
**Read first**: `experiments/briefs/_shared-rules.md`

## ⚠ Pre-work: gpt-5.5 quota request

`gpt-5` (vanilla, 2025-08-07) is already deployed at `ai-jobstoreai2846` (westus). `gpt-5.5` (latest 5.x as of May 2026) requires a quota increase — `OpenAI.GlobalStandard.gpt-5.5` is currently 0 TPM in this subscription. Before E04 starts in earnest:

1. File the quota request at https://aka.ms/oai/quotaincrease (subscription `Azure subscription 1`, resource `strukalex-8338-resource` eastus2, model `gpt-5.5` version `2026-04-24`, SKU `GlobalStandard`, requested TPM ≥ 10,000).
2. Once approved (24–72h typical), deploy via:
   ```
   az cognitiveservices account deployment create \
     --name strukalex-8338-resource --resource-group rg-strukalex-8338 \
     --deployment-name gpt-5.5 --model-name gpt-5.5 --model-version 2026-04-24 \
     --model-format OpenAI --sku-name GlobalStandard --sku-capacity 10
   ```
3. Add `gpt-5.5` to `AZURE_OPENAI_DEPLOYMENTS` in your override file. Endpoint+key for the eastus2 account differ from the existing westus one — workflow node may need both `azureOpenAiEndpoint` and `azureOpenAiKey` parameters threaded through (currently only `azureOpenAiDeployment` is — see parent-branch plumbing). If quota approval is delayed, run E04 with `gpt-4o` and `gpt-5` only and revisit once 5.5 is available.

## Goal

Pure VLM extraction. Send the document image directly to a vision-language model with a structured-output prompt; receive structured JSON conforming to the canonical schema. No OCR pre-processing.

## Tasks

1. **Add a PDF→image rendering activity** at `apps/temporal/src/activities/render-pdf-to-images.ts`. Inputs: blob path of normalized PDF + DPI (default 200). Output: array of JPEG blob paths (one per page) at the configured DPI. Use a server-side library (`pdf2pic` / `pdfjs` / Sharp pipeline). Register as `pdf.renderToImages` in `activity-registry.ts`.

2. **Create `apps/temporal/src/ocr-providers/vlm-direct/`** with:
   - `vlm-prompt-builder.ts` — builds the extraction prompt from `FieldDefinition[]`. Field descriptions become natural-language instructions. Output schema becomes the structured-output JSON schema.
   - `vlm-direct-extract.ts` (the activity) — calls Azure OpenAI's chat completions endpoint with vision input + structured-output mode. Reads `params.azureOpenAiDeployment` from the workflow node (parent-branch plumbing already enables this), falls back to `AZURE_OPENAI_DEPLOYMENT`. Calls `callAzureOpenAI()` (existing helper at `apps/temporal/src/activities/enrichment-llm.ts`) with `response_format: { type: "json_schema", json_schema: ... }`.
   - `vlm-to-ocr-result.ts` — maps VLM response to canonical `OCRResult` shape. VLMs don't produce per-word/per-line/per-bbox output, so `pages[].words` will be sparse or empty; populate `keyValuePairs` and `documents[0].fields` from the structured-output JSON.

3. **Register activity types**: `vlmDirect.extract`, `pdf.renderToImages`.

4. **No new env vars needed** — uses existing `AZURE_OPENAI_*`. Parent-branch already added `AZURE_OPENAI_DEPLOYMENTS=gpt-4o,gpt-5` and the `GET /api/azure-openai/deployments` endpoint.

5. **Define workflow graphs** at `docs-md/graph-workflows/templates/experiment-04-vlm-direct-workflow.json` (primary) and one per variant if you split them out (e.g. `experiment-04-vlm-direct-cot-workflow.json`, `experiment-04-vlm-direct-self-consistency-workflow.json`). Use `mistral-standard-ocr-workflow.json` as the closest base (sync provider pattern: `file.prepare → vlmDirect.extract → ocr.cleanup → ocr.checkConfidence → reviewSwitch → store`). Add `pdf.renderToImages` between `file.prepare` and `vlmDirect.extract`. The auto-discovery seed picks up each JSON file matching `experiment-*-workflow.json` and creates a separate `BenchmarkDefinition` per variant — they all show up in `scripts/run-experiment-benchmarks.sh` with their leading `04` slug.

   Variants (one workflow JSON each):
   - **Variant 1 (single-pass)**: `pdf.renderToImages` → `vlmDirect.extract` (single call, image + schema → JSON) → post-processing nodes (selectively — most are text-shape-oriented; `check-ocr-confidence.ts` is the most important).
   - **Variant 2 (chain-of-thought)**: same pipeline, prompt asks model to reason about layout first, then extract.
   - **Variant 3 (self-consistency)**: 3-pass + majority vote per field. Either run the activity 3 times in the workflow and add a vote node, or thread n-pass into the activity itself.

6. **Run each variant** on one real document end-to-end. Once for `gpt-4o`, once for `gpt-5` (set `params.azureOpenAiDeployment` on the workflow node).

7. **Vision capability validation** — the very first run also serves as the gpt-5 vision sanity check. If gpt-5 (vanilla, 2025-08-07) rejects images, fall back to `gpt-5-chat` or request `gpt-5.5` quota and re-run.

8. **Run benchmarks programmatically** — one per variant per model. Tag with `experiment-04-vlm-direct-{variant}-{model}`.

9. **Mock-based tests** — record VLM responses once per variant; replay.

10. **Write `experiments/results/04-vlm-direct/SUMMARY.md`** with: which model handled vision, accuracy + cost + latency per variant per model, hallucination observations.

## Watch for

- **Image token cost** can be large on multi-page docs at high DPI. Start at 200 DPI; document if higher DPI is needed.
- **Structured-output mode requires a specific API version**. Existing `AZURE_OPENAI_API_VERSION=2024-12-01-preview` should work; verify.
- **Hallucination risk** — the model may fabricate field values. Consider per-field "evidence" requirement: prompt asks model to also output a `source_quote` per field; reject fields with no evidence.
- **Multi-page handling** — per-page calls vs concatenated images. Per-page is simpler but slower; concatenated risks layout confusion. Benchmark both if time allows; otherwise pick per-page and note.
- **Self-consistency (variant 3)** is roughly 3× cost; track per-document cost in `metrics`.

## On the workflow-node UI

Backend plumbing for per-node `azureOpenAiDeployment` selection is on the parent. Frontend dropdown is **deferred to this branch** if you need it for testing variants. Lowest-friction option: hardcode the deployment in the seeded workflow JSON for each variant. Add the UI control only if the user asks.

## Optional follow-ups (not required to ship E04)

- "Layout-aware VLM" variant — feed bbox coordinates from a quick OCR pre-pass as text alongside the image. This crosses into E05 territory; defer there.
