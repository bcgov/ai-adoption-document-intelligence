# Architectural Pattern: Workflow Nodes with Configuration UI (Tables Pattern)

## Overview

This document describes the architectural pattern that the Tables feature established for "extensions" — capabilities that pair a generic Temporal activity (which executes inside a workflow) with a configuration UI (which users use to manage the data or rules that drive that activity). The pattern separates concerns cleanly: the workflow activity is stable and registered once; the configuration data it consults is managed by users at their own pace via the REST API and frontend. This document is a reference point for contributors adding the next extension of this kind.

---

## Decision Tree

Use this to choose the right pattern for a new capability:

**Need a new graph workflow node type with new control-flow semantics** (e.g., a new branching or looping primitive, a new join strategy)?
→ Use **Scenario B** in [docs-md/graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md](graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md). This adds a new `NodeType` to the engine itself.

**Need a domain-specific activity that runs a fixed computation or calls an external service** (no user-managed configuration data — e.g., an enrichment service call, a static format conversion)?
→ Use **Scenario A** in the same doc. Register one activity function, wire it into the activity dispatch map, no UI needed.

**Need a mechanism that lets users define configuration data via the UI, with that data driving workflow execution** (e.g., reference tables, custom decision rules, configurable validators)?
→ Use the **Tables pattern** described in detail below.

**Need per-document-instance state with locking, sessions, or review queues** (e.g., human-in-the-loop review where a reviewer claims a document and makes corrections)?
→ Use the **HITL pattern** — a different architecture. See [docs-md/HITL_ARCHITECTURE.md](HITL_ARCHITECTURE.md).

---

## The Tables Pattern (Worked Example)

Tables was built following five core principles. Each is described below alongside the concrete implementation choice made.

### 1. Schema-as-Data

**Principle**: do not add per-feature Prisma models or database migrations for each logical "table" a user creates. Instead, define two generic models and store the schema inside JSONB columns.

**Implementation**: Two Prisma models cover the entire feature regardless of how many tables users create:

- `Table` — stores `columns` (array of `ColumnDef`) and `lookups` (array of `LookupDef`) as JSONB.
- `TableRow` — stores the row payload as a JSONB `data` field.

A new user-defined table is a row in the `Table` model, not a new database table. Adding a column is a JSON array append, not `ALTER TABLE`. This means:
- Zero migrations when users add tables or columns.
- The schema is queryable (the backend validates rows against `ColumnDef[]` at write time).
- Old rows aren't broken by schema changes — the lookup engine evaluates against whatever data is present.

**File locations**: `apps/backend-services/src/tables/` (service, DB layer, validation), `prisma/schema.prisma` (`Table` + `TableRow` models).

### 2. One Generic Activity

**Principle**: don't register a separate Temporal activity per user-defined table. One activity handles all tables.

**Implementation**: `tables.lookup` (registered in `apps/temporal/src/activities/tables-lookup.ts`) accepts `{ groupId, tableId, lookupName, ...params }`, loads the table from the database at execution time, finds the named lookup definition, and runs the filter + sort + pick logic in `apps/temporal/src/tables/lookup-engine.ts`.

There is no per-table activity registration. Adding a new table, column, or lookup definition does not require any code change or service redeployment. The activity is the execution substrate; the configuration data (stored in Postgres) is what varies.

### 3. Schema-Driven UI

**Principle**: don't write per-table form code in the frontend.

**Implementation**: the row create/edit form (`RowForm`) is built dynamically from the `ColumnDef[]` array fetched from the API. A Zod schema is constructed at render time from the column definitions — required fields get `.min(1)` rules, enum fields get `.enum(values)`, etc. The same component handles every table a user creates.

The column management UI (`ColumnForm`) is also generic — it collects the column's `key`, `label`, `type`, and constraints, and POSTs to the column subresource endpoint. No feature-specific form code exists.

**File locations**: `apps/frontend/src/features/tables/` (pages, components, schema builder).

### 4. Templates as UI Sugar Over a Canonical Format

**Principle**: make common lookup patterns easy to author via the UI without sacrificing expressiveness or round-tripability.

**Implementation**: lookups are always stored as a canonical `LookupDef` (filter `ConditionExpression` tree + params + order + pick). The frontend offers six templates (`exact-match`, `range-contains`, `latest-before`, `earliest-after`, `multi-field-exact`, `custom-json`) that each translate a small set of friendly form fields into the canonical JSON. Two optional fields on `LookupDef` — `templateId` and `templateConfig` — allow the UI to restore the template form when editing an existing lookup.

The template layer is entirely frontend-side. The backend and the Temporal activity know nothing about templates; they only see and execute canonical `LookupDef` JSON.

**File locations**: `apps/frontend/src/features/tables/lookup-templates/`.

### 5. Automatic GroupId Injection from Workflow Metadata

**Principle**: workflow authors shouldn't have to hardcode group-scoping identifiers in every node that touches group-scoped configuration data.

**Implementation**: the graph workflow runner injects `groupId` from the workflow's metadata into every activity input before dispatching. Activity node authors write only:

```json
{
  "parameters": { "tableId": "payment_schedule", "lookupName": "byDate" }
}
```

The runner adds `groupId` transparently. The `tables.lookup` activity receives it on the `TablesLookupInput` object and uses it to scope the Postgres query. This pattern applies to any extension activity that needs group-scoped data.

### Summary: File Layout

```
apps/backend-services/src/tables/
  tables.controller.ts     — 16 REST endpoints
  tables.service.ts        — orchestration, validation, audit
  tables-db.service.ts     — Prisma CRUD, optimistic locking
  column-validation.ts     — ColumnDef validation rules
  lookup-validation.ts     — LookupDef validation rules
  types.ts                 — ColumnDef, LookupDef, PickStrategy
  dto/                     — Swagger-annotated DTOs

apps/temporal/src/tables/
  lookup-engine.ts         — filter + sort + pick execution
  types.ts                 — shared types (re-exported)

apps/frontend/src/features/tables/
  TableListPage.tsx
  TableDetailPage.tsx      — 4-tab view (Rows, Columns, Lookups, Settings)
  ColumnsTab.tsx / ColumnForm.tsx
  RowsTab.tsx / RowForm.tsx
  LookupsTab.tsx / LookupForm.tsx / LookupSnippetPanel.tsx
  lookup-templates/        — 6 template definitions
  types.ts                 — frontend mirror of backend types
```

Full API and behavior reference: [docs-md/TABLES.md](TABLES.md).

---

## HITL Pattern (Brief Contrast)

The Human-In-The-Loop (HITL) feature predates Tables and follows a different architecture documented in [docs-md/HITL_ARCHITECTURE.md](HITL_ARCHITECTURE.md). The key differences:

- **Scope**: HITL operates per-document-instance (each uploaded document gets its own review session). Tables operates per group (reference data shared across all documents and workflow runs in a group).
- **State complexity**: HITL has sessions with lifecycle states (in progress, completed, escalated), distributed locks, and a reviewer queue. Tables has no sessions, no locks beyond optimistic row-level `updated_at` checks, and no queues.
- **UI orientation**: HITL's UI is workflow-centric — it presents a review queue of pending documents where a reviewer acts. Tables' UI is config-centric — it presents a table editor where an admin manages reference data independent of any particular workflow run.
- **Activity model**: HITL uses a Temporal signal/query pattern to pause a workflow pending human action. Tables uses a straightforward synchronous activity that reads data and returns immediately.

---

## Future Extension Framework (Sketch)

Tables establishes the pattern but does not prescribe everything a future extension might need. Two areas are deferred for future work:

**Conditional sidebar visibility**: a workspace-extension manifest could declare that the Tables sidebar entry should only appear when at least one workflow in the group uses `tables.lookup`. This would prevent the entry from appearing for groups that have no Tables workflows. Currently the sidebar entry is always shown to group members. This was noted in the design spec but not implemented.

**Per-extension permissions**: the current authorization model uses the group's MEMBER/ADMIN roles for all operations on all extensions. A future design could introduce finer-grained roles (e.g., a "table editor" role distinct from group ADMIN) scoped to individual extensions. Tables doesn't block this — the `identityCanAccessGroup` helper accepts a role argument — but the role enum and assignment UX would need to be extended.

The Tables pattern is a reference point, not a rigid framework. The next extension sharing this shape (user-managed config data driving a generic activity) should adapt the pattern to its own constraints rather than extending Tables itself.
