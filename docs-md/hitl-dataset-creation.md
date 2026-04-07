# HITL Dataset Creation

## Overview

This feature allows creating benchmark datasets from documents that have been processed through the OCR pipeline and verified via the Human-In-The-Loop (HITL) review interface. The verified/corrected OCR data becomes ground truth, eliminating the need to upload pre-existing ground truth files.

## Architecture

```
Document Processing Pipeline          Benchmarking System
┌─────────────────────────┐           ┌──────────────────────┐
│ Document                │           │ Dataset              │
│ ├─ OcrResult            │  HitlDS   │ ├─ DatasetVersion    │
│ └─ ReviewSession        │ ───────►  │ │  ├─ manifest.json  │
│    └─ FieldCorrection   │  Service  │ │  ├─ inputs/        │
└─────────────────────────┘           │ │  └─ ground-truth/  │
                                      │ └─ Splits            │
                                      └──────────────────────┘
```

The `HitlDatasetService` bridges the two systems by:
1. Querying documents with approved HITL review sessions
2. Building ground truth by applying field corrections to OCR results
3. Packaging document files and ground truth into the standard dataset format

## Eligibility

A document is eligible for dataset creation when:
- Status is `completed_ocr`
- Has at least one `ReviewSession` with status `approved`

When a document has multiple approved sessions, the most recent one (by `completed_at`) is used.

## Ground Truth Construction

For each selected document, corrections from the approved review session are applied to the `OcrResult.keyValuePairs`:

| Correction Action | Effect |
|---|---|
| `confirmed` | Keep original field value, set confidence to 1.0 |
| `corrected` | Update field content with corrected value, set confidence to 1.0 |
| `deleted` | Remove field from ground truth |
| `flagged` | Keep field as-is, set confidence to 1.0 |

The output is in `ExtractedFields` format (same structure as OCR output) for compatibility with existing evaluators.

Pseudo-fields (e.g., `_escalation`) are skipped during ground truth construction.

## API Endpoints

### List eligible documents

```
GET /api/benchmark/datasets/from-hitl/eligible-documents
  ?page=1
  &limit=20
  &search=invoice
```

Returns paginated list of documents with approved HITL sessions, including filename, file type, approval date, reviewer, field count, and correction count.

### Create dataset from HITL documents

```
POST /api/benchmark/datasets/from-hitl
{
  "name": "My Dataset",
  "description": "Created from verified documents",
  "documentIds": ["doc-id-1", "doc-id-2"]
}
```

Creates a new dataset and version. Returns the dataset, version, and any skipped documents with reasons.

### Add version from HITL documents

```
POST /api/benchmark/datasets/:id/versions/from-hitl
{
  "version": "v2",
  "name": "Second batch",
  "documentIds": ["doc-id-3", "doc-id-4"]
}
```

Adds a new version to an existing dataset.

## Dataset Storage Format

Files are stored in the standard benchmark dataset layout:

```
datasets/{datasetId}/{versionId}/
├── dataset-manifest.json
├── inputs/
│   ├── invoice-001.pdf
│   └── invoice-002.pdf
└── ground-truth/
    ├── invoice-001.json
    └── invoice-002.json
```

Each ground truth JSON file contains flat key-value pairs — the same format as manually uploaded ground truth and as predictions produced by the benchmark workflow:

```json
{
  "vendor_name": "Acme Corp",
  "total_amount": 1250.75,
  "invoice_date": "2026-01-15",
  "checkbox_paid": "selected"
}
```

Field values are resolved using the same logic as `extractAzureFieldDisplayValue` (`apps/temporal/src/azure-ocr-field-display-value.ts`), which the benchmark workflow uses when flattening predictions (`buildFlatPredictionMapFromCtx`): `valueSelectionMark` → "selected"/"unselected", `valueNumber` → number, `valueDate` → date string, `valueString` → string, fallback to `content`.

Provenance information (source document ID, review session, reviewer) is stored in each manifest sample's `metadata`, not in the ground truth file itself.

## Frontend

### Entry Points

1. **Dataset List Page** - "From Verified Documents" button opens the creation dialog
2. **Dataset Detail Page** - "From Verified Documents" button adds a version to the existing dataset

### Dialog Flow

The `CreateDatasetFromHitlDialog` is a multi-step modal:

1. **Dataset Info** (new dataset only) - Name and description
2. **Select Documents** - Table with checkboxes, search, and pagination
3. **Confirm** - Summary and submit

## Files

### Backend
- `apps/backend-services/src/benchmark/hitl-dataset.service.ts` - Core service
- `apps/backend-services/src/benchmark/hitl-dataset.controller.ts` - REST endpoints
- `apps/backend-services/src/benchmark/dto/eligible-documents.dto.ts` - Query DTOs
- `apps/backend-services/src/benchmark/dto/create-dataset-from-hitl.dto.ts` - Creation DTOs

### Frontend
- `apps/frontend/src/features/benchmarking/components/CreateDatasetFromHitlDialog.tsx` - Dialog component
- `apps/frontend/src/features/benchmarking/hooks/useEligibleDocuments.ts` - Eligible docs hook
- `apps/frontend/src/features/benchmarking/hooks/useCreateDatasetFromHitl.ts` - Creation mutation hook
