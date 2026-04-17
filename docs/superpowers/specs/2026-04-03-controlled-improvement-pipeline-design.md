# Controlled Improvement Pipeline + Immutability Fix

**Date:** 2026-04-03
**Status:** Draft

## Problem

The current OCR improvement pipeline has two issues:

1. **Immutability violation:** `promoteCandidateWorkflow` mutates existing definitions in place (updating `workflowVersionId` and `workflowConfigHash` via `updateMany`), bypassing the revision mechanism that protects definitions with existing runs.

2. **All-or-nothing flow:** The pipeline generates a candidate workflow AND starts a benchmark run in a single API call. There is no way to review, edit, or test the candidate before benchmarking. The `workflowConfigOverride` mechanism creates a one-off run that operates outside the system's normal Definition → Workflow → Run pattern.

## Design

### 1. New "Generate Candidate" Endpoint

**`POST /api/benchmark/projects/:projectId/definitions/:definitionId/ocr-improvement/generate`**

Runs steps 1-7 of the current pipeline:
1. Aggregate HITL corrections
2. Get tool manifest
3. Build AI input with current workflow summary and insertion slots
4. Run AI recommendation
5. Apply recommendations to create candidate config
6. Validate candidate config
7. Create candidate workflow (`WorkflowLineage` with `workflow_kind: "benchmark_candidate"`, `source_workflow_id` pointing to the base lineage)

**Request body** (same optional fields as today):
```json
{
  "hitlFilters": { "groupIds": [...], "startDate": "...", "endDate": "..." },
  "normalizeFieldsEmptyValueCoercion": "none" | "blank" | "null"
}
```

**Response:**
```json
{
  "candidateWorkflowVersionId": "uuid",
  "candidateLineageId": "uuid",
  "recommendationsSummary": {
    "applied": 2,
    "rejected": 0,
    "toolIds": ["ocr.characterConfusion", "ocr.normalizeFields"]
  },
  "analysis": "AI reasoning text",
  "status": "candidate_created" | "no_recommendations" | "error",
  "pipelineMessage": "...",
  "rejectionDetails": ["..."],
  "error": "..."
}
```

Does NOT start a benchmark run. The candidate workflow is immediately visible in the workflow editor.

### 2. User Flow After Generation

All existing patterns — no new endpoints needed:

1. **Review/edit** the candidate in the workflow editor (existing UI)
2. **Create a benchmark definition** pointing to the candidate workflow (existing UI — same as creating any definition)
3. **Start a run** from that definition (existing UI — normal run, no overrides)
4. **Compare results** against the original baseline using existing pair comparison

### 3. "Apply to Base Workflow" Button

**Displayed on the run detail page when:**
- Run status is `completed`
- The run's definition's workflow lineage has `workflow_kind: "benchmark_candidate"` and a non-null `source_workflow_id`

**On click — confirmation dialog with:**
- Summary of what will happen (new version on base lineage)
- Checkbox (on by default): **"Clean up candidate artifacts"** — deletes the candidate lineage, all definitions pointing to it, and their associated runs

**Backend action (`POST /api/benchmark/projects/:projectId/apply-candidate-to-base`):**

Request body:
```json
{
  "candidateWorkflowVersionId": "uuid",
  "cleanupCandidateArtifacts": true
}
```

Steps:
1. Validate the candidate version exists, has `workflow_kind: "benchmark_candidate"`, and has a `source_workflow_id`
2. Load the candidate config
3. Create a new `WorkflowVersion` on the base lineage (from `source_workflow_id`) with the candidate config, increment `version_number`
4. Update the base lineage's `head_version_id` to the new version
5. If `cleanupCandidateArtifacts` is true:
   - Find all `BenchmarkDefinition`s whose `workflowVersionId` points to any version on the candidate lineage
   - Delete their associated `BenchmarkRun`s (cascade)
   - Delete those definitions
   - Delete the candidate lineage (cascades to its versions)
6. Return the new base workflow version ID

### 4. Removals

- **Remove `promoteCandidateWorkflow`** from `BenchmarkDefinitionService` and its controller route (`POST .../promote-candidate-workflow`)
- **Remove `POST .../ocr-improvement/run`** (the combined generate+benchmark endpoint)
- **Remove the old "Apply candidate to base workflow" button** on the run detail page (the one that checks for `candidateWorkflowVersionId` in run params)
- **Add TODO comment on `workflowConfigOverride` in `CreateRunDto`** noting it is no longer used by the pipeline and should be removed if no other consumers exist

### 5. What Stays Unchanged

- **OCR cache** (persist + replay) — unchanged
- **Baseline comparison** on run completion — unchanged
- **Candidate workflow creation** (`createCandidateVersion` in `WorkflowService`) — still used by the generate endpoint
- **`startRun` API** — unchanged; runs are started normally from definitions
- **Immutability/revision mechanism** in `updateDefinition` — unchanged; not involved in this flow since definitions are created new, not mutated

## File Impact Summary

### Backend — Modified
- `apps/backend-services/src/benchmark/ocr-improvement-pipeline.service.ts` — extract generate logic from `run()` into a new `generate()` method; remove benchmark-starting code
- `apps/backend-services/src/benchmark/ocr-improvement-pipeline.controller.ts` — new `/generate` route; remove `/run` route
- `apps/backend-services/src/benchmark/benchmark-definition.service.ts` — remove `promoteCandidateWorkflow`; add `applyToBaseWorkflow` (or new service)
- `apps/backend-services/src/benchmark/benchmark-definition.controller.ts` — remove promote-candidate route; add apply-to-base route
- `apps/backend-services/src/benchmark/dto/create-run.dto.ts` — add TODO on `workflowConfigOverride`

### Backend — New
- DTO for generate response
- DTO for apply-to-base request/response

### Frontend — Modified
- `apps/frontend/src/features/benchmarking/pages/RunDetailPage.tsx` — replace old "Apply candidate to base workflow" button with new one (check `workflow_kind` instead of run params); add confirmation dialog with cleanup checkbox
- `apps/frontend/src/features/benchmarking/components/DefinitionDetailView.tsx` — update "Run improvement pipeline" button to call generate endpoint; adjust UI to show candidate result without auto-navigating to a run

### Frontend — New
- Hook or API call for the generate endpoint
- Hook or API call for the apply-to-base endpoint

### Tests — Modified/New
- Update `ocr-improvement-pipeline.service.spec.ts` for the new generate-only flow
- Update/add tests for apply-to-base with and without cleanup
- Remove tests for `promoteCandidateWorkflow`
- Remove tests for the combined `/run` endpoint

### Documentation — Modified
- `docs-md/OCR_IMPROVEMENT_PIPELINE.md` — update to reflect new flow
