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
interface Group {
  id: string;
  name: string;
}
```

Exported from `AuthContext.tsx` and re-used throughout the frontend.

### `GroupContextType`

| Property         | Type                    | Description                                                  |
| ---------------- | ----------------------- | ------------------------------------------------------------ |
| `availableGroups`| `Group[]`               | All groups the authenticated user belongs to.                |
| `activeGroup`    | `Group \| null`         | The currently selected group, or `null` if the user has no memberships. |
| `setActiveGroup` | `(group: Group) => void`| Updates the active group and persists its `id` to `localStorage`. |

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

const { availableGroups, activeGroup, setActiveGroup } = useGroup();
```

Throws an error if called outside of a `GroupProvider`.

## Initialisation Logic

| Condition                                                           | Result                             |
| ------------------------------------------------------------------- | ---------------------------------- |
| `availableGroups` is empty                                          | `activeGroup` is `null`            |
| `localStorage` has no `activeGroupId`                               | First entry in `availableGroups`   |
| `localStorage` has an `activeGroupId` that matches a membership     | Matching `Group` object            |
| `localStorage` has a stale `activeGroupId` (no longer a membership) | First entry in `availableGroups`   |

## Persistence

`setActiveGroup(group)` updates `localStorage.activeGroupId` to the group's `id`. On next load, `GroupProvider` restores this selection automatically.

## Related changes

- `AuthContext.tsx` – `MeResponse` and `AuthUser` extended with `groups: Group[]`.
- `meResponseToUser` – now propagates `groups` from the `/me` response (defaults to `[]` if absent).
