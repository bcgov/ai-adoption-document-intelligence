---
status: active
updated: 2026-06-17
canonical_sources:
  - docs-md/TABLES.md
  - docs-md/PATTERNS_NODE_AND_UI.md
  - docs-md/REFERENCE_DATA_TABLES_UI.md
  - apps/backend-services/src/tables/
  - apps/frontend/src/features/tables/
  - apps/temporal/src/activity-types.ts
do_not_duplicate:
  - Lookup DSL operator tables
  - JSONB schema definitions
  - Full UI component reference
  - API endpoint details
---

# Tables and Extensions

Reference Data Tables provide group-scoped lookup data that graph workflows query at runtime through the `tables.lookup` activity. This is the preferred extension pattern when user-managed configuration can drive generic workflow behavior instead of new node types or feature-specific machinery.

## Source Map

- Data model, lookup DSL, and runtime behavior live in `docs-md/TABLES.md`.
- Shared node/UI extension patterns live in `docs-md/PATTERNS_NODE_AND_UI.md`.
- Frontend table and lookup UI reference lives in `docs-md/REFERENCE_DATA_TABLES_UI.md`.
- Backend CRUD and validation live in `apps/backend-services/src/tables/`.
- Frontend authoring UI lives under `apps/frontend/src/features/tables/`.
- Activity registration includes `tables.lookup` in `apps/temporal/src/activity-types.ts`.

## Design Notes

- Tables are group-scoped reusable configuration; contrast with [HITL](hitl.md), which is per-document session state.
- Prefer extending via tables plus existing activities before adding new graph node types.
- Lookup definitions share condition-expression semantics with workflow graph logic; keep filter operators aligned across docs and code.

## Related Topics

- [Graph workflows](graph-workflows.md): activity registration, execution, and when to add nodes vs reuse tables.
- [Workflow builder](workflow-builder.md): authoring UI for wiring table lookup output into workflows.
- [Auth and groups](auth-and-groups.md): group scoping and authorization for table ownership.

## Common Drift Risks

- UI lookup templates can drift from backend lookup validation rules.
- `PATTERNS_NODE_AND_UI.md` and `TABLES.md` overlap by design; keep schema/runtime detail in TABLES and cross-cutting UI patterns in PATTERNS.
- Feature docs under `feature-docs/` may describe pre-implementation table behavior that differs from the JSONB model.
