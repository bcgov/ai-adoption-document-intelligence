# Tables — Design

**Date:** 2026-04-22
**Branch:** `feature/reference-data-tables`
**Status:** Design — pending implementation plan
**Supersedes:** `2026-04-22-reference-data-and-workspace-extensions-design.md` (workspace-extensions framework deferred; "reference data" renamed to "tables")

## 1. Context & Motivation

OCR output sometimes needs to be enriched with data from a per-deployment lookup table that is curated by the business outside the document pipeline. The first concrete instance is a payment-schedule table: given a document's submission datetime, the workflow must look up the matching schedule row (Schedule ID, Benefit Month, Payment Issue Day, Payment Cut-off Date, Report End Date, Income Month, Prev Payment Issue Day) and attach it to the OCR output that downstream XML emission consumes.

This kind of side-table is general — different deployments will have different tables for different use cases. The system must support this without baking any particular table into the codebase. The `CLAUDE.md` constraint is binding: *"the system is generic and must support arbitrary workloads."* No client-specific Prisma models, no client-specific TypeScript files in the main repo.

## 2. Goals and Non-Goals

### Goals

1. A first-class **Tables** subsystem: admins create, configure, and populate tables entirely through a user-friendly UI — no JSON for daily operations.
2. A single universal Temporal activity (`tables.lookup`) that any workflow can use to retrieve enriched data into `ctx`.
3. **Schema-driven row editor**: form widgets generated from each table's column definitions, typed per `ColumnType`.
4. **Lookup templates**: a small dropdown of common lookup patterns (exact match, range contains, latest-before, etc.) that admins pick to express varied lookup logic without writing predicates by hand. A "Custom (JSON)" escape hatch preserves the full DSL.
5. Group-scoped governance reusing the existing authorization and audit modules.
6. A pattern documentation file (`docs-md/PATTERNS_NODE_AND_UI.md`) using Tables as the worked example, so future "node + UI" features have a clear template to follow.

### Non-Goals

1. Client-specific code (e.g., `check-run-schedule.ts`) anywhere in the main repo. All table definitions are *data*.
2. The Workspace Extensions framework (conditional UI visibility based on workflow content). Deferred until a real future feature needs it; "Tables" is a permanent, always-visible core feature.
3. Bulk import / CSV upload of rows in v1. Row-by-row only.
4. Draft/publish workflow for table rows. Deferred.
5. Save-time validation in the workflow editor of `tableId` / `lookupName`. Validation happens at activity runtime (typos surface there).
6. Workflow editor autocomplete or dropdowns for table/lookup selection.
7. Refactor of the existing HITL feature. HITL stays as-is.
8. Custom-code lookup functions. Lookups are expressed in the constrained DSL only.
9. Cross-table joins.
10. Cross-group / global tables.
11. A visual predicate builder for the "Custom (JSON)" lookup escape hatch — JSON editor with validation only.

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React + Mantine)                     │
│                                                                          │
│   Sidebar entry "Tables" (always visible, group-scoped)                  │
│                                                                          │
│   /tables                       Tables list                              │
│   /tables/:tableId              Table detail (Rows | Columns |           │
│                                                Lookups | Settings)       │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                            REST API (NestJS)
                                    │
┌──────────────────────────────────────────────────────────────────────────┐
│                          Backend Services (NestJS)                       │
│                                                                          │
│   TablesController       ──► CRUD for Table, Column, Lookup, Row        │
│   Audit module: every write logged                                       │
│   Group authorization: identityCanAccessGroup at controller layer        │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                              PostgreSQL                                  │
│                                                                          │
│   tables(id, group_id, table_id, label, description, columns, lookups)   │
│   table_rows(id, group_id, table_id, data)                               │
└──────────────────────────────────────────────────────────────────────────┘

                        ┌───────────────────────────┐
                        │   Temporal Worker         │
                        │                           │
                        │   Activity:               │
                        │   tables.lookup           │
                        │     - reads table def     │
                        │     - reads rows          │
                        │     - evaluates DSL       │
                        │     - writes to ctx       │
                        └───────────────────────────┘
```

### Key architectural decisions

1. **Two Prisma models, period.** All client tables, columns, and lookups are *data* in those models. The main repo carries no per-deployment schema.
2. **Closed set of column types.** A finite type vocabulary the framework understands end-to-end (validation, UI rendering, lookup-DSL coercion). New column types are framework changes.
3. **Lookup DSL reuses the existing `ConditionExpression` evaluator** (currently powering `switch` and `pollUntil`). Extended with `param.X` and `row.X` namespaces alongside the existing `ctx.X`. No new evaluation engine.
4. **Single universal activity.** `tables.lookup` reads `tableId` and `lookupName` from its `parameters` and resolves the DSL at runtime. Adding a new table never requires a new activity registration.
5. **Lookup templates** are pure UI sugar. They generate the same `LookupDef` JSON that's stored in the DB. No new backend type, no new DSL surface.
6. **Tables is a core feature.** Permanent sidebar entry, always visible. The workspace-extensions concept (conditional UI visibility) is deferred until a real future feature needs it.

## 4. Data Model

### 4.1 Prisma additions

Two new models in `apps/shared/prisma/schema.prisma`:

```prisma
model Table {
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

  rows TableRow[]

  @@unique([group_id, table_id])
  @@index([group_id])
  @@map("tables")
}

model TableRow {
  id         String   @id @default(cuid())
  group_id   String
  table_id   String
  table      Table    @relation(fields: [group_id, table_id], references: [group_id, table_id], onDelete: Cascade)
  data       Json     // shape governed by Table.columns
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  @@index([group_id, table_id])
  @@map("table_rows")
}
```

Migration created and applied via `npm run db:generate` plus a normal Prisma migration.

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

Validated when columns are saved:
- `key` is non-empty, unique within the array, matches `^[a-zA-Z_][a-zA-Z0-9_]*$`.
- `enum` type requires non-empty `enumValues`; other types reject `enumValues`.

### 4.3 Row data validation

When a row is written, a Zod schema is built from the table's `columns` and the incoming `data` is validated against it. Extra keys not declared in `columns` are stripped (not rejected — keeps deserialization forgiving).

**Schema evolution.** If a table's `columns` change after rows already exist, existing rows are *not* automatically revalidated or rewritten. Consumers reading a row see whatever JSONB was last written. The next write to that row applies the current schema. The Columns tab in the UI surfaces a warning when a destructive change (column removal, type change) would invalidate existing data.

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

Validated when lookups are saved:
- `name` is non-empty, unique within the array.
- All `OrderClause.field` values reference existing column keys.
- All `ref` values inside `filter` use one of the allowed namespaces (`param.X`, `row.X`, or — rarely — `ctx.X`).
- `param.X` references must match a declared param; `row.X` references must match a declared column key.

### 4.5 Example: payment schedule (data, not code)

This is the actual JSON stored in the `tables` row for the bcgov check-run example. Created via the Tables UI; no code involved.

```json
{
  "table_id": "check_run_schedule",
  "label": "Payment Schedule",
  "description": "Monthly payment schedule and cutoff dates",
  "columns": [
    { "key": "scheduleId",          "label": "Schedule ID",            "type": "string", "required": true, "unique": true },
    { "key": "benefitMonth",        "label": "Benefit Month",          "type": "string", "required": true },
    { "key": "paymentIssueDay",     "label": "Payment Issue Day",      "type": "date",   "required": true },
    { "key": "paymentCutoffDate",   "label": "Payment Cut-off Date",   "type": "date",   "required": true },
    { "key": "reportEndDate",       "label": "Report End Date",        "type": "date",   "required": true },
    { "key": "incomeMonth",         "label": "Income Month",           "type": "string", "required": true },
    { "key": "prevPaymentIssueDay", "label": "Prev Payment Issue Day", "type": "date",   "required": true }
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

The admin builds this without writing JSON — see §7 (lookup templates) and §8 (UI). When created via a template, the lookup also carries optional `templateId` / `templateConfig` fields (§7.3) that the runtime evaluator ignores.

## 5. Lookup DSL

### 5.1 Reuse and extension

The DSL extends the existing `ConditionExpression` already used by `switch` and `pollUntil` nodes (see `apps/temporal/src/expression-evaluator.ts` and `apps/backend-services/src/workflow/graph-workflow-types.ts`). Three changes:

1. **New variable namespaces.** Today the DSL supports `ctx.X`. We add `param.X` (lookup parameters) and `row.X` (the candidate row currently being tested). Implementation: the evaluator takes a `Record<namespace, Record<string, unknown>>` instead of a single `ctx` object. Existing call sites are unaffected — they continue to pass only `ctx`.
2. **Type coercion at boundaries.** Param and row values are coerced to JS-comparable forms based on their declared `ColumnType` before evaluation. Specifically: `date` and `datetime` become ISO strings (lexicographic comparison correctly orders them); `number` becomes JS number; `boolean` becomes JS boolean; `string` and `enum` stay as strings.
3. **No new operators in v1.** The existing operator set (`equals`, `not-equals`, `gt`, `gte`, `lt`, `lte`, `contains`, `and`, `or`, `not`, `is-null`, `is-not-null`, `in`, `not-in`) is sufficient for the v1 lookup templates and most plausible custom lookups. New operators are framework changes if real needs arise.

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
                ApplicationFailure with code TABLES_AMBIGUOUS_MATCH or
                TABLES_NO_MATCH
     - "all":   return rows
```

The activity output port `result` carries either `Record<string, unknown>` (single match), `Record<string, unknown>[]` (`pick: "all"`), or `null` (no match for `first`/`last`).

## 6. The `tables.lookup` Activity

### 6.1 Registration

A single new activity registered everywhere the existing list is maintained:

- `apps/temporal/src/activities/tables-lookup.ts` — implementation
- `apps/temporal/src/activities.ts` — export
- `apps/temporal/src/activity-registry.ts` — register
- `apps/temporal/src/activity-types.ts` — add to `REGISTERED_ACTIVITY_TYPES`
- `apps/backend-services/src/workflow/activity-registry.ts` — add to allow-list

### 6.2 Contract

```ts
interface TablesLookupInput {
  tableId: string;       // from node parameters
  lookupName: string;    // from node parameters
  groupId: string;       // injected by the graph runner (see §6.3)
  // Each declared lookup param appears as a sibling key, supplied via inputs port bindings:
  [paramName: string]: unknown;
}

interface TablesLookupOutput {
  result: Record<string, unknown> | Record<string, unknown>[] | null;
}
```

### 6.3 Group resolution

The activity needs to know which group to query. The graph runner auto-injects it: when the backend starts a workflow, it passes the workflow's `group_id` as part of workflow input (via `TemporalClientService`). The graph workflow stores it in a reserved context key `__workflowMetadata.groupId` at startup. The graph runner's activity executor (`node-executors.ts`) merges `{ groupId: ctx.__workflowMetadata.groupId }` into every activity input — same place static `parameters` are merged today. The activity reads it from its input. This change is generic: every activity can rely on `groupId` being present without per-workflow config.

### 6.4 Example node config

```json
{
  "lookupSchedule": {
    "id": "lookupSchedule",
    "type": "activity",
    "label": "Resolve Payment Schedule",
    "activityType": "tables.lookup",
    "parameters": {
      "tableId": "check_run_schedule",
      "lookupName": "bySubmissionDate"
    },
    "inputs":  [{ "port": "submissionDate", "ctxKey": "documentMetadata.submitDate" }],
    "outputs": [{ "port": "result",         "ctxKey": "scheduleInfo" }]
  }
}
```

The Lookups tab in the UI shows a copy-paste-ready snippet like the above for each defined lookup, so workflow authors don't have to type it from scratch (§8.6).

### 6.5 Errors

The activity throws `ApplicationFailure` with these codes:

- `TABLES_NOT_FOUND` — no `Table` for `(groupId, tableId)`.
- `TABLES_LOOKUP_NOT_FOUND` — no lookup named `lookupName` on the table.
- `TABLES_PARAM_INVALID` — lookup params missing or wrong type.
- `TABLES_NO_MATCH` — `pick: "one"` and zero rows matched.
- `TABLES_AMBIGUOUS_MATCH` — `pick: "one"` and >1 rows matched.

These are catchable by node `errorPolicy` (per the existing graph engine model).

## 7. Lookup Templates

To keep the lookup-creation UX user-friendly, the UI offers a dropdown of **templates** that generate the underlying `LookupDef` JSON. Admins pick a template, fill in a small form, and save — no JSON authoring for the common cases.

### 7.1 v1 Template Set

| Template | Form fields | Generated `filter` | Generated `order` | Generated `pick` |
|---|---|---|---|---|
| **Exact match** | column, param | `column == param` | — | `one` |
| **Range contains** | start_column, end_column, param | `start_column ≤ param AND param ≤ end_column` | — | `one` |
| **Latest before / on** | column, param | `column ≤ param` | `column desc` | `first` |
| **Earliest after / on** | column, param | `column ≥ param` | `column asc` | `first` |
| **Multi-field exact** | list of (column, param) pairs | `AND` of equality checks | — | `one` |
| **Custom (JSON)** | raw `ConditionExpression` JSON, plus order/pick fields | (verbatim) | (form input) | (form input) |

Templates also infer the `params` array from the form fields (one param per filled-in slot).

### 7.2 Worked example: payment schedule lookup

The acceptance criterion is:

> determining whether a submission falls before or after the monthly cutoff date to assign the correct reporting period and payment cycle

A submission belongs to the next payment cycle whose cutoff has not yet passed. So given `submissionDate`, find the schedule row whose `paymentCutoffDate` is the *earliest* date that is on or after `submissionDate`.

The admin picks the **"Earliest after / on"** template, sets `column = paymentCutoffDate`, `param = submissionDate`. The template generates exactly the canonical JSON shown in §4.5: `filter = (param.submissionDate ≤ row.paymentCutoffDate)`, `order = paymentCutoffDate asc`, `pick = first`.

### 7.3 Template ↔ stored shape mapping

Templates live entirely in the frontend. The backend stores and reads only the canonical `LookupDef` shape (filter + order + pick). Round-tripping (open an existing lookup → see it as a template form) requires the frontend to recognize structural patterns that match each template's output. The lookup record stores a `templateId` hint alongside the canonical fields to make round-tripping reliable; if the hint is absent or doesn't match the structure (e.g., admin edited the JSON manually after picking a template), the form falls back to "Custom (JSON)" mode.

```ts
interface LookupDef {
  name: string;
  params: LookupParam[];
  filter: ConditionExpression;
  order?: OrderClause[];
  pick: Pick;
  templateId?: string;   // UI hint; the backend treats it as opaque metadata
  templateConfig?: Record<string, unknown>;  // form values that produced this lookup, for round-trip
}
```

`templateId` and `templateConfig` are optional, opaque to the backend, and ignored by the runtime evaluator. They only inform the UI.

## 8. Frontend UI

### 8.1 Sidebar

A permanent **"Tables"** entry alongside Workflows / Documents. Group-scoped via `useGroup()`. No conditional visibility logic.

### 8.2 Tables list page (`/tables`)

A Mantine Table-based list of all tables in the active group:

- Columns: Table label, Description, Row count, Updated at
- Search: filter by table label
- Action: "Create Table" button (opens modal — §8.3)
- Click a row to navigate to the detail page (§8.4)

### 8.3 Create Table modal

Fields:
- **Table ID** (string, required) — the stable identifier used in workflows. Validates against `^[a-z][a-z0-9_]*$`. Locked after creation.
- **Label** (string, required) — display name.
- **Description** (string, optional)

On save: POST to `/api/tables`, navigate to the new table's detail page on the **Columns** tab (since a table without columns isn't useful yet).

### 8.4 Table detail page (`/tables/:tableId`) — tabs

Four tabs:

#### Tab 1: Rows

- Mantine Table view with one column per `ColumnDef`. Headers from `column.label`; cells render typed values (date formatted, booleans as ✓/✗, etc.).
- Pagination, row count.
- "Create Row" button (opens row form — §8.5).
- Per-row actions: Edit (opens row form pre-filled), Delete (with confirm).
- Empty state when no columns are defined yet: "Define columns first" with a link to the Columns tab.

#### Tab 2: Columns

- List of columns with their config (key, label, type, required, unique, enum values).
- "Add Column" button opens a column form (key, label, type dropdown, required toggle, unique toggle, enum values list when applicable).
- Per-column Edit / Delete.
- **Destructive-change warnings**: editing a column's type or removing a column shows a confirm modal listing the impact ("X existing rows will become invalid against the new schema").
- **Lookup-dependency check**: deleting a column referenced by any lookup `filter` or `order` returns a 409 from the API (see §10); UI surfaces the conflict and links to the dependent lookups.

#### Tab 3: Lookups

- List of lookups with name, template kind, params, summary.
- "Add Lookup" button opens a lookup form (§8.7).
- Per-lookup Edit / Delete.
- Each lookup row has a **"Use in workflow"** action that opens a panel with the copy-paste-ready activity JSON snippet (§8.6).

#### Tab 4: Settings

- Edit label, description.
- Delete table (with confirm; cascades rows).

### 8.5 Row form (schema-driven)

Modal/drawer. One input per `ColumnDef`, widget chosen by type:

| ColumnType | Widget |
|---|---|
| `string` | `TextInput` |
| `number` | `NumberInput` |
| `boolean` | `Switch` |
| `date` | `DateInput` |
| `datetime` | `DateTimePicker` |
| `enum` | `Select` populated from `enumValues` |

Validation enforced live (required, type, enum membership, unique). Save calls `POST` (create) or `PUT` (update) with `expected_updated_at` for optimistic locking.

### 8.6 "Use in workflow" snippet

When an admin clicks "Use in workflow" on a lookup, a panel shows the ready-to-paste activity node JSON:

```json
{
  "type": "activity",
  "activityType": "tables.lookup",
  "label": "Lookup: bySubmissionDate",
  "parameters": {
    "tableId": "check_run_schedule",
    "lookupName": "bySubmissionDate"
  },
  "inputs":  [{ "port": "submissionDate", "ctxKey": "<source ctx key here>" }],
  "outputs": [{ "port": "result", "ctxKey": "<destination ctx key here>" }]
}
```

Per-param input bindings are pre-generated from the lookup's `params` declaration. Admin replaces the `<...>` placeholders with their actual ctx keys when pasting into a workflow JSON.

### 8.7 Lookup form (template-driven)

Modal/drawer with these fields:

- **Name** (string, required, unique within the table)
- **Template** (dropdown — see §7.1)
- **Template-specific fields** (rendered conditionally):
  - "Exact match": one column picker (from this table's columns), one param name
  - "Range contains": two column pickers, one param name
  - "Latest before / on": one column picker, one param name
  - "Earliest after / on": one column picker, one param name
  - "Multi-field exact": list editor of (column picker, param name) pairs
  - "Custom (JSON)": JSON editor for `filter`, list editor for `params`, list editor for `order`, dropdown for `pick`
- **Pick override** (only shown for templates with a default pick — lets admin change it if needed)

On save: the form generates the canonical `LookupDef` and sends it to the API.

### 8.8 File layout

- `apps/frontend/src/features/tables/pages/TablesListPage.tsx`
- `apps/frontend/src/features/tables/pages/TableDetailPage.tsx`
- `apps/frontend/src/features/tables/components/CreateTableModal.tsx`
- `apps/frontend/src/features/tables/components/RowForm.tsx`
- `apps/frontend/src/features/tables/components/ColumnForm.tsx`
- `apps/frontend/src/features/tables/components/LookupForm.tsx`
- `apps/frontend/src/features/tables/components/LookupSnippetPanel.tsx`
- `apps/frontend/src/features/tables/lookup-templates/index.ts` — template definitions (one file per template; each exports `{ id, label, fields, toLookupDef, fromLookupDef }`)
- `apps/frontend/src/features/tables/hooks/useTables.ts`
- `apps/frontend/src/features/tables/hooks/useTable.ts`
- `apps/frontend/src/features/tables/hooks/useTableRows.ts`
- `apps/frontend/src/features/tables/utils/build-row-zod-schema.ts`

## 9. Backend Modules

### 9.1 New module: `apps/backend-services/src/tables/`

- `tables.module.ts`
- `tables.controller.ts` — REST endpoints (see §10), full Swagger per `CLAUDE.md`
- `tables.service.ts` — orchestration
- `tables-db.service.ts` — Prisma access
- `dto/` — DTO classes with `@ApiProperty`
- `column-validation.ts` — builds Zod schema from `ColumnDef[]`
- `lookup-validation.ts` — validates `LookupDef[]` against columns
- `dependency-check.ts` — detects column ↔ lookup dependencies (used to block destructive column edits)

### 9.2 Shared lookup engine

Lives in the Temporal worker (since runtime evaluation is its job): `apps/temporal/src/tables/lookup-engine.ts`. Backend doesn't need to evaluate filters at save time; it only validates *structure*, not behavior.

The expression evaluator (`apps/temporal/src/expression-evaluator.ts`) is extended to accept multiple namespaces. Existing call sites continue to work unchanged.

## 10. REST API

All endpoints group-authorized via `identityCanAccessGroup` and audited.

### 10.1 Tables

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/tables?group_id=:gid` | — | List tables in group (no row data) |
| GET | `/api/tables/:tableId?group_id=:gid` | — | Get one table (with columns + lookups, without rows) |
| POST | `/api/tables` | `{ group_id, table_id, label, description? }` | Create table (group-admin only). Returns table with empty `columns` and `lookups` arrays. |
| PATCH | `/api/tables/:tableId` | `{ label?, description? }` | Update metadata (group-admin only) |
| DELETE | `/api/tables/:tableId` | — | Delete table + cascade rows (group-admin only) |

### 10.2 Columns (subresource on tables)

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | `/api/tables/:tableId/columns` | `ColumnDef` | Add a column (group-admin only) |
| PUT | `/api/tables/:tableId/columns/:columnKey` | `ColumnDef` | Update a column (group-admin only). Returns 409 if change invalidates dependent lookups. |
| DELETE | `/api/tables/:tableId/columns/:columnKey` | — | Remove a column (group-admin only). Returns 409 with dependent lookups list if any. |

### 10.3 Lookups (subresource on tables)

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | `/api/tables/:tableId/lookups` | `LookupDef` | Add a lookup (group-admin only) |
| PUT | `/api/tables/:tableId/lookups/:lookupName` | `LookupDef` | Replace a lookup (group-admin only) |
| DELETE | `/api/tables/:tableId/lookups/:lookupName` | — | Remove a lookup (group-admin only) |

### 10.4 Rows

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/tables/:tableId/rows?group_id=:gid&offset=&limit=&search=` | — | Paginated rows; `search` matches across string columns |
| GET | `/api/tables/:tableId/rows/:rowId` | — | One row |
| POST | `/api/tables/:tableId/rows` | row data (validated against columns) | Create row (group-admin only) |
| PUT | `/api/tables/:tableId/rows/:rowId` | `{ data, expected_updated_at }` | Update row (group-admin only). Mismatch on `expected_updated_at` returns 409 Conflict. |
| DELETE | `/api/tables/:tableId/rows/:rowId` | — | Delete row (group-admin only) |

## 11. Authorization, Audit, Multi-Tenancy

- **Read** access for all `/api/tables/*` endpoints: any group member (`identityCanAccessGroup`).
- **Write** access (`POST`/`PUT`/`PATCH`/`DELETE` on tables, columns, lookups, rows): group-admin or system-admin only. Enforced via the existing role-check helpers in `apps/backend-services/src/auth/`.
- **Audit**: every successful write emits an audit record via the existing `audit` module:
  - `tables.created`, `tables.updated`, `tables.deleted`
  - `tables.column.added`, `tables.column.updated`, `tables.column.removed`
  - `tables.lookup.added`, `tables.lookup.updated`, `tables.lookup.removed`
  - `tables.row.created`, `tables.row.updated`, `tables.row.deleted`

  Each record carries `{ actor_id, group_id, table_id, column_key?, lookup_name?, row_id?, before?, after? }` with the diff for updates.
- **Optimistic locking** on row updates only (rows change frequently in normal use). Tables/columns/lookups change rarely; last-writer-wins with a generic "table was modified by another user" error message is acceptable.

## 12. Temporal Worker Changes

- New activity `tables.lookup` (see §6).
- `expression-evaluator.ts` extended to accept namespaced bindings (`{ ctx, param, row }`).
- New helper `executeLookup(definition, params, rows)` in `apps/temporal/src/tables/lookup-engine.ts`.
- `node-executors.ts` updated to inject `groupId: ctx.__workflowMetadata.groupId` into every activity input (§6.3).
- `graph-workflow.ts` updated to populate `__workflowMetadata.groupId` from workflow input at startup.
- Tests:
  - Unit tests for the extended evaluator (back-compat: existing `ctx`-only calls still work).
  - Unit tests for `executeLookup` covering each `pick` value and the error codes.
  - Activity test using a Prisma-backed test setup (mirroring existing activity tests).

## 13. Documentation Deliverables

Per `CLAUDE.md`, two markdown files in `docs-md/`:

- **`docs-md/TABLES.md`**:
  - Concepts (tables, rows, columns, lookups).
  - Data model.
  - Lookup DSL reference (operators, namespaces, `pick` semantics, error codes).
  - Lookup template catalog.
  - Activity contract and example node config.
  - REST API reference.
  - Authorization model.
  - Walkthrough: "How to set up a new table and use it in a workflow."

- **`docs-md/PATTERNS_NODE_AND_UI.md`**:
  - The general pattern for "node + UI" features, using Tables as the worked example.
  - Decision guide: when does a feature warrant its own subsystem like Tables, versus a single activity, versus the HITL pattern (per-instance state + UI)?
  - When (in the future) conditional UI visibility based on workflow content becomes needed — what such a framework would look like (sketch only; not built in v1).

## 14. Testing Strategy

- **Unit tests** for: column validation (`column-validation.ts`), lookup definition validation (`lookup-validation.ts`), dependency detection (`dependency-check.ts`), the extended expression evaluator, the lookup engine.
- **Service tests** for `TablesDbService` (Prisma) and `TablesService` (orchestration including audit emission).
- **Controller tests** covering authorization paths (member can read, only group-admin can write, audit records emitted).
- **Activity test** for `tables.lookup` covering the full happy path and each error code.
- **Frontend tests** for: lookup template round-trip (each template's `toLookupDef`/`fromLookupDef` are inverses), schema-driven row form generation per `ColumnType`, optimistic-locking conflict handling.

Per `CLAUDE.md`: backend tests created/updated and run as part of every code change.

## 15. Out of Scope / Deferred

1. Bulk import (CSV/JSON) for rows.
2. Draft/publish workflow for table rows.
3. Save-time validation in workflow editor of `tableId` / `lookupName`.
4. Workflow editor autocomplete or pickers for tables/lookups.
5. Workspace Extensions framework (conditional UI visibility based on workflow content). Documented as a future-pattern sketch in `PATTERNS_NODE_AND_UI.md`.
6. HITL migration to any new framework.
7. Custom-code lookup functions (DSL only).
8. Cross-table joins.
9. Cross-group / global tables.
10. Visual predicate builder for "Custom (JSON)" lookups.

## 16. Open Questions

None at design time. Implementation may surface follow-ups (specific Mantine widget choices for the JSON editor, exact pagination defaults, etc.) — those will be decided in the implementation plan or during PR review.

## 17. Branch and Naming

- Branch: `feature/reference-data-tables` (created from `ci/auto-deploy-test`; rename to `feature/tables` if preferred before merge).
- Commits: conventional, scoped to subsystem (`tables:`).
