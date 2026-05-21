# Reference Data Tables — Frontend UI

## Overview

The Tables feature provides a UI for managing reference data tables, their schemas (columns), row data, and lookup definitions. It lives at `/tables` in the frontend application.

## Role-Based Access Control

Access is determined by the user's role in the active group. The backend enforces these restrictions; the frontend mirrors them by hiding controls that the user cannot use.

| Operation | Required Role |
|-----------|--------------|
| Create table | ADMIN |
| Edit table settings (label/description) | ADMIN |
| Delete table | ADMIN |
| Add/edit/delete columns | ADMIN |
| Add/edit/delete lookups | ADMIN |
| Create/edit/delete rows | MEMBER (any group member) |
| View all tabs | MEMBER (any group member) |

The Settings tab (edit metadata, delete table) is hidden from non-admins entirely. The "Add Column", "Edit", and "Delete" controls in the Columns and Lookups tabs are hidden from non-admins. Row CRUD controls remain visible to all group members.

The `isAdmin` check pattern used throughout:

```tsx
const { isSystemAdmin } = useAuth();
const isAdmin = isSystemAdmin || activeGroup?.role === "ADMIN";
```

The `role` field is populated from the `/api/auth/me` response and stored on the `Group` interface in `AuthContext`.

## Pages

### TableListPage (`/tables`)

Lists all reference data tables for the active group. Allows navigating to table details. The **Create Table** button is only shown to group admins (and system admins).

### TableDetailPage (`/tables/:tableId`)

Four-tab view for a single table:

| Tab | Visible to | Description |
|-----|------------|-------------|
| Rows | All members | CRUD for data rows, filtered/paginated |
| Columns | All members | Manage column schema (key, label, type, constraints) |
| Lookups | All members | Define lookup queries |
| Settings | Admins only | Edit label/description, delete table |

## Components

### ColumnsTab

Displays all columns for a table with key, label, type, and required attributes. Supports:

- **Add Column** — opens `ColumnForm` in create mode (admin only)
- **Edit** — opens `ColumnForm` in edit mode (key is read-only when editing) (admin only)
- **Delete** — shows a confirmation dialog before calling `DELETE /tables/:tableId/columns/:key`. If the column is referenced by a lookup, a "Cannot delete column" modal shows the backend's conflict message. (admin only)

Per-row loading state on delete button to avoid double-clicks.

Accepts an `isAdmin: boolean` prop from `TableDetailPage`.

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

### LookupsTab

Displays lookup query definitions. Accepts an `isAdmin: boolean` prop. Add/Edit/Delete controls are shown only to admins. The **Use in workflow** snippet button remains visible to all members.

### RowsTab / RowForm

Provides a paginated row list and a dynamic form driven by the column schema. All group members can create, edit, and delete rows.

- **Delete row** — clicking the delete button opens a confirmation modal before calling `DELETE /tables/:tableId/rows/:rowId`.
- **Date fields** — `DateInput` fields show a description hint: "Click the calendar icon to pick a date".

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/tables/:tableId?group_id=` | Load table detail with columns and lookups |
| PATCH | `/tables/:tableId?group_id=` | Update table label/description |
| DELETE | `/tables/:tableId?group_id=` | Delete table |
| POST | `/tables/:tableId/columns?group_id=` | Add column |
| PATCH | `/tables/:tableId/columns/:key?group_id=` | Update column |
| DELETE | `/tables/:tableId/columns/:key?group_id=` | Remove column |
| POST | `/tables/:tableId/rows?group_id=` | Create row |
| PATCH | `/tables/:tableId/rows/:rowId?group_id=` | Update row |
| DELETE | `/tables/:tableId/rows/:rowId?group_id=` | Delete row |

## Error Handling

`apiService` catches all HTTP errors and returns `{ success: false, message }` — it does not rethrow. The 409 conflict case (column referenced by a lookup) is identified by substring-checking `response.message.includes("referenced by lookups")`, matching the backend's `ConflictException` message from `TablesService.removeColumn`.

## Types

Defined in `apps/frontend/src/features/tables/types.ts`. Mirror of the backend types — keep in sync with `apps/backend-services/src/tables/types.ts`.
