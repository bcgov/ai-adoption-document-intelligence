# Deny Group Membership Request

## Overview

Allows a system admin to deny a pending group membership request. The user is not added to the group and the request status is updated to `DENIED` with full audit information.

## Endpoint

`PATCH /api/groups/requests/:requestId/deny`

### Path Parameters

| Parameter   | Type   | Description                    |
|-------------|--------|--------------------------------|
| `requestId` | string | ID of the membership request   |

### Request Body

| Field    | Type   | Required | Description                    |
|----------|--------|----------|--------------------------------|
| `reason` | string | No       | Optional reason for the denial |

### Responses

| Status | Description                              |
|--------|------------------------------------------|
| 200    | Request denied successfully              |
| 400    | Request is not in `PENDING` state        |
| 401    | Unauthorized (no valid JWT)              |
| 404    | Membership request not found             |

## Behaviour

1. The admin's identity is derived from the `sub` claim of the JWT token.
2. The service verifies the request exists and is in `PENDING` status.
3. The `GroupMembershipRequest` record is updated with:
   - `status` → `DENIED`
   - `actor_id` → admin's user ID
   - `resolved_at` → current timestamp
   - `updated_by` → admin's user ID
   - `reason` → optional, stored only if provided
4. The user is **not** added to the group.
5. The record is retained for audit purposes; it is not deleted.

## Notes

- `DENIED` is a distinct state from `CANCELLED`; denial is an admin action, cancellation is a user action.
- `reason` is optional; if not supplied, the field remains `null`.
- No user notification mechanism is in scope for this feature.
