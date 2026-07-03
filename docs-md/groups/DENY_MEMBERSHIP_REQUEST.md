# Deny Group Membership Request

## Overview

Allows a group admin of the target group or a system admin to deny a pending group membership request. The user is not added to the group and the request status is updated to `DENIED` with full audit information.

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
| 403    | Caller is not a group admin of the target group or a system admin |
| 404    | Membership request not found             |

## Behaviour

1. The caller's identity is resolved by the `IdentityGuard` (`req.resolvedIdentity`) from the JWT token.
2. The service verifies the request exists and is in `PENDING` status.
3. The service verifies the caller is a group admin of the request's group or a system admin (`identityCanAccessGroup` with minimum role `ADMIN`); otherwise `403 Forbidden`.
4. The `GroupMembershipRequest` record is updated with:
   - `status` → `DENIED`
   - `resolved_at` → current timestamp
   - `updated_by` → caller's actor ID
   - `reason` → optional, stored only if provided
5. The user is **not** added to the group.
6. A `membership_request_denied` audit event is recorded. The `DENIED` request row itself is ephemeral: it is deleted if the user later submits a new request for the same group (unique constraint on `(group_id, user_id, status)`); the audit log is the durable history.

## Notes

- `DENIED` is a distinct state from `CANCELLED`; denial is an admin action, cancellation is a user action.
- `reason` is optional; if not supplied, the field remains `null`.
- No user notification mechanism is in scope for this feature.
