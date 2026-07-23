# Sidebar Navigation — Groups Link

## Overview

The application sidebar includes a **Groups** navigation link accessible to all authenticated users. Clicking it navigates to the `/groups` route, which renders the `GroupsPage` component within the app layout.

## Behaviour

| Scenario | Behaviour |
|----------|-----------|
| Link visibility | The Groups link is visible in both expanded and collapsed sidebar states. |
| Navigation | Clicking the Groups link navigates to `/groups` via React Router. |
| Active state | The link is highlighted whenever the current path starts with `/groups`, covering `/groups` and `/groups/:groupId`. |

## Components

- **[`src/layouts/RootLayout.tsx`](../../apps/frontend/src/layouts/RootLayout.tsx)** — Renders the sidebar; the Groups entry is part of `navItems` and uses React Router for route-aware active state.
- **[`src/pages/GroupsPage.tsx`](../../apps/frontend/src/pages/GroupsPage.tsx)** — Group listing page (see [GROUPS_PAGE.md](./GROUPS_PAGE.md)).

## Routing

Routes are registered explicitly with `createBrowserRouter` in [`src/App.tsx`](../../apps/frontend/src/App.tsx): `groups` → `GroupsPage`, `groups/:groupId` → `GroupDetailPage`, both under the `NoGroupGuard`-wrapped root layout.
