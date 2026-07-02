# Delete Group API

## Endpoint

`DELETE /api/groups/:groupId`

Soft-deletes an existing group by ID. Only system admins may perform this action.

### Authorization
- Caller must be authenticated.
- Caller must be a system admin (`DatabaseService.isUserSystemAdmin`).

### Path Parameters
| Parameter | Type   | Description |
|-----------|--------|-------------|
| groupId   | string | The ID of the group to soft-delete |

### Response
- `200 OK` — Group soft-deleted successfully (`{ success: true }`)
- `401 Unauthorized` — Caller is not authenticated
- `403 Forbidden` — Caller is not a system admin
- `404 Not Found` — Group does not exist

## Description

Soft-deletes the specified group by setting `deleted_at` to the current timestamp and `deleted_by` to the caller's `userId`. Associated records (members, workflows, membership requests) are **not** modified.

Soft-deleted groups are excluded from all subsequent `GET /api/groups` listings.
