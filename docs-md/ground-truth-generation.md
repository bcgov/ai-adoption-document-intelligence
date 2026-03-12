# Ground Truth Generation via HITL

## Overview

Ground truth generation is the third pathway for creating dataset ground truth, alongside:

1. **Manual upload** — Upload documents with ground truth files (e.g., PNG + JSON)
2. **From production HITL** — Import from reviewed production documents

This feature allows uploading raw documents without ground truth to a dataset version, running them through an OCR workflow, and then reviewing the results in a dedicated dataset-scoped HITL queue to generate ground truth.

## Architecture

### Data Model

The `DatasetGroundTruthJob` model tracks the lifecycle of each sample's ground truth generation:

```
DatasetGroundTruthJob
├── datasetVersionId → DatasetVersion
├── sampleId         (manifest sample ID)
├── documentId       → Document (created for workflow processing)
├── workflowConfigId (which workflow to run)
├── temporalWorkflowId
├── status           (pending → processing → awaiting_review → completed/failed)
├── groundTruthPath  (blob storage path of generated GT)
└── error
```

### Data Flow

```
1. Upload documents to dataset version (inputs only, no ground truth)
2. Click "Generate Ground Truth" and select a workflow template
3. System creates DatasetGroundTruthJob per sample without GT
4. For each job:
   a. Read input file from dataset storage
   b. Create Document record in DB
   c. Copy file to document storage
   d. Start OCR workflow (with confidenceThreshold=0 to skip humanGate)
5. Workflow runs OCR → stores results → document status = completed_ocr
6. Job status lazily transitions to awaiting_review
7. Documents appear in dataset-specific HITL queue (NOT production queue)
8. Reviewer reviews OCR results, makes corrections
9. On approval: buildGroundTruth() → write to dataset storage → update manifest
10. Ground truth available for benchmarking
```

### Queue Separation

Production and dataset HITL queues are separated at the database query level:

- **Production queue** (`GET /api/hitl/queue`): Filters `Document WHERE groundTruthJob IS NULL`
- **Dataset queue** (`GET /api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation/review/queue`): Queries `DatasetGroundTruthJob WHERE status = awaiting_review`

Both use the same `ReviewSession` and `FieldCorrection` models for the actual review.

## API Endpoints

### Ground Truth Generation

```
POST   /api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation
       Body: { workflowConfigId: string }
       Start ground truth generation for samples without GT.

GET    /api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation/jobs
       Query: page, limit
       List ground truth jobs with status.

GET    /api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation/review/queue
       Query: limit, offset, reviewStatus (pending|reviewed|all)
       Dataset-scoped HITL review queue.

GET    /api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation/review/stats
       Review queue statistics.
```

### Existing Endpoints (reused)

```
POST   /api/hitl/sessions                    Start a review session
POST   /api/hitl/sessions/:id/corrections    Submit corrections
POST   /api/hitl/sessions/:id/submit         Approve session (triggers GT extraction)
```

## Frontend

### Routes

- `/benchmarking/datasets/:id` — Dataset detail page with "Ground Truth" tab
- `/benchmarking/datasets/:id/versions/:versionId/review` — Dataset review queue
- `/benchmarking/datasets/:id/versions/:versionId/review/:sessionId` — Review workspace (reuses production HITL workspace)

### Components

- **GroundTruthGenerationPanel** — Tab content in dataset detail page showing workflow selector, job progress, and review queue link
- **DatasetReviewQueuePage** — Full-page review queue scoped to dataset version

## Key Files

### Backend
- `apps/shared/prisma/schema.prisma` — DatasetGroundTruthJob model
- `apps/backend-services/src/benchmark/ground-truth-generation.service.ts` — Core service
- `apps/backend-services/src/benchmark/ground-truth-generation.controller.ts` — API endpoints
- `apps/backend-services/src/benchmark/dto/ground-truth-generation.dto.ts` — DTOs
- `apps/backend-services/src/hitl/hitl.service.ts` — Post-approval hook
- `apps/backend-services/src/database/review-db.service.ts` — Production queue exclusion filter

### Frontend
- `apps/frontend/src/features/benchmarking/hooks/useGroundTruthGeneration.ts`
- `apps/frontend/src/features/benchmarking/hooks/useDatasetReviewQueue.ts`
- `apps/frontend/src/features/benchmarking/components/GroundTruthGenerationPanel.tsx`
- `apps/frontend/src/features/benchmarking/pages/DatasetReviewQueuePage.tsx`
