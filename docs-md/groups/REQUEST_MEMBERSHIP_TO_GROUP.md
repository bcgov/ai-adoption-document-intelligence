# Request Membership to Group API

## Endpoint

`POST /api/groups/request`

Allows an authenticated user to request membership to a group. The requesting user's identity is derived from the JWT token (`sub` claim) — it must not be supplied in the request body.

## Request Body

| Field     | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| `groupId` | string | Yes      | The ID of the group to join          |

## Response

| Status | Description                                      |
|--------|--------------------------------------------------|
| `200`  | Request submitted                                |
| `400`  | User is already a member, or a `PENDING` request already exists |
| `401`  | No authenticated user / missing `sub` claim      |
| `404`  | Group not found                                  |

```json
{ "success": true }
```

## Behaviour

- If the user is **already a member** of the group, returns `400 Bad Request` — no new record is created.
- If the user already has a **PENDING** request for the group, returns `400 Bad Request` — no duplicate is created.
- Otherwise, any prior resolved (`APPROVED`, `DENIED`, `CANCELLED`) request records for this user+group pair are deleted first (to satisfy the unique constraint on `(group_id, user_id, status)`), then a `GroupMembershipRequest` record is created with `status = PENDING`.
- `user_id` is set to the requesting user's ID (JWT `sub`); `created_by` and `updated_by` are set to the caller's actor ID.
- A `membership_request_created` audit event is recorded.
