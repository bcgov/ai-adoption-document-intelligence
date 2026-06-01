# SDPR HITL timing experiment

Temporary hack to time how long a real HITL review of the 99-document SDPR
benchmark takes, using the existing HITL UI but loading documents + OCR
data from the network share instead of MinIO/Azure + DB.

> **All pieces here are temporary hacks for a one-off experiment.**
> They're gated entirely by env vars and don't change production behavior
> when those vars are unset. Don't merge to `main`.

## PII handling: no values touch local disk

The whole point of this design is that **no document field values touch
your local DB or local disk** during the experiment:

- **PDFs** are streamed from the share via PowerShell → in-memory Buffer →
  HTTP response. Never written to disk.
- **OCR field predictions** are read from the benchmark JSON on the share
  on first request, parsed once, and cached in **backend process memory
  only**. They disappear on backend restart.
- **`OcrResult` rows are NOT created** for experiment docs — the seed
  creates only minimal `Document` metadata (title, filename, source).
- **`FieldCorrection` rows** for experiment docs are stored with
  `original_value=null` and `corrected_value=null`. Only the field key,
  the action (confirmed/corrected/flagged/deleted), and the timestamp
  are persisted. That's enough to measure per-correction review time
  without persisting any reviewer-typed PII.

## Files

| Path | Purpose |
|---|---|
| `seed-documents.ts` | Reads benchmark JSON from stdin, creates 99 Document rows (metadata only, no OcrResult) |
| `seed-from-share.sh` | Streams JSON from a UNC path into the seeder |
| `teardown.ts` | Removes experiment-tagged documents (by `metadata.experiment`) |
| `export-timings.ts` | Exports `sessions.csv` + `corrections.csv` for analysis |
| `apps/backend-services/src/blob-storage/unc-filesystem-blob-storage.service.ts` | Read-only UNC blob adapter (PDFs from share) |
| `apps/backend-services/src/hitl/experiment-ocr-loader.service.ts` | In-memory OCR loader (JSON from share) |
| `apps/backend-services/src/hitl/experiment-field-filter.ts` | Field allow-list filter |

## Setup

Add these to `apps/backend-services/.env`:

```bash
# PDFs: point the backend's blob adapter at the UNC share
BLOB_STORAGE_PROVIDER=unc-filesystem
UNC_BLOB_STORAGE_BASE=\\widget\SDPRDocuments\convert_sd0081\100-doc

# OCR data: point the in-memory loader at the benchmark JSON on the share
EXPERIMENT_BENCHMARK_JSON_PATH=\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report\benchmark-result-neural-normalized.json

# Bounding boxes: point the loader at the OCR cache dir so the HITL UI
# can highlight each field on the PDF (lazy-loaded per sample on first view).
EXPERIMENT_OCR_CACHE_DIR=\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report\ocr-cache-dfaddb26

# Field filter: trim HITL field list to the 5 reviewable categories
EXPERIMENT_FIELD_FILTER=sin,phone,name,date,income_amounts
```

> **Important**: when `BLOB_STORAGE_PROVIDER=unc-filesystem`, the rest of
> the app (workflow uploads, OCR pipeline, etc.) will fail on writes
> because the UNC adapter is read-only. Only set these vars in a backend
> instance dedicated to the experiment.

**Restart the backend** after editing `.env`.

## Run the experiment

```bash
# 1. (Optional) smoke test with 1 document first
bash scripts/sdpr-experiment/seed-from-share.sh \
    '\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report\benchmark-result-neural-normalized.json' \
    --limit 1

# 2. Verify via API:
#    - The doc should appear in /api/hitl/queue?maxConfidence=1.0
#    - Starting a review session should return only the ~5 reviewable
#      fields (not all 75)
#    - The PDF endpoint should stream from the share

# 3. Seed all 99 documents
bash scripts/sdpr-experiment/seed-from-share.sh \
    '\\widget\SDPRDocuments\convert_sd0081\100-doc\2026-05-05 performance report\benchmark-result-neural-normalized.json'

# 4. Open the HITL UI in a browser. Set maxConfidence=1.0 to see all 99
#    docs in the queue. Review each one — timing is captured automatically
#    via ReviewSession.started_at / .completed_at and FieldCorrection
#    timestamps.

# 5. Export timings
npx tsx scripts/sdpr-experiment/export-timings.ts \
    --out-dir ./scripts/sdpr-experiment/output

# 6. Clean up when done (removes experiment-tagged docs + sessions + corrections)
npx tsx scripts/sdpr-experiment/teardown.ts
```

## What the reviewer sees

- HITL queue lists 99 documents, one per benchmark sample.
- Each document shows ~5–6 reviewable predictions on average (559 total
  across 99 docs):
  - sin (97 items), date (109), phone (98), name (115), income (140).
- PDF is loaded from the share via the UNC adapter.
- Reviewer confirms or corrects each prediction. The corrected value is
  collected by the UI but null'd before persistence — only the action +
  timestamp survive.

The `reviewable-items.csv` at `\\widget\…\reviewable-items.csv` lists
every prediction the reviewer would see (same filter applied), with
the ground-truth values alongside for analysis after the experiment.

## How the experiment-mode kicks in

1. Seeder writes `Document.metadata = { experiment: "sdpr-hitl-timing-experiment", sampleId }`
2. `HitlService.getOcrFieldsForDocument()` reads the metadata marker:
   - **Marker present** + `EXPERIMENT_BENCHMARK_JSON_PATH` set →
     `ExperimentOcrLoaderService.getFieldsForSample(sampleId)`
   - **Marker absent** → `doc.ocr_result.keyValuePairs` (DB) as in production
3. `HitlService.getDisplayAllowlistForDocument()` returns the per-doc
   reviewable allow-list from the loader (see "Exact alignment" below).
   The field filter then keeps only fields whose name is in the allow-list.
4. `submitCorrections()` reads the same marker to null out values before
   calling `createFieldCorrection`.

When the env vars are unset, none of the new code paths fire — production
behavior is unchanged.

## Exact alignment with `reviewable-items.csv`

The HITL UI shows the **exact same** items as `reviewable-items.csv` — no
approximation. Both are derived from the same `predicted` + `expected`
data in the benchmark JSON using identical rules:

| Stage | Where | Rule |
|---|---|---|
| Offline CSV | `scripts/benchmark analysis/reviewable-items.py` | category ∈ {sin,phone,name,date,income} AND not (predicted∅ AND expected∅) AND (for income only) NOT trivial-predicted |
| Backend allow-list | `ExperimentOcrLoaderService.load()` | same rule, in TypeScript |
| HITL filter | `applyExperimentFieldFilter(fields, env, allowlist)` | pure allow-list lookup against `fields` keys |

**Verifying alignment**: after the backend has loaded the JSON, it logs
`Reviewable items: <N>`. That number should match the row count of
`reviewable-items.csv` (excluding header). For the current benchmark JSON
that's **559 items across 99 documents**:

- 97 sin, 109 date, 98 phone, 115 name, 140 income_amounts (allow-list)
- 440 matched + 98 wrong + 18 extra + 3 missing (by kind)

The 3 "missing" items (predicted blank, GT has value) are surfaced in
HITL **because they're in the allow-list** — the reviewer sees an empty
field and is expected to verify/fill it. The runtime-only category
filter (env-var-only fallback mode) would silently drop these; the
allow-list mode does not.
