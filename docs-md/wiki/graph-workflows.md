---
status: active
updated: 2026-06-17
canonical_sources:
  - docs-md/graph-workflows/
  - docs-md/workflow-builder/
  - docs-md/PATTERNS_NODE_AND_UI.md
  - packages/graph-workflow/
  - apps/backend-services/src/workflow/
  - apps/backend-services/src/ocr/
  - apps/temporal/src/graph-engine/
  - apps/temporal/src/activity-registry.ts
do_not_duplicate:
  - Full graph schema
  - Activity registration checklist
  - Workflow builder user guide
  - Workflow template JSON
---

# Graph Workflows

Graph workflows are the durable execution substrate for document processing. The shared package defines graph types and validation, backend services persist and validate workflow configs, and the Temporal worker executes graph nodes through registered activities.

## Source Map

- Engine behavior lives under `docs-md/graph-workflows/`, especially the DAG engine and adding-node guides.
- Workflow builder authoring context lives under `docs-md/workflow-builder/` and the [Workflow builder](workflow-builder.md) wiki topic.
- Shared graph types and validators live in `packages/graph-workflow/`.
- Backend save-time validation and workflow APIs live in `apps/backend-services/src/workflow/`.
- OCR starts workflow execution through `apps/backend-services/src/ocr/`.
- Temporal runtime execution lives in `apps/temporal/src/graph-engine/` and activity registration files.

## Design Notes

- Prefer adding a new activity when existing node semantics are enough.
- Add a new node type only when the graph engine needs new execution semantics.
- For user-managed configuration that drives a generic activity, follow the [Tables and extensions](tables-and-extensions.md) pattern instead of creating feature-specific workflow machinery.

## Related Topics

- [Workflow builder](workflow-builder.md): frontend authoring UI and workflow JSON editing.
- [Tables and extensions](tables-and-extensions.md): reference data lookups via `tables.lookup`.
- [Blob storage](blob-storage.md): blob I/O activities and storage-backed workflow paths.
- [HITL](hitl.md): human review nodes and pause/resume interactions with workflows.

## Common Drift Risks

- Activity type lists must stay aligned across backend validation, Temporal worker registration, and workflow-safe constants.
- UI templates can make workflow authoring easier, but canonical workflow JSON remains the interchange format.
- Engine docs and builder docs intentionally overlap; keep engine semantics in graph-workflow docs and authoring guidance in workflow-builder docs.
