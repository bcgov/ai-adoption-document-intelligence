# Sidebar Navigation — Groups Link

## Overview

The application sidebar includes a **Groups** navigation link accessible to all authenticated users. Clicking it navigates to the `/groups` route, which renders the `GroupsPage` component within the existing `AppShell` layout.

## Behaviour

| Scenario | Behaviour |
|----------|-----------|
| Link visibility | The Groups link is visible in both expanded and collapsed sidebar states. |
| Navigation | Clicking the Groups link navigates to `/groups` via React Router. |
| Active state | The link is highlighted (blue, light variant) whenever the current path starts with `/groups`, covering `/groups` and `/groups/:groupId`. |
| Leaving groups | Clicking any other sidebar item while on a `/groups*` route navigates back to `/` before activating the new view. |

## Components

- **[`src/App.tsx`](../../apps/frontend/src/App.tsx)** — Contains the `MainApp` component which renders the sidebar. The Groups nav item is added after the existing `navItems` map and uses `useNavigate` / `useLocation` from React Router for route-aware active state.
- **[`src/pages/GroupsPage.tsx`](../../apps/frontend/src/pages/GroupsPage.tsx)** — Placeholder page rendered when the route matches `/groups*`. Full listing content is provided by US-015.

## Routing

The Groups page is served through the existing `*` catch-all route inside `AppContent`, which wraps `MainApp` with `NoGroupGuard`. No additional route registration is required.
