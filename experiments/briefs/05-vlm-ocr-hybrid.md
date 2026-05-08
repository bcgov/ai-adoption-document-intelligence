# E05 — VLM + OCR hybrid

**Branch**: `experiment/05-vlm-ocr-hybrid`
**Read first**: `experiments/briefs/_shared-rules.md`

## Goal

Recreate the Mistral / CU pattern with components we control: Azure DI Read (plain layout, no field extraction) → markdown + bbox annotations → VLM with the original image + the schema. New provider at `apps/temporal/src/ocr-providers/vlm-ocr-hybrid/`.

## Why this experiment

Both Mistral Document AI (E02) and Azure Content Understanding (E03) are OCR-first → LLM-with-schema systems internally:

- **Mistral**: OCR endpoint produces markdown + bboxes; `document_annotation` runs an LLM with a user-provided schema. Source: [Mistral docs](https://docs.mistral.ai/capabilities/document_ai/annotations).
- **CU**: ML-based OCR layer; GPT-Vision processes extracted content + analyzer schema. Pricing is split between the two layers. Source: Microsoft Learn — Content Understanding overview.

E05 lets us see whether assembling the same pattern from raw components (Azure DI Read + Azure OpenAI VLM with structured output) hits comparable accuracy at lower cost — and gives us a head-to-head against the bundled products.

## Tasks

1. **Add a "plain OCR" mode for Azure DI Read** — Azure DI's `prebuilt-layout` model produces text + lines + bboxes without any field extraction. Add an activity `azureOcr.readPlain` in `apps/temporal/src/activities/azure-di-read-plain.ts` that calls DI with `prebuilt-layout` (no template/neural), polls, returns the raw layout response (markdown + bboxes). Register in `activity-registry.ts`.

2. **Add the PDF→image rendering activity** if E04 didn't already (likely did). Otherwise reuse `pdf.renderToImages`.

3. **Create `apps/temporal/src/ocr-providers/vlm-ocr-hybrid/`** with:
   - `ocr-to-markdown.ts` — convert DI Read response into a markdown representation with optional bbox annotations (e.g. `<line bbox="0.12,0.34,0.56,0.36">Total: $1234.56</line>`). Bbox coords normalized 0–1 (page-relative) for consistency across resolutions.
   - `vlm-hybrid-prompt-builder.ts` — builds the prompt: image + OCR markdown + extraction schema. Clear delimiters + instruction "use the image as ground truth when image and OCR text disagree."
   - `vlm-hybrid-extract.ts` (the activity) — calls Azure OpenAI with vision + structured output, reading `params.azureOpenAiDeployment` from the workflow node.
   - `vlm-to-ocr-result.ts` — VLM response → canonical `OCRResult`. Reuse the bbox info from Azure DI Read so the `OCRResult` has populated bboxes (which pure VLM-direct in E04 lacked).

4. **Register activity types**: `vlmOcrHybrid.extract`, `azureOcr.readPlain`.

5. **No new env vars needed**.

6. **Define workflow graphs** at `docs-md/graph-workflows/templates/experiment-05-vlm-ocr-hybrid-workflow.json` (primary) and one per variant if separated. Base on `standard-ocr-workflow.json` (async pattern for the DI Read step) — replace the extraction stage: `file.prepare → pdf.renderToImages + azureOcr.readPlain (parallel/sequential) → vlmOcrHybrid.extract → ocr.cleanup → ocr.checkConfidence → reviewSwitch → store`. The auto-discovery seed picks up each JSON automatically.

   Variants (one workflow JSON each):
   - **Variant 1 (primary, image + OCR markdown)**: `pdf.renderToImages` + `azureOcr.readPlain` → `vlmOcrHybrid.extract` (with both inputs) → post-processing.
   - **Variant 2 (OCR markdown only, no image)**: `azureOcr.readPlain` → `vlmOcrHybrid.extract` (text-only) → post-processing. Control variant: how much does the image actually help?
   - **Variant 3 (image + OCR markdown + bbox spatial hints)**: same as Variant 1 but the markdown includes inline bbox annotations.

7. **Run each variant** on one real document end-to-end, for `gpt-4o` and `gpt-5`.

8. **Run benchmarks programmatically** — one per variant per model. Tag with `experiment-05-hybrid-{variant}-{model}`.

9. **Mock-based tests** — record both DI Read and VLM responses once; replay.

10. **Write `experiments/results/05-vlm-ocr-hybrid/SUMMARY.md`** with: variant comparison, cost vs E04 (this should be roughly 2× the cost since you're adding a DI call), accuracy gain measured, when (if ever) the image helps the model do better than markdown-only.

## Watch for

- **OCR markdown can dominate the prompt** and cause the VLM to ignore the image. Use clear delimiters (e.g., separate JSON keys for `image` and `ocr_text`) and explicit instruction to prefer image when they conflict.
- **Cost is roughly 2× VLM-direct** (DI call + VLM call). Track per-page cost. The accuracy gain has to justify the cost over E04 to be a winner.
- **Bbox normalization** — DI returns inches at API `2024-11-30`; convert to 0–1 page-relative in `ocr-to-markdown.ts` so bbox annotations are resolution-independent.
- **Page boundaries** — multi-page docs need the OCR markdown segmented per page so it aligns with the corresponding image. Don't concatenate the whole document into one VLM call unless context-window math works.

## Comparison plot

`SUMMARY.md` should include a comparison table covering all benchmarks across E01–E05 (this is the last experiment, so you have the full picture):

| Experiment | Variant | Model | F1 | Cost / page | P50 latency | P95 latency |
| ... | ... | ... | ... | ... | ... | ... |

This is the final report that drives production-stack decisions.
