# Reference Data Tables

## Overview

Tables provides group-scoped reference data that graph workflows can query at execution time via the `tables.lookup` Temporal activity. Each table has a schema defined as JSONB (no per-table database migrations) containing typed column definitions and named lookup queries. Users load their reference data as rows, define parameterized lookups over those rows, and then wire the lookup output into any graph workflow node as a context variable. Typical use cases include enriching workflow context with structured reference data — for example, finding the payment schedule row that contains a given submission date, or resolving a document type code to its full metadata record.

See also: [docs-md/REFERENCE_DATA_TABLES_UI.md](REFERENCE_DATA_TABLES_UI.md) for the frontend UI component reference.

---

## Concepts

- **Table**: a named, group-scoped collection with a stable `table_id` identifier, a human-readable label, an optional description, a schema (array of column definitions), and a set of named lookup queries.
- **Column**: a typed field definition stored in the table's JSONB `columns` array. Supported types are `string`, `number`, `boolean`, `date`, `datetime`, `enum`. A column may be marked `required`, and for `enum` columns a list of allowed values is stored in `enumValues`. The `key` field is a stable machine identifier; `label` is the display name.
- **Row**: a data record matching the table's column schema, stored as JSONB in the `TableRow` model. Rows are validated on write against the column schema. Updates use optimistic locking via `expected_updated_at`.
- **Lookup**: a named, parameterized query over a table. Each lookup specifies: declared `params` (name + type), a `filter` (`ConditionExpression` tree), an optional `order` clause array, and a `pick` strategy. The lookup is stored canonically in the JSONB `lookups` array; an optional `templateId` / `templateConfig` hint allows the frontend to round-trip back to the template UI.

---

## Data Model

Two Prisma models back the feature:

- **`Table`**: holds `id` (UUID), `group_id`, `table_id` (stable human-chosen key), `label`, `description`, `columns` (JSONB array of `ColumnDef`), `lookups` (JSONB array of `LookupDef`), and `updated_at`. The composite unique constraint is `(group_id, table_id)`.
- **`TableRow`**: holds `id` (UUID), `group_id`, `table_id`, `data` (JSONB record), and `updated_at`. Rows are looked up by `group_id + table_id` at activity execution time.

No per-table DDL migrations are needed. Adding or removing columns changes only the JSONB definition; existing rows retain their previous `data` values (the lookup engine evaluates against whatever is present at runtime).

For the authoritative data model see [docs/superpowers/specs/2026-04-22-tables-design.md](../docs/superpowers/specs/2026-04-22-tables-design.md).

---

## Lookup DSL

Lookups are expressed as a `ConditionExpression` filter tree, an optional sort, and a pick strategy.

### Filter Operators

All operators come from `ConditionExpression` in `apps/backend-services/src/workflow/graph-workflow-types.ts`. Values are referenced via a `ValueRef` which is either `{ ref: "..." }` (a namespaced path) or `{ literal: <value> }`.

#### Comparison operators

| Operator | Shape | Example |
|---|---|---|
| `equals` | `{ operator, left, right }` | `{ "operator": "equals", "left": { "ref": "row.status" }, "right": { "literal": "active" } }` |
| `not-equals` | `{ operator, left, right }` | `{ "operator": "not-equals", "left": { "ref": "row.type" }, "right": { "ref": "param.docType" } }` |
| `gt` | `{ operator, left, right }` | `{ "operator": "gt", "left": { "ref": "row.amount" }, "right": { "literal": 0 } }` |
| `gte` | `{ operator, left, right }` | `{ "operator": "gte", "left": { "ref": "row.start_date" }, "right": { "ref": "param.date" } }` |
| `lt` | `{ operator, left, right }` | `{ "operator": "lt", "left": { "ref": "row.cutoff" }, "right": { "ref": "param.submittedAt" } }` |
| `lte` | `{ operator, left, right }` | `{ "operator": "lte", "left": { "ref": "row.end_date" }, "right": { "ref": "param.date" } }` |
| `contains` | `{ operator, left, right }` | `{ "operator": "contains", "left": { "ref": "row.tags" }, "right": { "literal": "urgent" } }` |

#### Null-check operators

| Operator | Shape | Example |
|---|---|---|
| `is-null` | `{ operator, value }` | `{ "operator": "is-null", "value": { "ref": "row.approved_at" } }` |
| `is-not-null` | `{ operator, value }` | `{ "operator": "is-not-null", "value": { "ref": "row.approved_at" } }` |

#### List membership operators

| Operator | Shape | Example |
|---|---|---|
| `in` | `{ operator, value, list }` | `{ "operator": "in", "value": { "ref": "row.region" }, "list": { "literal": ["BC", "AB"] } }` |
| `not-in` | `{ operator, value, list }` | `{ "operator": "not-in", "value": { "ref": "row.status" }, "list": { "literal": ["void", "cancelled"] } }` |

#### Logical operators

| Operator | Shape | Example |
|---|---|---|
| `and` | `{ operator, operands: [...] }` | `{ "operator": "and", "operands": [<expr1>, <expr2>] }` |
| `or` | `{ operator, operands: [...] }` | `{ "operator": "or", "operands": [<expr1>, <expr2>] }` |
| `not` | `{ operator, operand: <expr> }` | `{ "operator": "not", "operand": <expr> }` |

### Ref Namespaces

Within a `{ ref: "..." }` value, the path prefix controls which binding is used:

| Prefix | Source | Example |
|---|---|---|
| `param.X` | Lookup invocation parameters | `param.submissionDate` |
| `row.X` | Current row being evaluated | `row.cutoff_date` |
| `ctx.X` | Workflow context variable | `ctx.doc.type` |
| bare `X` (no prefix) | Workflow context (legacy back-compat for switch/pollUntil nodes) | `doc.type` |

Dot notation resolves nested properties. Null intermediates yield null (no error).

### Pick Strategies

| Strategy | Behaviour |
|---|---|
| `first` | Returns the first matched row after sorting, or `null` if none match. |
| `last` | Returns the last matched row after sorting, or `null` if none match. |
| `one` | Returns the single matched row. Throws `TABLES_NO_MATCH` if zero rows matched; throws `TABLES_AMBIGUOUS_MATCH` if more than one matched. |
| `all` | Returns the full array of matched rows (may be empty). |

### Order Clauses

The `order` field is an array of `{ field: string; direction: "asc" | "desc" }` objects. Multiple fields produce a stable multi-key sort applied before the pick strategy is evaluated.

```json
"order": [
  { "field": "effective_date", "direction": "desc" },
  { "field": "id", "direction": "asc" }
]
```

---

## Lookup Template Catalog

The frontend provides six templates that translate a small set of form fields into a canonical `LookupDef`. The underlying `LookupDef` JSON is always stored canonically; `templateId` / `templateConfig` are round-trip hints only and have no effect on execution.

| Template ID | Label | Form fields | Generated filter | Pick |
|---|---|---|---|---|
| `exact-match` | Exact match | `column`, `param` | `equals(row.<column>, param.<param>)` | `one` |
| `range-contains` | Range contains value | `startColumn`, `endColumn`, `param` | `and(lte(row.<start>, param.<param>), lte(param.<param>, row.<end>))` | `one` |
| `latest-before` | Latest before / on | `column`, `param` | `lte(row.<column>, param.<param>)` with `order: [{ field: <column>, direction: "desc" }]` | `first` |
| `earliest-after` | Earliest after / on | `column`, `param` | `lte(param.<param>, row.<column>)` with `order: [{ field: <column>, direction: "asc" }]` | `first` |
| `multi-field-exact` | Multi-field exact match | array of `{ column, param }` pairs | `and(equals(row.<col_i>, param.<param_i>), ...)` | `one` |
| `custom-json` | Custom (advanced) | raw filter JSON, params list, order list, pick | unconstrained — user writes the full `ConditionExpression` | user-chosen |

Source: `apps/frontend/src/features/tables/lookup-templates/`

---

## The `tables.lookup` Activity

The `tables.lookup` Temporal activity executes a named lookup against a table's stored rows.

### Input

```typescript
interface TablesLookupInput {
  groupId: string;      // auto-injected from workflow metadata
  tableId: string;      // table's stable identifier
  lookupName: string;   // name of the lookup definition on the table
  [paramName: string]: unknown; // remaining keys are the lookup's declared params
}
```

`groupId` is automatically injected by the graph workflow runner from the workflow's metadata — authors of graph workflow JSON do not need to plumb it explicitly.

### Output

```typescript
interface TablesLookupOutput {
  result: Record<string, unknown> | Array<Record<string, unknown>> | null;
}
```

The shape of `result` depends on the `pick` strategy:
- `pick: "first"` or `pick: "last"` — a single row object or `null`.
- `pick: "one"` — a single row object (or an error; never `null`).
- `pick: "all"` — an array of row objects (may be empty).

### Error Types

All errors are Temporal `ApplicationFailure` with `nonRetryable: true`. The `type` field identifies the error class:

| Type | When thrown |
|---|---|
| `TABLES_NOT_FOUND` | No table with the given `groupId` + `tableId` exists. |
| `TABLES_LOOKUP_NOT_FOUND` | The table exists but no lookup named `lookupName` is defined on it. |
| `TABLES_NO_MATCH` | `pick: "one"` and zero rows matched the filter. |
| `TABLES_AMBIGUOUS_MATCH` | `pick: "one"` and more than one row matched the filter. |

### Example Graph Workflow Node

```json
{
  "type": "activity",
  "activityType": "tables.lookup",
  "label": "Resolve payment schedule",
  "parameters": {
    "tableId": "payment_schedule",
    "lookupName": "byDate"
  },
  "inputs": [
    { "port": "submissionDate", "ctxKey": "doc.submitted_at" }
  ],
  "outputs": [
    { "port": "result", "ctxKey": "ctx.payment_row" }
  ]
}
```

The activity reads from the table's live row store at execution time. Schema and lookup changes take effect immediately for new workflow runs — no redeployment is required.

---

## REST API Reference

All endpoints are under `/api/tables`. Every endpoint requires authentication via JWT bearer token or `x-api-key` header (`@Identity({ allowApiKey: true })`). All operations verify group access via `identityCanAccessGroup`, throwing 403 if the caller is not a member of the requested group.

### Table Endpoints

| Method | Path | Min Role | Body | Success Response |
|---|---|---|---|---|
| `GET` | `/api/tables?group_id=` | MEMBER | — | `TableSummary[]` (200) |
| `GET` | `/api/tables/:tableId?group_id=` | MEMBER | — | `TableDetail` (200); 404 if not found |
| `POST` | `/api/tables` | ADMIN | `CreateTableDto` | `TableDetail` (201) |
| `PATCH` | `/api/tables/:tableId?group_id=` | ADMIN | `UpdateTableMetadataDto` | `TableDetail` (200) |
| `DELETE` | `/api/tables/:tableId?group_id=` | ADMIN | — | 204 |

### Column Endpoints

| Method | Path | Min Role | Body | Success Response |
|---|---|---|---|---|
| `POST` | `/api/tables/:tableId/columns?group_id=` | ADMIN | `ColumnDto` | `TableDetail` (201) |
| `PATCH` | `/api/tables/:tableId/columns/:columnKey?group_id=` | ADMIN | `ColumnDto` | `TableDetail` (200) |
| `DELETE` | `/api/tables/:tableId/columns/:columnKey?group_id=` | ADMIN | — | 204; 409 if column is referenced by a lookup |

### Lookup Endpoints

| Method | Path | Min Role | Body | Success Response |
|---|---|---|---|---|
| `POST` | `/api/tables/:tableId/lookups?group_id=` | ADMIN | `LookupDto` | `TableDetail` (201) |
| `PATCH` | `/api/tables/:tableId/lookups/:lookupName?group_id=` | ADMIN | `LookupDto` | `TableDetail` (200) |
| `DELETE` | `/api/tables/:tableId/lookups/:lookupName?group_id=` | ADMIN | — | 204 |

### Row Endpoints

| Method | Path | Min Role | Body | Success Response |
|---|---|---|---|---|
| `GET` | `/api/tables/:tableId/rows?group_id=&offset=&limit=` | MEMBER | — | `{ rows: RowDto[], total: number }` (200) |
| `GET` | `/api/tables/:tableId/rows/:rowId?group_id=` | MEMBER | — | `RowDto` (200); 404 if not found |
| `POST` | `/api/tables/:tableId/rows?group_id=` | MEMBER | `CreateRowDto` | `RowDto` (201) |
| `PATCH` | `/api/tables/:tableId/rows/:rowId?group_id=` | MEMBER | `UpdateRowDto` | `RowDto` (200); 409 on stale `expected_updated_at` |
| `DELETE` | `/api/tables/:tableId/rows/:rowId?group_id=` | MEMBER | — | 204 |

Row update uses optimistic locking: the `UpdateRowDto` must include `expected_updated_at`. If the row was modified by another writer since that timestamp, the API returns 409 Conflict.

---

## Authorization

MEMBER role is required for read operations and row mutations (data operations). ADMIN role is required for table, column, and lookup mutations (schema operations). All mutations record an audit event via `AuditService.recordEvent` with the shape:

```typescript
{
  event_type: string,        // e.g. "table.created", "table_row.updated"
  resource_type: "table" | "table_row",
  resource_id: string,       // UUID of the affected resource
  actor_id: string,
  group_id: string,
  payload: Record<string, unknown>
}
```

---

## Walkthrough: Setting Up a Table and Using It in a Workflow

This example sets up a `payment_schedule` table with date range rows, defines a lookup, and wires it into a graph workflow.

**1. Navigate to Tables**

Open the application and click **Tables** in the left sidebar.

**2. Create the table**

Click **Create Table**. Enter:
- `table_id`: `payment_schedule`
- `Label`: `Payment Schedule`
- `Description`: `Maps date ranges to payment day and report end date.`

Submit the form.

**3. Add columns**

On the table detail page, switch to the **Columns** tab. Add three columns:

| Key | Label | Type | Required |
|---|---|---|---|
| `cutoff` | Cutoff Date | date | yes |
| `report_end_date` | Report End Date | date | yes |
| `payment_day` | Payment Day | string | yes |

**4. Add rows**

Switch to the **Rows** tab. Click **Create Row** for each row in the reference dataset. The form renders fields from your column schema; required fields are enforced client-side via Zod.

**5. Define a lookup**

Switch to the **Lookups** tab. Click **Add Lookup**:
- Template: **Range contains value**
- Lookup name: `byDate`
- Range start column: `cutoff`
- Range end column: `report_end_date`
- Param name: `submissionDate`

Save. The lookup is stored with a filter `and(lte(row.cutoff, param.submissionDate), lte(param.submissionDate, row.report_end_date))` and `pick: "one"`.

**6. Copy the workflow snippet**

On the Lookups tab, click **Use in workflow** on the `byDate` row. The panel shows a pre-filled activity node JSON. Copy it.

**7. Wire up the graph workflow**

In your graph workflow editor, add an activity node and paste the JSON:

```json
{
  "type": "activity",
  "activityType": "tables.lookup",
  "label": "Resolve payment schedule",
  "parameters": {
    "tableId": "payment_schedule",
    "lookupName": "byDate"
  },
  "inputs": [
    { "port": "submissionDate", "ctxKey": "doc.submitted_at" }
  ],
  "outputs": [
    { "port": "result", "ctxKey": "ctx.payment_row" }
  ]
}
```

Replace `doc.submitted_at` with the upstream context key holding the submission date, and `ctx.payment_row` with the destination context key for subsequent nodes.

**8. Save and run**

Save the workflow. The next run that reaches the `tables.lookup` node will query the live `payment_schedule` rows using the `byDate` lookup and set the matching row on `ctx.payment_row`. If no row matches (or more than one matches), Temporal fails the activity with a non-retryable `TABLES_NO_MATCH` or `TABLES_AMBIGUOUS_MATCH` error.

---

For full specification details including validation rules and error message formats see [docs/superpowers/specs/2026-04-22-tables-design.md](../docs/superpowers/specs/2026-04-22-tables-design.md).
