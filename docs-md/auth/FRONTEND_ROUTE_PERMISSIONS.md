# Frontend Route Permissions

The frontend shows each user only the pages their group role can use: it hides sidebar entries, blocks routes, and picks a landing page from the permissions of the active group. These checks shape the UI only. Every API request is still authorized by the backend, as described in [GROUP_RESOURCE_AUTHORIZATION.md](./GROUP_RESOURCE_AUTHORIZATION.md).

## Key files

| File | Role |
|------|------|
| `apps/frontend/src/routes.config.tsx` | `appRoutes`: every page route with its element, required permissions, optional sidebar entry and landing priority. Also defines `HomeRedirect`. |
| `apps/frontend/src/App.tsx` | Builds the router from `appRoutes`, wrapping each route that lists permissions in `GroupPermissionGuard`. |
| `apps/frontend/src/layouts/RootLayout.tsx` | Builds the sidebar from `appRoutes`, showing only entries the active group can open. |
| `apps/frontend/src/auth/NoGroupGuard.tsx` | `GroupPermissionGuard`, alongside `NoGroupGuard` and `MembershipPageGuard`. |
| `apps/frontend/src/auth/GroupContext.tsx` | `activeGroup` and `hasPermissionForGroup` (see [GROUP_CONTEXT.md](../groups/GROUP_CONTEXT.md)). |
| `apps/frontend/src/auth/permissions.ts` | The frontend's copy of the `Permission` enum. |

## Where the permissions come from

`GET /api/auth/me` returns each of the user's groups with its `role` and `permissions`: the role's list from `RoleClaimsMap` in `apps/backend-services/src/auth/role-permissions.ts`. The permissions are sent as numbers — each value's position in the backend `Permission` enum. The frontend compares them against its own copy of the enum in `apps/frontend/src/auth/permissions.ts`, so both enums must list the same members in the same order.

## Route configuration

Each entry in `appRoutes` is an `AppRouteConfig`:

| Field | Meaning |
|-------|---------|
| `path` / `index` | Route path without a leading slash, or `index: true` for `/`. |
| `element` | The page component. |
| `permissions` | Permissions the active group must hold to open the route. A route without `permissions` is open to every signed-in group member, reviewers included. |
| `nav` | Sidebar entry: `label`, `description`, `icon`, and `navSection` — `benchmarking` for the collapsible Benchmarking group, `bottom` for the section after it, absent for the main list. |
| `homePriority` | Makes the route a landing-page candidate for `/`; the lowest value the user can open wins. |

A new page is added as an `appRoutes` entry whose `permissions` match the endpoints the page calls, with `nav` when it belongs in the sidebar.

## Access rules

- **Route guard.** `GroupPermissionGuard` lets system admins through. Anyone else needs an active group holding every listed permission, or is redirected to `/`.
- **Sidebar.** An entry is shown under the same rule. The Benchmarking group is hidden when none of its entries are visible.
- **Landing page.** `/` renders `HomeRedirect`, which redirects to the reachable route with the lowest `homePriority`: `/upload` (needs `DOCUMENT_CREATE`) for admins and editors, `/review` (needs `HITL_QUEUE_RETRIEVE`) for reviewers. With no reachable candidate it renders nothing.
- **Controls within a page.** Pages hide individual actions with `hasPermissionForGroup`: classifier delete (`CLASSIFIER_DELETE`), creating tables (`TABLE_CREATE`), editing a table's settings, columns and lookups (`TABLE_UPDATE`), managing a group's members and membership requests (`GROUP_UPDATE`), and the billing page (`GROUP_BILLING`).
- **Page loads.** The guard and the sidebar read `activeGroup`, which `GroupContext` derives during render, so it is already set on the first render after `/me` returns and a reloaded or pasted URL stays where it is.

## Tests

- `apps/frontend/src/auth/GroupPermissionGuard.test.tsx` loads a guarded route fresh, with the real auth and group providers, for a user with and without the permission and for a system admin.
- `tests/e2e/helpers/auth.ts` fakes `/api/auth/me` for Playwright as an `ADMIN` of the default group holding every permission, read from `apps/frontend/src/auth/permissions.ts`.
