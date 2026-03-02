# Approve Group Membership Request

## Overview

Allows a system admin to approve a pending group membership request. The operation is performed atomically: the user is added to the group and the request status is updated to `APPROVED` in a single database transaction.

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
| 404    | Membership request not found             |
| 500    | Internal error; transaction rolled back  |

## Behaviour

1. The admin's identity is derived from the `sub` claim of the JWT token.
2. The service verifies the request exists and is in `PENDING` status.
3. A single Prisma transaction:
   - Upserts a `UserGroup` record to add the user to the group.
   - Updates the `GroupMembershipRequest` record with:
     - `status` → `APPROVED`
     - `actor_id` → admin's user ID
     - `resolved_at` → current timestamp
     - `updated_by` → admin's user ID
     - `reason` → optional, stored only if provided
4. If either operation fails, the transaction rolls back and the request remains `PENDING`.
