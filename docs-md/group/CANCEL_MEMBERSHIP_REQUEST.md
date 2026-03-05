# Cancel Group Membership Request API

## Endpoint

`PATCH /api/groups/requests/:requestId/cancel`

Allows an authenticated user to cancel their own pending group membership request. The requesting user's identity is derived from the JWT token (`sub` claim).

## Path Parameters

| Parameter   | Type   | Required | Description                          |
|-------------|--------|----------|--------------------------------------|
| `requestId` | string | Yes      | The ID of the membership request to cancel |

## Request Body

| Field    | Type   | Required | Description                    |
|----------|--------|----------|--------------------------------|
| `reason` | string | No       | Optional reason for cancellation |

## Response

| Status | Description                                             |
|--------|---------------------------------------------------------|
| `200`  | Request cancelled successfully                          |
| `400`  | Request is not in `PENDING` state                       |
| `401`  | No authenticated user / missing `sub` claim             |
| `403`  | Request belongs to a different user                     |
| `404`  | Membership request not found                            |

```json
{ "success": true }
```

## Business Rules

- Only `PENDING` requests can be cancelled. Attempts to cancel an `APPROVED`, `DENIED`, or already `CANCELLED` request will return `400 Bad Request`.
- A user may only cancel their own requests. Attempting to cancel another user's request returns `403 Forbidden`.
- `CANCELLED` is distinct from `DENIED`: `CANCELLED` is initiated by the requesting user; `DENIED` is initiated by an admin.
- On successful cancellation, `status` is set to `CANCELLED`, `actor_id` and `updated_by` are set to the requesting user's ID, and `resolved_at` is set to the current timestamp.
- `reason` is optional; if not supplied, it remains `null`.

## Frontend UI

Cancellation is exposed in the **My Requests** tab on the Groups page (`/groups`).

- A **Cancel** button is shown only for rows with `PENDING` status.
- Clicking **Cancel** opens a Mantine `Modal` asking the user to confirm the cancellation.
- Clicking **Confirm** in the modal calls `PATCH /api/groups/requests/:requestId/cancel` and, on success, closes the modal and invalidates the `my-requests` query so the table refreshes.
- Clicking **Back** dismisses the modal without making any API call.
- If the API call fails, a red error notification is shown via `@mantine/notifications`.
