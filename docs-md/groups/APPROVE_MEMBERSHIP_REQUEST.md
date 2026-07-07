# Approve Group Membership Request

## Overview

Allows a group admin of the target group or a system admin to approve a pending group membership request. The operation is performed atomically: the user is added to the group and the request status is updated to `APPROVED` in a single database transaction.

## Endpoint

`PATCH /api/groups/requests/:requestId/approve`

### Path Parameters

| Parameter   | Type   | Description                    |
|-------------|--------|--------------------------------|
| `requestId` | string | ID of the membership request   |

### Request Body

| Field    | Type   | Required | Description                    |
|----------|--------|----------|--------------------------------|
| `reason` | string | No       | Optional reason for the approval |

### Responses

| Status | Description                              |
|--------|------------------------------------------|
| 200    | Request approved successfully            |
| 400    | Request is not in `PENDING` state        |
| 401    | Unauthorized (no valid JWT)              |
| 403    | Caller is not a group admin of the target group or a system admin |
| 404    | Membership request not found             |
| 500    | Internal error; transaction rolled back  |

## Behaviour

1. The caller's identity is resolved by the `IdentityGuard` (`req.resolvedIdentity`) from the JWT token.
2. The service verifies the request exists and is in `PENDING` status.
3. The service verifies the caller is a group admin of the request's group or a system admin (`identityCanAccessGroup` with minimum role `ADMIN`); otherwise `403 Forbidden`.
4. A single Prisma transaction:
   - Deletes any prior resolved (non-`PENDING`) request records for the same user+group pair, to satisfy the unique constraint on `(group_id, user_id, status)`.
   - Upserts a `UserGroup` record to add the user to the group.
   - Updates the `GroupMembershipRequest` record with:
     - `status` → `APPROVED`
     - `resolved_at` → current timestamp
     - `updated_by` → caller's actor ID
     - `reason` → optional, stored only if provided
5. If any operation fails, the transaction rolls back and the request remains `PENDING`.
6. On success, two audit events are recorded: `membership_request_approved` and `member_added`.
