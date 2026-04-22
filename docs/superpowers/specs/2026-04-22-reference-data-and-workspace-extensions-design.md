# Reference Data Tables & Workspace Extensions — Design

**Date:** 2026-04-22
**Branch:** `feature/reference-data-tables`
**Status:** Design — pending implementation plan

## 1. Context & Motivation

OCR output sometimes needs to be enriched with metadata from a per-deployment lookup table that is curated by the business outside the document pipeline. The first concrete instance is a payment-schedule table: given a document's submission datetime, the workflow must look up the matching schedule row (Schedule ID, Benefit Month, Payment Issue Day, Payment Cut-off Date, Report End Date, Income Month, Prev Payment Issue Day) and attach it to the OCR output that downstream XML emission consumes.

The check-run schedule is one example, but the system must remain document-type-agnostic. The `CLAUDE.md` constraint is binding: *"the system is generic and must support arbitrary workloads."* No client-specific Prisma models, no client-specific TypeScript files in the main repo.

A second motivation: this is the first of several anticipated "node + UI" features. We want a reusable pattern so future add-ons (validation rules, decision tables, etc.) plug in the same way without polluting the navigation or main repo.

## 2. Goals and Non-Goals

### Goals

1. A generic **reference-data subsystem**: schema-driven tables with admin-managed rows and named lookups, all stored as data — zero per-table code in the main repo.
2. A single universal Temporal activity (`referenceData.lookup`) that any workflow can use to retrieve enriched data into `ctx`.
3. A **Workspace Extensions** registry pattern that resolves "which optional features are available to this group" by inspecting workflow content. Reference-data is the first extension; the contract supports more.
4. Group-scoped governance reusing the existing authorization and audit modules.
5. Two pattern documentation files in `docs-md/` so future contributors know which path to follow for new "node + UI" features.

### Non-Goals

1. Client-specific code (e.g., `check-run-schedule.ts`) anywhere in the main repo.
2. Bulk import / CSV upload of rows in v1. Row-by-row only.
3. Draft/publish workflow for table rows. Deferred.
4. Save-time validation of `tableId` / `lookup` references in the workflow editor. Deferred (typos surface at runtime).
5. Workflow editor autocomplete or dropdowns for table/lookup selection. Deferred.
6. Refactor of the existing HITL feature to use the extensions framework. HITL pre-dates the framework and stays as-is.
7. Custom-code lookup functions. Lookups are expressed in the constrained DSL only.
8. Any document-type-specific or client-specific schema in `schema.prisma`.

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React + Mantine)                     │
│                                                                          │
│   Sidebar ──► useActiveExtensions(activeGroupId) ──► /api/workspace-     │
│                                                       extensions         │
│                       │                                                  │
│                       ▼                                                  │
│            Renders nav entries for active extensions                     │
│                                                                          │
│   "Reference Data" page (mounted only via extension registry):           │
│       - Lists tables in active group                                     │
│       - Per-table viewer / minimal JSON editor for definitions and rows  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                            REST API (NestJS)
                                    │
┌──────────────────────────────────────────────────────────────────────────┐
│                          Backend Services (NestJS)                       │
│                                                                          │
│   WorkspaceExtensionsController  ──► scans workflows in group, returns   │
│                                       active extension IDs               │
│   ReferenceDataController        ──► CRUD for ReferenceTableDefinition   │
│                                       and ReferenceTableRow              │
│                                                                          │
│   Audit module: every write logged                                       │
│   Group authorization: identityCanAccessGroup at controller layer        │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              PostgreSQL                                  │
│                                                                          │
│   reference_table_definitions(id, group_id, table_id, label,             │
│                               description, columns, lookups)             │
│   reference_table_rows(id, group_id, table_id, data)                     │
└──────────────────────────────────────────────────────────────────────────┘

                        ┌───────────────────────────┐
                        │   Temporal Worker         │
                        │                           │
                        │   Activity:               │
                        │   referenceData.lookup    │
                        │     - reads table def     │
                        │     - reads rows          │
                        │     - evaluates DSL       │
                        │     - writes to ctx       │
                        └───────────────────────────┘
```

### Key architectural decisions

1. **Two Prisma models, period.** All client tables, columns, and lookups are *data* in those models. The main repo carries no per-deployment schema.
2. **Closed set of column types.** A finite type vocabulary the framework understands end-to-end (validation, UI rendering, lookup-DSL coercion). New column types are framework changes, not per-client changes.
3. **Lookup DSL reuses the existing `ConditionExpression` evaluator** (currently powering `switch` and `pollUntil`). Extended with `param.X` and `row.X` namespaces alongside the existing `ctx.X`. No new evaluation engine.
4. **Single universal activity.** `referenceData.lookup` reads `tableId` and `lookupName` from its `parameters` and resolves the DSL at runtime. Adding a new client table never requires a new activity registration.
5. **Workspace Extensions as a frontend-side registry** with a backend visibility query. The framework computes visibility uniformly (intersect each extension's `activities` with the activity types referenced by any workflow in the group). Extensions don't write predicate code.
6. **No backwards compatibility shims.** Per `CLAUDE.md`: this is new functionality, no migration of HITL or other features.

## 4. Data Model

### 4.1 Prisma additions

Two new models in `apps/shared/prisma/schema.prisma`:

```prisma
model ReferenceTableDefinition {
  id          String   @id @default(cuid())
  group_id    String
  group       Group    @relation(fields: [group_id], references: [id], onDelete: Cascade)
  table_id    String   // unique within group, e.g. "check_run_schedule"
  label       String
  description String?
  columns     Json     // ColumnDef[]
  lookups     Json     // LookupDef[]
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  rows ReferenceTableRow[]

  @@unique([group_id, table_id])
  @@index([group_id])
  @@map("reference_table_definitions")
}

model ReferenceTableRow {
  id           String  @id @default(cuid())
  group_id     String
  table_id     String
  definition   ReferenceTableDefinition @relation(fields: [group_id, table_id], references: [group_id, table_id], onDelete: Cascade)
  data         Json    // shape governed by definition.columns
  created_at   DateTime @default(now())
  updated_at   DateTime @updatedAt

  @@index([group_id, table_id])
  @@map("reference_table_rows")
}
```

Migration created and applied via `npm run db:generate` (per `CLAUDE.md`) plus a normal Prisma migration.

### 4.2 ColumnDef (TypeScript type, owned by framework)

```ts
type ColumnType = "string" | "number" | "boolean" | "date" | "datetime" | "enum";

interface ColumnDef {
  key: string;            // identifier used in row.data and DSL refs
  label: string;          // display label
  type: ColumnType;
  required?: boolean;     // default false
  enumValues?: string[];  // required iff type === "enum"
  unique?: boolean;       // enforced at write time, scope = (group_id, table_id)
}
```

A `ColumnDef[]` is validated when a `ReferenceTableDefinition` is created/updated:
- `key` is non-empty, unique within the array, matches `^[a-zA-Z_][a-zA-Z0-9_]*$`.
- `enum` type requires non-empty `enumValues`.
- All other types reject `enumValues`.

### 4.3 Row data validation

When a row is written, a Zod schema is built from the definition's `columns` and the incoming `data` is validated against it. Extra keys not declared in `columns` are stripped (not rejected — keeps deserialization forgiving).

**Schema evolution:** if a table's `columns` change after rows already exist, existing rows are *not* automatically revalidated or rewritten. Consumers reading a row see whatever JSONB was last written. The next write to that row applies the current schema. This is acceptable given the once-per-year update cadence; if a real need arises later, a "validate-existing-rows" admin endpoint can be added.

### 4.4 LookupDef (TypeScript type, owned by framework)

```ts
type Pick = "first" | "last" | "one" | "all";

interface LookupParam {
  name: string;
  type: ColumnType;
}

interface OrderClause {
  field: string;                 // must reference a column key
  direction: "asc" | "desc";
}

interface LookupDef {
  name: string;                  // unique within the table
  params: LookupParam[];
  filter: ConditionExpression;   // existing graph DSL, see §5
  order?: OrderClause[];
  pick: Pick;
}
```

Lookups validated at definition write time:
- `name` is non-empty, unique within the array.
- All `OrderClause.field` values reference existing column keys.
- All `ref` values inside `filter` use one of the allowed namespaces (`param.X`, `row.X`, or — rarely — `ctx.X`).
- `param.X` references must match a declared param; `row.X` references must match a declared column key.

### 4.5 Example: check-run schedule (data, not code)

This entire example lives in the database — created via API or seed migration in a deployment-specific repo:

```json
{
  "table_id": "check_run_schedule",
  "label": "Payment Schedule",
  "description": "Monthly payment schedule and cutoff dates",
  "columns": [
    { "key": "scheduleId",        "label": "Schedule ID",          "type": "string",   "required": true, "unique": true },
    { "key": "benefitMonth",      "label": "Benefit Month",        "type": "string",   "required": true },
    { "key": "paymentIssueDay",   "label": "Payment Issue Day",    "type": "date",     "required": true },
    { "key": "paymentCutoffDate", "label": "Payment Cut-off Date", "type": "date",     "required": true },
    { "key": "reportEndDate",     "label": "Report End Date",      "type": "date",     "required": true },
    { "key": "incomeMonth",       "label": "Income Month",         "type": "string",   "required": true },
    { "key": "prevPaymentIssueDay","label": "Prev Payment Issue Day","type": "date",   "required": true }
  ],
  "lookups": [
    {
      "name": "bySubmissionDate",
      "params": [{ "name": "submissionDate", "type": "datetime" }],
      "filter": {
        "operator": "lte",
        "left":  { "ref": "param.submissionDate" },
        "right": { "ref": "row.paymentCutoffDate" }
      },
      "order": [{ "field": "paymentCutoffDate", "direction": "asc" }],
      "pick": "first"
    }
  ]
}
```

## 5. Lookup DSL

### 5.1 Reuse and extension

The DSL extends the existing `ConditionExpression` already used by `switch` and `pollUntil` nodes (see `apps/temporal/src/expression-evaluator.ts` and `apps/backend-services/src/workflow/graph-workflow-types.ts`). Three changes:

1. **New variable namespaces.** Today the DSL supports `ctx.X`. We add `param.X` (lookup parameters) and `row.X` (the candidate row currently being tested). Implementation: the evaluator takes a `Record<namespace, Record<string, unknown>>` instead of a single `ctx` object. Existing call sites are unaffected — they continue to pass only `ctx`.
2. **Type coercion at boundaries.** Param and row values are coerced to JS-comparable forms based on their declared `ColumnType` before evaluation. Specifically: `date` and `datetime` become ISO strings (lexicographic comparison correctly orders them); `number` becomes JS number; `boolean` becomes JS boolean; `string` and `enum` stay as strings.
3. **No new operators in v1.** The existing operator set (`equals`, `not-equals`, `gt`, `gte`, `lt`, `lte`, `contains`, `and`, `or`, `not`, `is-null`, `is-not-null`, `in`, `not-in`) is sufficient for typical reference-data lookups. New operators are framework changes if real needs arise.

### 5.2 Lookup execution semantics

Given a `LookupDef`, lookup parameter values, and the rows of the table:

```
1. For each row, evaluate `filter` with bindings { param: ..., row: row.data }.
   Keep rows where the result is true.
2. If `order` is set, sort the kept rows by the order clauses (stable sort).
3. Apply `pick`:
     - "first": return rows[0] or null
     - "last":  return rows[rows.length - 1] or null
     - "one":   return rows[0] iff rows.length === 1; else throw
                ApplicationFailure with code "REFERENCE_DATA_LOOKUP_AMBIGUOUS"
                (or "REFERENCE_DATA_LOOKUP_NOT_FOUND" for length 0)
     - "all":   return rows
```

The activity output port `result` carries either `Record<string, unknown>` (single match), `Record<string, unknown>[]` (`pick: "all"`), or `null` (no match for `first`/`last`).

## 6. The `referenceData.lookup` Activity

### 6.1 Registration

A single new activity registered everywhere the existing list is maintained:

- `apps/temporal/src/activities/reference-data-lookup.ts` — implementation
- `apps/temporal/src/activities.ts` — export
- `apps/temporal/src/activity-registry.ts` — register
- `apps/temporal/src/activity-types.ts` — add to `REGISTERED_ACTIVITY_TYPES`
- `apps/backend-services/src/workflow/activity-registry.ts` — add to allow-list

### 6.2 Contract

```ts
interface ReferenceDataLookupInput {
  tableId: string;       // from node parameters
  lookupName: string;    // from node parameters
  groupId: string;       // injected by the workflow runner from workflow metadata
  // Each declared lookup param appears as a sibling key, supplied via inputs port bindings:
  [paramName: string]: unknown;
}

interface ReferenceDataLookupOutput {
  result: Record<string, unknown> | Record<string, unknown>[] | null;
}
```

### 6.3 Group resolution

The activity needs to know which group to query. Options considered:

- **(Chosen) Auto-inject `groupId` into every activity's input via the graph runner.** When the backend starts a workflow, it already passes the workflow's `group_id` as part of the workflow input (via `TemporalClientService`). The graph workflow stores it in a reserved context key `__workflowMetadata.groupId` at startup. The graph runner's activity executor (`node-executors.ts`) merges `{ groupId: ctx.__workflowMetadata.groupId }` into every activity input automatically — same place static `parameters` are merged today. The activity reads it from its input. This change is generic — every activity can rely on `groupId` being present without per-workflow config.
- *(Rejected)* Pass `groupId` via every node's parameters — repetitive and error-prone.
- *(Rejected)* Have each workflow author seed `groupId` into ctx manually — same downside.

### 6.4 Example node config

```json
{
  "lookupSchedule": {
    "id": "lookupSchedule",
    "type": "activity",
    "label": "Resolve Payment Schedule",
    "activityType": "referenceData.lookup",
    "parameters": {
      "tableId": "check_run_schedule",
      "lookupName": "bySubmissionDate"
    },
    "inputs":  [{ "port": "submissionDate", "ctxKey": "documentMetadata.submitDate" }],
    "outputs": [{ "port": "result",         "ctxKey": "scheduleInfo" }]
  }
}
```

Downstream consumers (XML emission and friends) read `ctx.scheduleInfo` like any other activity output.

### 6.5 Errors

The activity throws `ApplicationFailure` with these codes:

- `REFERENCE_DATA_TABLE_NOT_FOUND` — no `ReferenceTableDefinition` for `(groupId, tableId)`.
- `REFERENCE_DATA_LOOKUP_DEFINITION_NOT_FOUND` — no lookup named `lookupName` on the table.
- `REFERENCE_DATA_PARAM_INVALID` — lookup params missing or wrong type.
- `REFERENCE_DATA_NO_MATCH` — `pick: "one"` and zero rows matched.
- `REFERENCE_DATA_AMBIGUOUS_MATCH` — `pick: "one"` and >1 rows matched.

These are catchable by node `errorPolicy` (per the existing graph engine model).

## 7. Workspace Extensions Framework

### 7.1 Extension contract

```ts
interface WorkspaceExtension {
  id: string;                    // stable identifier, e.g. "reference-data"
  displayName: string;           // shown in nav
  navIcon?: string;              // Mantine icon name
  route: string;                 // app route, e.g. "/reference-data"
  component: ComponentType;      // page component
  activities: string[];          // activity types this extension contributes
}
```

### 7.2 Visibility rule

```
extensionVisible(ext, groupId) :=
  ∃ workflow w in groupId such that
  ∃ node n in w.config.nodes such that
  n.type == "activity" && ext.activities.includes(n.activityType)
```

Visibility is computed by the framework — extensions do **not** write predicate code. Adding a new extension means declaring a list of activity types; the framework handles the rest.

### 7.3 Backend endpoint

`GET /api/workspace-extensions?group_id=<uuid>`

- Authorization: `identityCanAccessGroup`.
- Behavior: load all workflows for `group_id`, walk each `config.nodes`, collect the set of activity types referenced. Return the extension IDs whose `activities` intersect that set.
- Response shape: `{ activeExtensionIds: string[] }`.
- Performance: groups have ≤ low-hundreds of workflows; a single `findMany` + in-memory walk. No caching layer in v1.

The list of registered extensions lives **server-side** alongside the activity registry (single source of truth). The frontend extension registry mirrors this: each frontend `WorkspaceExtension` declares the same `activities`, and the backend just returns the IDs that should be shown.

Resolution order:
1. Frontend has its registry of `WorkspaceExtension` definitions (with components).
2. Frontend asks backend which IDs are active for the current group.
3. Sidebar renders nav entries only for the intersection.

This split keeps execution-relevant state on the backend (workflow scanning) and rendering-relevant state on the frontend (components, routes).

### 7.4 Routing

Routes for extension pages are always **registered in the router**, so direct URL navigation works regardless of nav visibility (essential first-time-setup escape hatch). Only the *sidebar entry* is conditional. If an extension has no data for a group, the page itself renders an empty-state with documentation pointing to the API/seed route.

### 7.5 Cache invalidation

React Query caches `useActiveExtensions(activeGroupId)`. The cache is invalidated on:
- Active group change (key includes `activeGroupId`).
- Any successful `POST/PUT/DELETE` against `/api/workflows/*` (use the existing workflow mutation hooks; add invalidation alongside).

### 7.6 Why visibility is not driven by data presence

We considered "extension visible iff group has at least one row of the corresponding kind." Rejected because:

- It creates a chicken-and-egg: you need the UI to populate the data, but the UI only appears after the data exists.
- Workflow reference is the *intent* signal; data presence is downstream of intent.
- Workflow reference scales naturally — a contributor who adds a new extension just declares its activities, and the visibility logic Just Works.

### 7.7 Relationship to HITL

HITL is conceptually compatible with the extension model — its activity-equivalent is the `humanGate` node type, and visibility could be derived from "any workflow uses humanGate." But:

- HITL pre-dates this framework.
- HITL has additional state (sessions, locks, queue management) the v1 extension contract doesn't model.
- The user's directive: leave HITL alone.

The pattern doc will explicitly distinguish:
- **Core features** (always visible, e.g., HITL, Workflows, Documents) — for foundational capabilities every deployment uses.
- **Workspace Extensions** (visibility derived from workflow content) — for opt-in add-ons, including all future "node + UI" features.

## 8. Frontend UI

Per the user's direction: **no rich management UI in v1.** Population happens via JSON (API or seed migration). The Reference Data page is intentionally minimal:

- **List view** at `/reference-data`: lists `ReferenceTableDefinition` rows for the active group. Each entry shows table id, label, row count, last-updated timestamp.
- **Detail view** at `/reference-data/:tableId`: shows the table's `columns` and `lookups` as formatted JSON (read-only view + raw JSON editor for group admins). Below, a paginated list of rows rendered as a basic Mantine `Table` (one column per `ColumnDef`).
- **Row editing**: a "Edit JSON" button per row opens a modal with a JSON editor for `data`. Save calls the API with optimistic-locking via `updated_at`.
- **No form-from-schema generation in v1.** Just JSON editing.

The page is mounted only when the Reference Data extension is active for the group (per §7), but the route is always registered (direct URL works).

Files (proposed):
- `apps/frontend/src/features/reference-data/pages/ReferenceDataListPage.tsx`
- `apps/frontend/src/features/reference-data/pages/ReferenceDataTablePage.tsx`
- `apps/frontend/src/features/reference-data/hooks/useReferenceTables.ts`
- `apps/frontend/src/features/reference-data/extension.ts` — `WorkspaceExtension` registration
- `apps/frontend/src/features/extensions/registry.ts` — central frontend extension registry
- `apps/frontend/src/features/extensions/hooks/useActiveExtensions.ts` — fetches `/api/workspace-extensions`
- `apps/frontend/src/components/AppSidebar.tsx` — add "if extension active, render entry" loop

## 9. Backend Modules

### 9.1 New module: `apps/backend-services/src/reference-data/`

- `reference-data.module.ts`
- `reference-data.controller.ts` — REST endpoints (see §10), full Swagger per `CLAUDE.md`
- `reference-data.service.ts` — orchestration
- `reference-data-db.service.ts` — Prisma access
- `dto/` — DTO classes with `@ApiProperty`
- `column-validation.ts` — builds Zod schema from `ColumnDef[]`
- `lookup-validation.ts` — validates `LookupDef[]` against columns
- `extension.ts` — server-side `WorkspaceExtension` mirror (id + activities)

### 9.2 New module: `apps/backend-services/src/workspace-extensions/`

- `workspace-extensions.module.ts`
- `workspace-extensions.controller.ts` — `GET /api/workspace-extensions`
- `workspace-extensions.service.ts` — workflow scan + intersection logic
- `extension-registry.ts` — server-side aggregation of extensions (imports `extension.ts` from each contributing module)

### 9.3 Shared lookup engine

A new package or shared file used by both backend (for save-time coercion checks where applicable) and the Temporal worker (for runtime evaluation). Most likely path: extend `apps/temporal/src/expression-evaluator.ts` to accept multiple namespaces, then import from the temporal-side activity. Backend doesn't need to evaluate filters at save time; it only validates *structure*, not behavior.

## 10. REST API

All endpoints group-authorized via `identityCanAccessGroup` and audited.

### 10.1 Reference Data — Definitions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/reference-data/tables?group_id=:gid` | List tables in group (no row data) |
| GET | `/api/reference-data/tables/:tableId?group_id=:gid` | Get one definition |
| POST | `/api/reference-data/tables` | Create definition (group-admin only) |
| PUT | `/api/reference-data/tables/:tableId` | Replace columns/lookups (group-admin only) |
| DELETE | `/api/reference-data/tables/:tableId` | Delete definition + cascade rows (group-admin only) |

### 10.2 Reference Data — Rows

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/reference-data/tables/:tableId/rows?group_id=:gid&offset=&limit=` | Paginated rows |
| GET | `/api/reference-data/tables/:tableId/rows/:rowId` | One row |
| POST | `/api/reference-data/tables/:tableId/rows` | Create row (group-admin only); body validated against columns |
| PUT | `/api/reference-data/tables/:tableId/rows/:rowId` | Update row (group-admin only); body must include `expected_updated_at` for optimistic locking — mismatch returns `409 Conflict` |
| DELETE | `/api/reference-data/tables/:tableId/rows/:rowId` | Delete row (group-admin only) |

### 10.3 Workspace Extensions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/workspace-extensions?group_id=:gid` | Returns `{ activeExtensionIds: string[] }` |

## 11. Authorization, Audit, Multi-Tenancy

- **Read** access for all endpoints under `/api/reference-data/*` and `/api/workspace-extensions`: any group member (`identityCanAccessGroup`).
- **Write** access (`POST`/`PUT`/`DELETE` for definitions and rows): group-admin or system-admin only. Enforced via the existing role-check helpers in `apps/backend-services/src/auth/`.
- **Audit**: every successful write emits an audit record via the existing `audit` module. Action codes:
  - `reference_data.definition.created`
  - `reference_data.definition.updated`
  - `reference_data.definition.deleted`
  - `reference_data.row.created`
  - `reference_data.row.updated`
  - `reference_data.row.deleted`
  Each record carries `{ actor_id, group_id, table_id, row_id?, before?, after? }` with the row data diff for updates.
- **Optimistic locking** on row updates only — definitions are infrequent enough that last-writer-wins with a "definition was modified by another user" error message is acceptable.

## 12. Temporal Worker Changes

- New activity `referenceData.lookup` (see §6).
- `expression-evaluator.ts` extended to accept namespaced bindings (`{ ctx, param, row }`).
- New helper `executeLookup(definition, params, rows)` in `apps/temporal/src/reference-data/lookup-engine.ts`.
- Tests:
  - Unit tests for the extended evaluator (back-compat: existing `ctx`-only calls still work).
  - Unit tests for `executeLookup` covering each `pick` value and the error codes.
  - Activity test using a Prisma-backed test setup (mirroring existing activity tests).

## 13. Documentation Deliverables

Per `CLAUDE.md`, two markdown files in `docs-md/`:

- **`docs-md/REFERENCE_DATA.md`**:
  - Concepts (table definitions, rows, lookups).
  - Data model.
  - Lookup DSL reference (operators, namespaces, `pick` semantics, error codes).
  - Activity contract and example node config.
  - REST API reference.
  - Authorization model.
  - "How to add a reference table" walkthrough (API or seed migration in deployment-specific repo).

- **`docs-md/WORKSPACE_EXTENSIONS.md`**:
  - The contract (`WorkspaceExtension`).
  - The visibility rule (workflow-reference based) and rationale.
  - End-to-end recipe: how to add a new extension (declare activities, build a page, register on frontend, register on backend, ship).
  - Explicit decision tree: "Is your feature a Workspace Extension or a core feature?" — listing HITL as a core feature precedent and reference-data as the inaugural extension precedent.

## 14. Testing Strategy

- **Unit tests** for: column validation (`column-validation.ts`), lookup definition validation (`lookup-validation.ts`), the extended expression evaluator, the lookup engine.
- **Service tests** for `ReferenceDataDbService` (Prisma) and `WorkspaceExtensionsService` (workflow scan).
- **Controller tests** covering authorization paths (member can read, only group-admin can write, audit records emitted).
- **Activity test** for `referenceData.lookup` covering the full happy path and each error code.
- **Frontend tests** for `useActiveExtensions` (cache key includes group, invalidates on workflow mutation).

Per `CLAUDE.md`: backend tests created/updated and run as part of every code change.

## 15. Out of Scope / Deferred

1. Bulk import (CSV/JSON) for rows.
2. Draft/publish workflow for table rows.
3. Save-time validation in workflow editor of `tableId` / `lookupName`.
4. Workflow editor autocomplete for table/lookup pickers.
5. Form-from-schema row editor (JSON editor only in v1).
6. HITL migration to the extensions framework.
7. Custom-code lookup functions (DSL only).
8. Lookups across tables (joins). Lookup operates on a single table.
9. Cross-group / global tables.
10. Caching layer for `/api/workspace-extensions` beyond React Query on the frontend.

## 16. Open Questions

None at design time. Implementation may surface follow-ups (e.g., specific Mantine widget choices for the JSON editor) — those will be decided in the implementation plan or during PR review.

## 17. Branch and Naming

- Branch: `feature/reference-data-tables` (created from `ci/auto-deploy-test`; rename if the team has a different convention before merge).
- Commits: conventional, scoped to subsystem (`reference-data:`, `workspace-extensions:`).
