# GroupSelector

The `GroupSelector` component renders a searchable dropdown in the app header that lets an authenticated user switch their active group context. When the user has no group memberships it shows a prompt linking to the membership-request page instead.

## Location

`apps/frontend/src/components/group/GroupSelector.tsx`

## Overview

- Consumes `useGroup()` from `GroupContext` to read `availableGroups`, `activeGroup`, and `setActiveGroup`.
- Renders a [Mantine `Select`](https://mantine.dev/core/select/) with `searchable` enabled when the user belongs to at least one group.
- When `availableGroups` is empty, renders a Mantine `Anchor` linking to `/request-membership` instead of the dropdown.

## Usage

The component is self-contained — it reads group state directly from context and requires no props.

```tsx
import { GroupSelector } from "./components/group/GroupSelector";

// Inside your header:
<GroupSelector />
```

`GroupProvider` must be an ancestor in the component tree (already configured in `main.tsx`).

## Behaviour

| State | Rendered element |
|---|---|
| User has ≥ 1 group | Searchable `Select` showing `activeGroup` name |
| User has 0 groups | `Anchor` with text "No groups — request membership" linking to `/request-membership` |

## Integration Points

- **`GroupContext`** — source of truth for available and active groups.
- **App header** (`App.tsx`) — rendered adjacent to the user avatar inside `AppShell.Header`.
- **Membership request page** (`/request-membership`) — navigation target for the empty-groups prompt (implemented as part of US-005).

## Tests

`apps/frontend/src/components/group/GroupSelector.test.tsx` covers:

- Selector visible when user has groups (Scenario 1 & 2)
- Active group displayed as current value (Scenario 3)
- Selecting an option calls `setActiveGroup` with the correct group (Scenario 4)
- Typing filters the option list (Scenario 5)
- Empty-groups state renders the membership prompt with correct `href` (Scenario 6)
