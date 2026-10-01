# GroupContext

The `GroupContext` provides frontend-wide state management for the user's group membership. It tracks which groups the authenticated user belongs to and which group is currently _active_ (in scope for all group-aware operations).

## Location

`apps/frontend/src/auth/GroupContext.tsx`

## Overview

A React context/provider pair that:

1. Reads the user's group list from `AuthContext` (populated by `/api/auth/me`).
2. Persists the active group selection to `localStorage` under the key `activeGroupId`.
3. Restores the previously selected group on page load.

No additional network calls are made.

## Interfaces

### `Group`

```ts
type GroupRole = "ADMIN" | "EDITOR" | "REVIEWER";

interface Group {
  id: string;
  name: string;
  role?: GroupRole;
  permissions?: Permission[];
}
```

Exported from `AuthContext.tsx` and re-used throughout the frontend. `permissions` is the role's permission list from `/api/auth/me`, sent as numbers: values of the `Permission` enum in `apps/frontend/src/auth/permissions.ts` (see [FRONTEND_ROUTE_PERMISSIONS.md](../auth/FRONTEND_ROUTE_PERMISSIONS.md)).

### `GroupContextType`

| Property         | Type                    | Description                                                  |
| ---------------- | ----------------------- | ------------------------------------------------------------ |
| `availableGroups`| `Group[]`               | All groups the authenticated user belongs to.                |
| `activeGroup`    | `Group \| null`         | The currently selected group, or `null` if the user has no memberships. |
| `setActiveGroup` | `(group: Group) => void`| Updates the active group and persists its `id` to `localStorage`. |
| `hasPermissionForGroup` | `(groupId: string, requiredPermissions: Permission[]) => boolean` | `true` when the user's membership in that group holds every listed permission. It does not consider system-admin status; callers check `isSystemAdmin` from `useAuth()` first. |

## Provider

```tsx
import { GroupProvider } from "./auth/GroupContext";

<AuthProvider>
  <GroupProvider>
    {/* app tree */}
  </GroupProvider>
</AuthProvider>
```

`GroupProvider` **must** be nested inside `AuthProvider` because it reads `user` from `useAuth()`.

## Hook

```ts
import { useGroup } from "./auth/GroupContext";

const { availableGroups, activeGroup, setActiveGroup, hasPermissionForGroup } =
  useGroup();
```

Throws an error if called outside of a `GroupProvider`.

## Initialisation Logic

| Condition                                                           | Result                             |
| ------------------------------------------------------------------- | ---------------------------------- |
| `availableGroups` is empty                                          | `activeGroup` is `null`            |
| `localStorage` has no `activeGroupId`                               | First entry in `availableGroups`   |
| `localStorage` has an `activeGroupId` that matches a membership     | Matching `Group` object            |
| `localStorage` has a stale `activeGroupId` (no longer a membership) | First entry in `availableGroups`   |

`activeGroup` is computed from these rules on every render rather than held in state, so it is set in the same render in which the user's groups arrive from `/me`. Route guards depend on this: they run on that first render after a page load, and an empty active group there would redirect the user to `/`.

## Persistence

`setActiveGroup(group)` updates `localStorage.activeGroupId` to the group's `id`. On next load, `GroupProvider` restores this selection automatically.

## Related changes

- `AuthContext.tsx` – `MeResponse` and `AuthUser` extended with `groups: Group[]`.
- `meResponseToUser` – now propagates `groups` from the `/me` response (defaults to `[]` if absent).
