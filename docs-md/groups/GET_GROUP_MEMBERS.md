# Get Group Members API

## Endpoint

`GET /api/groups/:groupId/members`

Returns the list of current members for a group.

## Path Parameters

| Parameter | Type   | Description                      |
|-----------|--------|----------------------------------|
| groupId   | string | The unique identifier of the group |

## Authorization

The caller must satisfy one of the following:
- Be a system admin (`is_system_admin = true` on their `User` record)
- Be a member of the group (present in the `UserGroup` table for the given `groupId`)

Group admins (users with role `ADMIN` in `UserGroup`) are also members and therefore have access.

Access is determined from `resolvedIdentity.userId` set by the `IdentityGuard`.

## Response

### `200 OK`

Returns an array of group member objects.

```json
[
  {
    "userId": "user-uuid",
    "email": "user@example.com",
    "joinedAt": "2026-01-01T00:00:00.000Z"
  }
]
```

| Field    | Type   | Description                                |
|----------|--------|--------------------------------------------|
| userId   | string | The user's unique identifier               |
| email    | string | The user's email address                   |
| joinedAt | string | ISO 8601 timestamp of when the user joined (from `UserGroup.created_at`) |

### `401 Unauthorized`

Returned when the request does not include a valid JWT.

### `403 Forbidden`

Returned when the caller is not a member of the group and is not a system admin.

### `404 Not Found`

Returned when the specified group does not exist or has been soft-deleted.
