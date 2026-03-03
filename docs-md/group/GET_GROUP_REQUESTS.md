# Get Group Membership Requests API

## Endpoint

`GET /api/groups/:groupId/requests`

Returns membership requests for a group with optional status filtering.

## Path Parameters

| Parameter | Type   | Description                        |
|-----------|--------|------------------------------------|
| groupId   | string | The unique identifier of the group |

## Query Parameters

| Parameter | Type   | Required | Description                                                                        |
|-----------|--------|----------|------------------------------------------------------------------------------------|
| status    | string | No       | Filter requests by status. Accepted values: `PENDING`, `APPROVED`, `DENIED`, `CANCELLED` |

## Authorization

The caller must satisfy one of the following:
- Be a system admin (`is_system_admin = true` on their `User` record)
- Be a group admin for the specified group (present in `UserGroup` with `role = ADMIN` for the given `groupId`)

Regular group members (role `MEMBER`) are **not** permitted to view requests.

Access is determined from `resolvedIdentity.userId` set by the `IdentityGuard`.

## Response

### `200 OK`

Returns an array of membership request objects.

```json
[
  {
    "id": "req-uuid",
    "userId": "user-uuid",
    "groupId": "group-uuid",
    "status": "PENDING",
    "createdAt": "2026-01-01T00:00:00.000Z"
  },
  {
    "id": "req-uuid-2",
    "userId": "user-uuid-2",
    "groupId": "group-uuid",
    "status": "APPROVED",
    "actorId": "admin-uuid",
    "reason": "Looks good",
    "resolvedAt": "2026-01-02T00:00:00.000Z",
    "createdAt": "2026-01-01T12:00:00.000Z"
  }
]
```

| Field       | Type   | Description                                                        |
|-------------|--------|--------------------------------------------------------------------|
| id          | string | The unique identifier of the request                               |
| userId      | string | The ID of the user who made the request                            |
| groupId     | string | The ID of the group the request is for                             |
| status      | string | Current status: `PENDING`, `APPROVED`, `DENIED`, or `CANCELLED`   |
| actorId     | string | (Optional) ID of the admin who acted on the request                |
| reason      | string | (Optional) Reason provided when the request was acted upon         |
| resolvedAt  | string | (Optional) ISO 8601 timestamp of when the request was resolved     |
| createdAt   | string | ISO 8601 timestamp of when the request was created                 |

### `400 Bad Request`

Returned when an invalid `status` query parameter value is provided.

### `401 Unauthorized`

Returned when the request does not include a valid JWT.

### `403 Forbidden`

Returned when the caller is not a group admin or system admin.

### `404 Not Found`

Returned when the specified group does not exist or has been soft-deleted.
