---
status: active
updated: 2026-07-24
canonical_sources:
  - docs-md/extraction/
  - apps/temporal/src/activities/
  - apps/backend-services/src/azure/
  - apps/backend-services/src/document/
  - apps/backend-services/src/template-model/
  - apps/backend-services/src/confusion-profile/
do_not_duplicate:
  - Per-activity parameter tables
  - Azure endpoint and env inventories
  - Correction-tool rule catalogs
---

# Extraction

OCR and field extraction: how document bytes become structured, corrected field values. Covers Azure Document Intelligence models and classifiers, the correction/enrichment activities that clean OCR output, and the feedback loops (confusion profiles, format suggestions, the OCR improvement pipeline) that tune extraction quality over time.

## Source Map

- Topic docs live under `docs-md/extraction/` — start there for any specific area.
- OCR, correction, and enrichment run as Temporal activities in `apps/temporal/src/activities/` (registered in `apps/temporal/src/activity-registry.ts`).
- Azure model/classifier integration lives in `apps/backend-services/src/azure/` and `apps/backend-services/src/template-model/`.
- Confusion-profile derivation and storage live in `apps/backend-services/src/confusion-profile/`.
- OCR result views (stored `ocr_results.content`, `GET /api/documents/:id/ocr`, Extracted/Text/JSON UI) are in `docs-md/extraction/OCR_RESULT_VIEWS.md`; OCR failure/status lifecycle is in `docs-md/extraction/OCR_FAILURE_HANDLING.md`.

## Design Notes

- Extraction runs inside graph workflows — the nodes and their parameters are cataloged in [Graph workflows](graph-workflows.md); this topic is about what those nodes *do*, not how the engine schedules them.
- Correction is a pipeline: cleanup → character-confusion → normalize-fields → spellcheck → enrich, each an optional graph node. Confusion matrices and format specs feed those nodes. All correction activities are blob-backed (resolve an input `OcrPayloadRef`, return a new one) via `apps/temporal/src/ocr-activity-ref-utils.ts`.
- `ocr.recoverNumericZerosFromCheckboxes` recovers numeric zeros Azure DI misread as selection marks, driven entirely by per-table node config. Because that config is form-specific, it is **not** in the generic standard workflow — it lives in form-specific variants (e.g. `standard-ocr-workflow-sdpr.json`, seeded as `seed-workflow-standard-ocr-sdpr`), wired in place on `ocrResultRef` between extract and cleanup. It is excluded from AI tool recommendation (per-form structural config). Details and finder strategies: `docs-md/extraction/OCR_RECOVER_NUMERIC_ZEROS.md`.
- Quality feedback loops (confusion profiles, format suggestions, OCR improvement pipeline) derive their inputs from HITL corrections and benchmark run mismatches — see [HITL](hitl.md) and the benchmarking docs.

## Related Topics

- [Graph workflows](graph-workflows.md): the engine and node catalog that host extraction activities.
- [HITL](hitl.md): human corrections that feed confusion profiles and format suggestions.
- [Blob storage](blob-storage.md): where source documents, normalized PDFs, and page extracts live.

## Common Drift Risks

- Activity IDs in docs can lag the registry when new correction tools are added — cross-check `activity-registry.ts`.
- Model/classifier catalogs and Azure API versions change; keep those in the canonical extraction docs, not here.
- Confusion-matrix and format-suggestion behavior spans backend and worker; verify which layer owns a change before editing.
