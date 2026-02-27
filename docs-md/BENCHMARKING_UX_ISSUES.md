# Benchmarking System: UX & Bug Fix Checklist

Tracked issues discovered during manual testing of the benchmarking system. Each item includes context for implementation.

---

## Dataset Versions

### 1. [x] Delete version has no confirmation dialog
**Area:** Frontend — Dataset Detail Page
**Problem:** Clicking "Delete Version" immediately deletes without asking the user to confirm. Accidental clicks can destroy data.
**Expected:** Show a confirmation dialog (e.g. "Are you sure you want to delete version v3? This cannot be undone.") before calling the delete API.

### 2. [x] "New Version" immediately shows upload dialog — confusing UX
**Area:** Frontend — Dataset Detail Page
**Problem:** When user clicks "New Version", a draft version is created and the upload dialog opens automatically. It's not obvious that the upload dialog is for the newly created version — it feels disconnected.
**Expected:** Make it clear that the upload popup belongs to the new version. Options: add the version label to the upload dialog title (e.g. "Upload files to v3"), or restructure so the version detail opens first with an upload button inside it.

### 3. [x] No upload button on the sample preview view
**Area:** Frontend — Dataset Detail / Sample Preview
**Problem:** Once files are uploaded and you're viewing the sample list, there's no way to upload more files from that view. You have to navigate away to trigger the upload dialog again.
**Expected:** Add an "Upload Files" button to the sample preview view (for draft versions) so users can see existing samples alongside uploading new ones.

### 4. [x] Duplicate filenames produce shared sample IDs incorrectly
**Area:** Backend — Dataset Service (sample grouping logic)
**Problem:** Uploading two files with the same name (e.g. `inputs/2025-11-13_135834.jpg` twice) results in them sharing a single sample ID `2025-11-13_135834`. The sample ID derivation strips the extension and groups files by the resulting string, so identically-named files collapse into one sample.
**Expected:** Sample ID generation should handle duplicate filenames. Options: append a numeric suffix to duplicates (e.g. `2025-11-13_135834`, `2025-11-13_135834_2`), or reject duplicate filenames with a clear error message.
**Key file:** `apps/backend-services/src/benchmark/dataset.service.ts` — look at the sample grouping logic in the upload handler.

---

## Benchmark Definitions

### 5. [x] Dataset version selector doesn't show parent dataset name
**Area:** Frontend — Create/Edit Benchmark Definition form
**Problem:** When selecting a dataset version for a benchmark definition, the dropdown only shows version labels (e.g. "v1", "v2") without indicating which dataset they belong to. With multiple datasets each having multiple versions, this is unusable.
**Expected:** Show entries as "Dataset Name — v1" or group versions under their parent dataset in the dropdown. Consider a two-step selector: pick dataset first, then pick version.

### 6. [x] Evaluator config JSON field has no guidance; missing help icons
**Area:** Frontend — Create/Edit Benchmark Definition form
**Problem:** The "Evaluator Config (JSON)" field is a blank textarea with no indication of what schema or keys are expected. Users don't know what to put in it. Additionally, "Evaluator Type", "Use Production Queue", and "Artifact Policy" have no explanations.
**Expected:**
- Add a help/example section or collapsible hint beside the evaluator config field showing a sample JSON structure.
- Add small question-mark (?) tooltip icons next to "Evaluator Type", "Use Production Queue", and "Artifact Policy" explaining what each does.
- Verify that "Use Production Queue" and "Artifact Policy" are actually implemented end-to-end (backend respects the values during runs). If not, implement the missing functionality.

### 7. [x] Cannot delete benchmark definitions
**Area:** Frontend + Backend
**Problem:** There is no UI or API endpoint to delete a benchmark definition. Users who create test or erroneous definitions have no way to clean them up.
**Expected:** Add a delete action to benchmark definitions (with confirmation dialog). Backend should check for active/running runs before allowing deletion, or cascade-delete completed runs.

---

## Benchmark Runs

### 8. [x] Cannot delete benchmark runs
**Area:** Frontend + Backend
**Problem:** There is no way to delete benchmark runs. Failed or test runs accumulate with no cleanup mechanism.
**Expected:** Add a delete action to benchmark runs (with confirmation dialog). Consider allowing bulk deletion of completed/failed runs.

### 9. [x] Runs produce empty metrics and no way to inspect results
**Area:** Backend (Temporal workflow / evaluation logic) + Frontend
**Problem:** Running a benchmark with 4 samples produces aggregate metrics showing `"metrics": {}, "passRate": 0, "failingSamples": 4, "passingSamples": 0`. The evaluation step appears to not be producing per-sample metrics. Additionally, there is no UI to drill into individual sample results — users only see the aggregate.
**Expected:**
- **Fix the metrics bug:** Investigate the Temporal benchmark workflow (`apps/temporal/src/benchmark-workflow.ts`) and the evaluation activity to determine why metrics are empty and all samples are failing. Likely causes: evaluator not being invoked correctly, evaluator config not passed through, or results not being collected properly.
- **Add run results browser:** Build a UI to view per-sample results within a run — showing input document, expected output, actual output, pass/fail status, and individual metrics. This gives users the insight they need to understand benchmark performance.

---

## Key Files Reference

| Area | Files |
|------|-------|
| Dataset service | `apps/backend-services/src/benchmark/dataset.service.ts` |
| Definition service | `apps/backend-services/src/benchmark/benchmark-definition.service.ts` |
| Run service | `apps/backend-services/src/benchmark/benchmark-run.service.ts` |
| Temporal workflow | `apps/temporal/src/benchmark-workflow.ts` |
| Frontend pages | `apps/frontend/src/features/benchmarking/pages/` |
| Frontend components | `apps/frontend/src/features/benchmarking/components/` |
| Frontend hooks | `apps/frontend/src/features/benchmarking/hooks/` |
| Backend DTOs | `apps/backend-services/src/benchmark/dto/` |
| Existing docs | `docs-md/BENCHMARKING_DATASET_UPLOAD.md` |
