# Workflow Config Overrides

## Overview

When creating a benchmark definition, users can override exposed workflow parameters (like OCR model, confidence threshold, review timeout). Overrides are stored on the definition and applied at run time.

## How It Works

1. Workflow templates define `exposedParams` in their `nodeGroups`, each with a `path`, `type`, `default`, and optional `options`
2. When creating/editing a benchmark definition, users provide a JSON object mapping exposed param paths to override values
3. Overrides are validated against the workflow's `exposedParams` — unknown paths are rejected, `select`-type values must be in the allowed options
4. When a run starts, overrides are deep-applied to a copy of the workflow config before it's passed to Temporal
5. The original workflow config is never modified
6. Overrides become immutable along with the rest of the definition once the first run starts

## Example

For the standard-ocr-workflow which exposes:
- `ctx.modelId.defaultValue` (select: prebuilt-layout, prebuilt-read, prebuilt-document)
- `nodes.checkConfidence.parameters.threshold` (number, default: 0.95)
- `nodes.humanReview.timeout` (duration, default: "24h")

A definition can override:

```json
{
  "ctx.modelId.defaultValue": "prebuilt-read",
  "nodes.checkConfidence.parameters.threshold": 0.8
}
```

## API

- `POST /api/benchmark/projects/:projectId/definitions` — accepts optional `workflowConfigOverrides` field
- `PUT /api/benchmark/projects/:projectId/definitions/:definitionId` — can update overrides
- Overrides are returned in `GET` responses on the `workflowConfigOverrides` field
- Run `params` includes `workflowConfigOverrides` for traceability

## Frontend

- When selecting a workflow in the Create Definition dialog, the overrides textarea auto-populates with defaults from the workflow's exposed params
- Users edit the JSON to change values
- Overrides are displayed in the definition detail view and run detail page

## Key Implementation Files

- `apps/backend-services/src/benchmark/workflow-config-overrides.ts` — utility functions
- `apps/backend-services/src/benchmark/benchmark-definition.service.ts` — validation on create/update
- `apps/backend-services/src/benchmark/benchmark-run.service.ts` — applies overrides at run start
- `apps/frontend/src/features/benchmarking/components/CreateDefinitionDialog.tsx` — JSON editor
