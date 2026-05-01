# Reference Data Tables — Frontend UI

## Overview

The Tables feature provides a UI for managing reference data tables, their schemas (columns), row data, and lookup definitions. It lives at `/tables` in the frontend application.

## Pages

### TableListPage (`/tables`)

Lists all reference data tables for the active group. Allows creating new tables and navigating to table details.

### TableDetailPage (`/tables/:tableId`)

Four-tab view for a single table:

| Tab | Description |
|-----|-------------|
| Rows | CRUD for data rows, filtered/paginated |
| Columns | Manage column schema (key, label, type, constraints) |
| Lookups | Define lookup queries (implemented in Task 28) |
| Settings | Edit label/description, delete table |

## Components

### ColumnsTab

Displays all columns for a table with key, label, type, and required attributes. Supports:

- **Add Column** — opens `ColumnForm` in create mode
- **Edit** — opens `ColumnForm` in edit mode (key is read-only when editing)
- **Delete** — calls `DELETE /tables/:tableId/columns/:key`. If the column is referenced by a lookup, a "Cannot delete column" modal shows the backend's conflict message.

Per-row loading state on delete button to avoid double-clicks.

### ColumnForm

Modal form for creating/editing a column definition.

Fields:
- **Key** — stable identifier (letters, digits, underscore; must start with letter/underscore). Disabled when editing.
- **Label** — human-readable display name.
- **Type** — `string | number | boolean | date | datetime | enum`.
- **Enum values** — visible only when type is `enum`. Uses `TagsInput` (press Enter to add values).
- **Required** — toggle.

Validation:
- Key must match `/^[a-zA-Z_][a-zA-Z0-9_]*$/`
- Label is required
- Enum values must have at least one entry when type is `enum`

`enumValues` is stripped from the payload when type is not `enum` to avoid sending stale values after a type change.

### RowsTab / RowForm

See Tasks 24–25. Provides paginated row list and a dynamic form driven by the column schema.

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/tables/:tableId?group_id=` | Load table detail with columns |
| POST | `/tables/:tableId/columns?group_id=` | Add column |
| PATCH | `/tables/:tableId/columns/:key?group_id=` | Update column |
| DELETE | `/tables/:tableId/columns/:key?group_id=` | Remove column |

## Error Handling

`apiService` catches all HTTP errors and returns `{ success: false, message }` — it does not rethrow. The 409 conflict case (column referenced by a lookup) is identified by substring-checking `response.message.includes("referenced by lookups")`, matching the backend's `ConflictException` message from `TablesService.removeColumn`.

## Types

Defined in `apps/frontend/src/features/tables/types.ts`. Mirror of the backend types — keep in sync with `apps/backend-services/src/tables/types.ts`.
