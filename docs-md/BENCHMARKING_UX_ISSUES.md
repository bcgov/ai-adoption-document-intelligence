# Benchmarking System: UX & Bug Fix Checklist (Round 2)

Tracked issues discovered during manual testing of the benchmarking system after initial fixes. Each item includes context for implementation.

---

## Dataset Versions

### 1. [x] Deleted and re-created dataset version retains old documents
**Area:** Backend — Dataset Service / Git repository
**Problem:** When a dataset version is deleted and a new version is created, the new version is not empty — it still contains documents from the previously deleted version. The git repository or storage layer is not being cleaned up on version deletion, so the next version inherits stale files.
**Expected:** Deleting a version should fully clean up its associated files in the git repository. When a new version is created it must start empty with no documents, regardless of what previous versions contained.
**Key file:** `apps/backend-services/src/benchmark/dataset.service.ts` — check `deleteVersion` and `createVersion` for git cleanup/initialization logic.

### 2. [x] Clarify duplicate filename / sample ID handling (explanation only, no code changes)
**Area:** Backend — Dataset Service (sample grouping logic)
**Problem:** The current duplicate-handling behavior is unclear. Need to explain to the user how the system currently handles files with the same name being uploaded, and how sample IDs are derived and deduplicated.
**Action:** Investigate and explain the current logic — no code changes needed.
**Key file:** `apps/backend-services/src/benchmark/dataset.service.ts` — sample grouping logic in the upload handler.

### 3. [x] Delete spinner appears on all sample items instead of just the one being deleted
**Area:** Frontend — Sample Preview component
**Problem:** When clicking delete on a single sample in the sample preview list, the loading spinner appears on every sample row's delete icon, not just the one being deleted. This makes it unclear which item is actually being removed.
**Expected:** Only the specific sample being deleted should show a spinner. Track the loading state per sample ID rather than using a single boolean.
**Key file:** `apps/frontend/src/features/benchmarking/components/` — sample preview/list component.

### 4. [x] "View" button in sample preview does nothing
**Area:** Frontend — Sample Preview component
**Problem:** Clicking the "View" button on a sample item in the sample preview has no effect. No navigation, no modal, no preview — nothing happens.
**Expected:** The "View" button should show the sample's files (input document and ground truth if present). Either open a detail modal/panel or navigate to a sample detail view.
**Key file:** `apps/frontend/src/features/benchmarking/components/` — sample preview/list component, check the onClick handler.

### 5. [x] Upload dialog needs help text for pairing ground truth with input files
**Area:** Frontend — Upload Dialog
**Problem:** Users don't understand how to pair ground truth files with input documents. The upload dialog provides no guidance on naming conventions or file categorization.
**Expected:** Add help text or an info section to the upload dialog explaining:
- Files are categorized by MIME type: JSON/CSV/XML = ground truth, everything else = input.
- Ground truth files are paired with inputs by matching the sample ID (filename without extension, stripping `_gt` suffix). E.g. `invoice-001.pdf` pairs with `invoice-001_gt.json`.
- Include a brief example showing a valid pairing.
**Key file:** `apps/frontend/src/features/benchmarking/components/` — upload dialog component.

### 6. [x] Info icon breaks wrapping of required field red star on "Evaluator Type"
**Area:** Frontend — Create/Edit Benchmark Definition form
**Problem:** The "i" tooltip icon added next to "Evaluator Type" pushes the required-field red asterisk (*) onto a new line, breaking the visual layout. The label, asterisk, and info icon should all remain on the same line.
**Expected:** Fix the CSS/layout so the label, red star, and info icon are all inline and don't wrap. May need `white-space: nowrap`, `display: inline-flex`, or similar on the label container.
**Key file:** `apps/frontend/src/features/benchmarking/components/` — definition form component, label styling.

---

## Benchmark Runs

### 7. [x] Runs produce no aggregated metrics; sample results are empty; duplicate browse buttons
**Area:** Backend (Temporal workflow) + Frontend
**Problem:** After a benchmark run completes, no aggregated metrics are displayed. The Temporal log in the end:
{"activity":"upsertOcrResult","event":"skipped","reason":"document_not_found","documentId":"benchmark-Receipt_2025-11-12_124252 (2)","durationMs":17,"timestamp":"2026-02-27T08:24:06.535Z"}
[benchmarkRunWorkflow(benchmark-run-90dc6f56-fea8-4c2f-9fb8-27b6adac00c6)] {"activity":"benchmarkExecuteWorkflow","event":"complete","sampleId":"Receipt_2025-11-12_124252 (2)","status":"completed","completedNodes":9,"outputPaths":1,"durationMs":24412,"timestamp":"2026-02-27T08:24:06.604Z"}
No baseline run found for definition 676f848b-75a7-455d-83f4-3184e7d972c0
{"activity":"benchmarkUpdateRunStatus","event":"status_updated","runId":"90dc6f56-fea8-4c2f-9fb8-27b6adac00c6","status":"completed","hasMetrics":true,"hasError":false,"timestamp":"2026-02-27T08:24:07.003Z"}
{"activity":"benchmarkCompareAgainstBaseline","event":"no_baseline_found","runId":"90dc6f56-fea8-4c2f-9fb8-27b6adac00c6","definitionId":"676f848b-75a7-455d-83f4-3184e7d972c0","timestamp":"2026-02-27T08:24:07.031Z"}

The run completes with `hasMetrics: true` but the frontend shows nothing in aggregated metrics, "Browse Sample Results" is empty, and the drill-down summary is also empty. Additionally, "Browse Sample Results" and "View All Samples" appear to do the same thing but both buttons exist on the page — one should be removed.
**Expected:**
- **Fix metrics pipeline:** Investigate why `upsertOcrResult` skips with `document_not_found`. The benchmark document ID prefix (`benchmark-`) may not be resolving to an actual document record. Ensure the benchmark workflow creates or properly references document records so OCR results and subsequent evaluation can complete.
- **Fix results display:** Once metrics are actually produced, verify the frontend correctly fetches and displays aggregate metrics and per-sample results.
- **Remove duplicate button:** Remove one of "Browse Sample Results" / "View All Samples" since they serve the same purpose.
**Key files:**
- `apps/temporal/src/benchmark-workflow.ts` — workflow orchestration
- `apps/temporal/src/activities/upsert-ocr-result.ts` — where the skip happens
- `apps/frontend/src/features/benchmarking/components/` — run detail view

### 8. [x] Benchmark mode skips should log cleanly instead of Prisma errors
**Area:** Backend — Temporal activities
**Problem:** When the benchmark workflow skips operations (like OCR upsert) because the document doesn't exist in benchmark mode, Prisma still attempts the operation and throws a foreign key constraint error before the skip is logged:
```
prisma:error
Invalid `prisma.ocrResult.upsert()` invocation
Foreign key constraint violated on the constraint: `ocr_results_document_id_fkey`
```
The skip is then logged after the error. This results in noisy error logs for what is expected behavior in benchmark mode.
**Expected:** Check for benchmark mode **before** attempting the Prisma operation. If the document doesn't exist in benchmark mode, log an info-level message that the operation is being skipped due to benchmark mode, and return early — without ever calling Prisma. This issue exists in two places in the codebase that follow the same pattern.
**Key files:**
- `apps/temporal/src/activities/upsert-ocr-result.ts:121` — OCR result upsert
- Search for a second similar pattern in other Temporal activities

---

## Key Files Reference

| Area | Files |
|------|-------|
| Dataset service | `apps/backend-services/src/benchmark/dataset.service.ts` |
| Definition service | `apps/backend-services/src/benchmark/benchmark-definition.service.ts` |
| Run service | `apps/backend-services/src/benchmark/benchmark-run.service.ts` |
| Temporal workflow | `apps/temporal/src/benchmark-workflow.ts` |
| Temporal activities | `apps/temporal/src/activities/` |
| Frontend pages | `apps/frontend/src/features/benchmarking/pages/` |
| Frontend components | `apps/frontend/src/features/benchmarking/components/` |
| Frontend hooks | `apps/frontend/src/features/benchmarking/hooks/` |
| Backend DTOs | `apps/backend-services/src/benchmark/dto/` |
| Existing docs | `docs-md/BENCHMARKING_DATASET_UPLOAD.md` |
