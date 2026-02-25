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
| `200`  | Request submitted (or silently ignored — see below) |
| `401`  | No authenticated user / missing `sub` claim      |
| `404`  | Group not found                                  |

```json
{ "success": true }
```

## Behaviour

- If the user is **already a member** of the group, returns `200` silently — no new record is created.
- If the user already has a **PENDING** request for the group, returns `200` silently — no duplicate is created.
- Otherwise, a `GroupMembershipRequest` record is created with `status = PENDING`.
- `user_id`, `created_by`, and `updated_by` are all set to the requesting user's `sub`.
