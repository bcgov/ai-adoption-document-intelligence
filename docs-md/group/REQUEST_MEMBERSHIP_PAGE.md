# RequestMembershipPage

The `RequestMembershipPage` is shown to authenticated users who have no group memberships. It allows them to browse all available groups and submit a membership request for administrator review.

## Location

`apps/frontend/src/pages/RequestMembershipPage.tsx`

## Route

`/request-membership`

Wrapped in a `MembershipPageGuard` (see `NoGroupGuard.tsx`): users who already have group access (or are system-admins) are redirected to `/` to prevent them from staying on this page unnecessarily.

## Overview

- Fetches all groups via `useAllGroups()` from `useGroups.ts` (`GET /api/groups`).
- Renders a `Radio.Group` listing each group for the user to select.
- Submits the request via `useRequestMembership()` (`POST /api/groups/request`) with the selected group's ID.
- Displays distinct loading, success, and error states.

## Behaviour

| State | Displayed UI |
|---|---|
| Groups loading | Spinner (`data-testid="groups-loader"`) |
| Groups load error | Red alert (`data-testid="groups-error"`) |
| Groups available | `Radio.Group` with one radio per group |
| No groups returned | Informational text (`data-testid="no-groups-message"`) |
| Awaiting submission | Submit button disabled with loading indicator |
| Submission success | Green alert (`data-testid="request-success"`); submit button hidden |
| Submission error | Red alert with error message (`data-testid="request-error"`) |

A **Sign out** button is always visible at the bottom of the page.

## Hooks

| Hook | File | Purpose |
|---|---|---|
| `useAllGroups` | `src/data/hooks/useGroups.ts` | Fetches all groups from `GET /api/groups` |
| `useRequestMembership` | `src/data/hooks/useGroups.ts` | Mutation to `POST /api/groups/request` |

## Tests

`apps/frontend/src/pages/RequestMembershipPage.test.tsx` covers:

- Loading state shows a spinner (Scenario 1)
- Groups are rendered as radio options (Scenario 1)
- Groups fetch error shows an alert (Scenario 1)
- Empty group list shows an informational message (Scenario 1)
- Submit button disabled until a group is selected (Scenario 2)
- Correct `groupId` is passed to the mutation on submit (Scenario 2)
- Success alert displayed and submit button hidden after success (Scenario 3)
- Error alert displayed with message after failure (Scenario 4)
- Sign out button calls `logout` from `AuthContext` (additional)

## Integration Points

- **`NoGroupGuard` / `MembershipPageGuard`** (`src/auth/NoGroupGuard.tsx`) — controls access to this route.
- **`GroupSelector`** (`src/components/group/GroupSelector.tsx`) — links to this page when the user has no group memberships.
- **`App.tsx`** — registers the route at `/request-membership`.
