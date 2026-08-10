# Get User Group Membership API

## Endpoint

`GET /api/groups/user/:userId`

Returns all non-deleted groups a user is a member of, including the user's role in each group.

## Path Parameters

| Parameter | Type   | Description                        |
|-----------|--------|------------------------------------|
| userId    | string | The ID of the user whose groups to retrieve |

## Authorization

Access depends on the caller's relationship to the target user:
- **The user themselves** — sees all of their own groups.
- **System admins** — see all groups for any user.
- **Group admins** (`role = ADMIN` in any group) — see only the target user's memberships in groups where the caller is an admin.
- **Regular members** — cannot view another user's memberships (`403 Forbidden`).

## Response

### `200 OK`

Returns an array of group objects with the user's role:

```json
[
  {
    "id": "group-uuid",
    "name": "Group Name",
    "role": "EDITOR",
    "description": "Optional description"
  }
]
```

### `401 Unauthorized`

Returned when the request does not include a valid JWT.

### `403 Forbidden`

Returned when the caller does not have permission to view the target user's group memberships.

## Description
Retrieves the list of non-deleted groups for the specified user with their role in each. Used by the frontend `useMyGroups(userId)` hook (`apps/frontend/src/data/hooks/useGroups.ts`).
