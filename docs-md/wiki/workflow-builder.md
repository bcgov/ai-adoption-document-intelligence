---
status: active
updated: 2026-06-17
canonical_sources:
  - docs-md/workflow-builder/
  - docs-md/PATTERNS_NODE_AND_UI.md
  - apps/frontend/src/pages/WorkflowListPage.tsx
  - apps/frontend/src/pages/WorkflowEditorPage.tsx
  - apps/frontend/src/types/graph-workflow.ts
do_not_duplicate:
  - Full node catalog
  - Workflow builder user guide
  - Graph engine execution semantics
  - Workflow JSON schema
---

# Workflow Builder

The workflow builder UI edits workflows through a structured form editor (the default) or raw JSON (CodeMirror), and shows a read-only React Flow visualization (pan/zoom only, no canvas drag-and-drop). Full drag-and-drop canvas authoring is design-target material in `docs-md/workflow-builder/WORKFLOW_BUILDER_GUIDE.md`.

## Source Map

- Authoring guides and design context live under `docs-md/workflow-builder/`.
- Shared node and UI extension patterns live in `docs-md/PATTERNS_NODE_AND_UI.md`.
- The routed editor lives in `apps/frontend/src/pages/WorkflowEditorPage.tsx`; the list view lives in `WorkflowListPage.tsx`. (`WorkflowPage.tsx` and `WorkflowEditPage.tsx` are legacy and not routed.)
- The form editor (`GraphConfigFormEditor`) and read-only `GraphVisualization` are the active editing surfaces.
- Shared frontend graph types live in `apps/frontend/src/types/graph-workflow.ts`.

## Design Notes

- Canonical workflow JSON is the interchange format; UI templates and palettes are helpers, not a second source of truth.
- Engine behavior, activity registration, and Temporal execution are documented under [Graph workflows](graph-workflows.md), not here.
- For user-managed configuration that feeds generic activities, prefer [Tables and extensions](tables-and-extensions.md) over builder-specific feature work.

## Related Topics

- [Graph workflows](graph-workflows.md): DAG engine, activity registration, and backend validation.
- [Tables and extensions](tables-and-extensions.md): wiring lookup output into workflow nodes.
- [System overview](system-overview.md): frontend vs backend vs Temporal boundaries.

## Common Drift Risks

- Node palette and catalog docs can lag newly registered Temporal activities.
- Read-only visualization and full editor capabilities may be described inconsistently in README and builder docs.
- Workflow builder docs and graph-workflows engine docs intentionally overlap; keep authoring guidance here and execution semantics in graph-workflows docs.
