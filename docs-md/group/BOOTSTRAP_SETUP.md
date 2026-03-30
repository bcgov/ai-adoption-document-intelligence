# System Bootstrap / First-Time Setup

## Overview

When the application is deployed for the first time, there are no system administrators or groups in the database. The bootstrap feature allows the designated deployer to initialize the system through a Setup UI page, creating the first admin account and a default group.

## How It Works

1. A user logs in to a fresh deployment
2. The `NoGroupGuard` redirects them to `/request-membership` (no groups exist)
3. The `RequestMembershipPage` checks bootstrap status via `GET /api/bootstrap/status`
4. If bootstrap is needed (zero system admins), the **Setup page** is shown instead of the membership request form
5. If the logged-in user's email matches `BOOTSTRAP_ADMIN_EMAIL`, a **Setup** button is displayed
6. Clicking Setup calls `POST /api/bootstrap`, which:
   - Promotes the user to system admin (`is_system_admin = true`)
   - Creates a "Default" group
   - Assigns the user as group admin of the Default group
7. The page redirects to `/` and the user sees the main application

## Configuration

Set the `BOOTSTRAP_ADMIN_EMAIL` environment variable in your deployment config:

```
BOOTSTRAP_ADMIN_EMAIL=deployer@example.com
```

This is added to the backend ConfigMap via the kustomize overlay and is available as a backend environment variable.

## Security

- The bootstrap endpoint only works when **zero system admins** exist in the database
- The caller's email (from their SSO/JWT token) must exactly match `BOOTSTRAP_ADMIN_EMAIL` (case-insensitive)
- Once a system admin exists, the bootstrap endpoints return `needed: false` and `POST /api/bootstrap` returns `409 Conflict`
- The `BOOTSTRAP_ADMIN_EMAIL` variable has no effect after bootstrap is complete

## API Endpoints

### `GET /api/bootstrap/status`

Returns whether bootstrap is needed and if the caller is eligible.

**Response:**
```json
{ "needed": true, "eligible": true }
```

### `POST /api/bootstrap`

Performs the bootstrap action. Requires authentication.

**Response (success):**
```json
{ "success": true, "groupId": "...", "groupName": "Default" }
```

**Error responses:**
- `403 Forbidden` — caller's email does not match `BOOTSTRAP_ADMIN_EMAIL`
- `409 Conflict` — a system admin already exists

## Files

| File | Purpose |
|------|---------|
| `apps/backend-services/src/bootstrap/bootstrap.module.ts` | NestJS module registration |
| `apps/backend-services/src/bootstrap/bootstrap.service.ts` | Bootstrap logic (status check, admin promotion, group creation) |
| `apps/backend-services/src/bootstrap/bootstrap.controller.ts` | REST API endpoints |
| `apps/backend-services/src/bootstrap/bootstrap.service.spec.ts` | Unit tests |
| `apps/frontend/src/pages/SetupPage.tsx` | Setup UI page component |
| `apps/frontend/src/data/hooks/useBootstrap.ts` | React Query hooks for bootstrap API |
| `apps/frontend/src/pages/RequestMembershipPage.tsx` | Conditionally renders SetupPage when bootstrap is needed |
