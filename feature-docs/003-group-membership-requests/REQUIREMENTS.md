# Feature: Group Membership Requests

## Overview

Users need a way to request membership to a specific group. System-level admins can review these requests and approve or deny them. Users can cancel their own pending requests. All state transitions are recorded for audit purposes.

---

## Actors

| Actor | Description |
|-------|-------------|
| **User** | Any authenticated user. Submits or cancels their own membership requests. |
| **System Admin** | A system-level administrator. Approves or denies pending membership requests. |

> **Note**: Group-level admin approval is explicitly out of scope for this feature and may be addressed in a future iteration.

---

## Request States

```
PENDING → APPROVED
PENDING → DENIED    (by admin)
PENDING → CANCELLED (by requesting user)
```

All requests (approved, denied, cancelled) are retained permanently for audit purposes.

---

## Functional Requirements

### FR-1: Submit a Membership Request

- **Actor**: Authenticated User
- **Trigger**: User calls the existing request-membership endpoint, supplying a `group_id`.
- **Identity**: The requesting user's identity is derived from the `sub` field of the JWT token payload — the user does not supply a `user_id` in the request body.
- **Behaviour**:
  - If the group does not exist → return `404 Not Found`.
  - If the user is already a member of the group → do nothing (return success silently; no new record created).
  - If the user already has a `PENDING` request for the same group → do nothing (return success silently; no duplicate created).
  - Otherwise → create a new membership request record with status `PENDING`.
- **Stored fields on create**:
  - `id` (generated)
  - `user_id` — from token `sub`
  - `group_id` — from request body
  - `status` — `PENDING`
  - `created_at` — timestamp of creation
  - `updated_at` — auto-updated on change

---

### FR-2: Cancel a Membership Request

- **Actor**: Authenticated User (must be the original requester)
- **Trigger**: User calls a cancel endpoint supplying the `request_id`.
- **Behaviour**:
  - If the request does not exist → return `404 Not Found`.
  - If the request does not belong to the authenticated user → return `403 Forbidden`.
  - If the request is not in `PENDING` state → return `400 Bad Request` (cannot cancel a request that has already been resolved).
  - Otherwise → update the request status to `CANCELLED`, recording:
    - `actor_id` — user's own ID (from token)
    - `resolved_at` — timestamp
    - `reason` — optional, supplied by the user

---

### FR-3: Approve a Membership Request

- **Actor**: System Admin
- **Trigger**: Admin calls an approve endpoint supplying the `request_id`.
- **Behaviour**:
  - If the request does not exist → return `404 Not Found`.
  - If the request is not in `PENDING` state → return `400 Bad Request`.
  - Execute the following in a **single database transaction**:
    1. Add the user to the group (reuse existing add-user-to-group database logic).
    2. Update the request status to `APPROVED`, recording:
       - `actor_id` — admin's ID (from token)
       - `resolved_at` — timestamp
       - `reason` — optional
  - If either step fails, the transaction rolls back and the request remains `PENDING`. Return `500 Internal Server Error` with an appropriate message.

---

### FR-4: Deny a Membership Request

- **Actor**: System Admin
- **Trigger**: Admin calls a deny endpoint supplying the `request_id`.
- **Behaviour**:
  - If the request does not exist → return `404 Not Found`.
  - If the request is not in `PENDING` state → return `400 Bad Request`.
  - Update the request status to `DENIED`, recording:
    - `actor_id` — admin's ID (from token)
    - `resolved_at` — timestamp
    - `reason` — optional, supplied by the admin

---

## Data Model

### `GroupMembershipRequest` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key, generated |
| `user_id` | UUID | FK → User |
| `group_id` | UUID | FK → Group |
| `status` | Enum | `PENDING`, `APPROVED`, `DENIED`, `CANCELLED` |
| `actor_id` | UUID (nullable) | ID of user who resolved the request |
| `reason` | String (nullable) | Optional reason for resolution |
| `resolved_at` | Timestamp (nullable) | When the request was resolved |
| `created_at` | Timestamp | Defaulted to now on creation |
| `updated_at` | Timestamp | Auto-updated on every change |

---

## Out of Scope

- Group-level admin approval (planned for a future feature).
- Role/permission enforcement on the existing add-user-to-group endpoint (separate feature).
- Any frontend UI — backend only for this feature.

---

## Open Questions / Notes

- The existing controller endpoint for submitting a request is already in place; this feature covers the service/repository layer and the approve/deny/cancel endpoints.
- No membership role is assigned at approval time — users are simply added to the group.
