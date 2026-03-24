# Feature: Unified Authorization via @Identity Decorator

## Overview

Extend `IdentityGuard` to support a unified `@Identity` decorator that:

1. Enriches `request.resolvedIdentity` with system-admin status and group roles (lazily, only when the decorator is present).
2. Enforces access rules (system-admin requirement, group membership, minimum group role, API key permission) before the controller runs.
3. Replaces the existing `@ApiKeyAuth()` and `@KeycloakSSOAuth()` Swagger/NestJS auth decorators.
4. Deletes the broken `RolesGuard` / `@Roles` decorator and the `identityCanAccessGroup` / `getIdentityGroupIds` helpers.


---

## Background & Problem Statement

- Group authorization is currently opt-in at the controller layer. Every endpoint manually calls `identityCanAccessGroup` or `getIdentityGroupIds`. If a developer adds an endpoint and omits these calls, the endpoint is open to any authenticated user.
- `RolesGuard` and `@Roles` are dead code: they read roles from the JWT payload, but roles live entirely in the database (`User.is_system_admin`, `UserGroup.role`).
- `@ApiKeyAuth()` and `@KeycloakSSOAuth()` are composites that apply both NestJS auth guards and Swagger security metadata. They are distinct from authorization (membership / role) checks.

---

## Solution

### `@Identity` Decorator

A method decorator that accepts an options object:

```typescript
interface IdentityOptions {
  /**
   * When true, only users with `is_system_admin = true` may proceed.
   * API keys always fail this check (they are group-scoped, never system admin).
   * System admins bypass all group role checks.
   * Default: false
   */
  requireSystemAdmin?: boolean;

  /**
   * When set, the guard extracts a group_id from the specified location and
   * verifies the caller is a member of that group.
   * If the group_id value is absent from the request, throws 400 Bad Request.
   */
  groupIdFrom?: {
    param?: string;   // route param name, e.g. 'groupId'
    query?: string;   // query param name, e.g. 'group_id'
    body?: string;    // body field name, e.g. 'group_id'
  };

  /**
   * When set alongside groupIdFrom, the caller must have at least this role
   * in the resolved group. Role hierarchy: MEMBER < ADMIN.
   * If groupIdFrom is not provided, minimumRole is ignored.
   */
  minimumRole?: GroupRole; // 'MEMBER' | 'ADMIN'

  /**
   * When true, requests authenticated via API key are permitted.
   * API keys are treated as having the MEMBER role for the key's scoped group.
   * Default: false — API key requests are rejected with 403.
   */
  allowApiKey?: boolean;
}
```

**Usage examples:**

```typescript
// System-admin-only endpoint
@Identity({ requireSystemAdmin: true })
@Get('admin/stats')
getAdminStats() { ... }

// Any group member — group_id in request body
@Identity({ groupIdFrom: { body: 'group_id' } })
@Post()
createDocument(@Body() dto: CreateDocumentDto) { ... }

// Group ADMIN required — group_id as route param; also allow API keys
@Identity({ groupIdFrom: { param: 'groupId' }, minimumRole: GroupRole.ADMIN, allowApiKey: true })
@Delete(':groupId')
deleteGroup(@Param('groupId') groupId: string) { ... }
```

---

### `IdentityGuard` Changes

`IdentityGuard` is made async (`Promise<boolean>`) to support DB lookups.

When `@Identity` metadata **is present**, the guard:

1. Resolves the identity as today (API key → `apiKeyGroupId`, JWT → `userId`).
2. **API key path** — no DB lookup needed:
   - Sets `resolvedIdentity.isSystemAdmin = false`.
   - Sets `resolvedIdentity.groupRoles = { [apiKeyGroupId]: GroupRole.MEMBER }`.
   - If `allowApiKey` is `false`, throws `403 Forbidden`.
3. **JWT path** — fires two parallel DB queries:
   - `isUserSystemAdmin(userId)` → sets `resolvedIdentity.isSystemAdmin`.
   - `getUsersGroups(userId)` (already returns the `role` field) → sets `resolvedIdentity.groupRoles` as `Record<groupId, GroupRole>`.
4. **Enforcement** (in order):
   - If `requireSystemAdmin: true` and `isSystemAdmin` is false → `403 Forbidden`.
   - If `groupIdFrom` is provided:
     - Extract group_id from the specified location. If missing → `400 Bad Request`.
     - If `isSystemAdmin` is true → pass (system admin bypasses all group checks).
     - Check `groupRoles[group_id]` exists. If not a member → `403 Forbidden`.
     - If `minimumRole` is set, verify the role satisfies the minimum (`MEMBER < ADMIN`). If not → `403 Forbidden`.

When `@Identity` metadata **is absent**, the guard behaves exactly as today (no DB queries, no enforcement — pass-through after identity resolution).

---

### `resolvedIdentity` Shape Extension

The `groupId` field (previously set on the API key path) is removed. Instead, both paths converge on `groupRoles`. The type becomes:

```typescript
interface ResolvedIdentity {
  userId?: string;    // JWT path only
  // New — populated by @Identity enrichment:
  isSystemAdmin?: boolean;
  groupRoles?: Record<string, GroupRole>; // key: group_id, value: GroupRole
}
```

Callers that previously read `resolvedIdentity.groupId` (API key path) must be updated to read from `groupRoles` instead.

---

### Swagger Replacement

`@Identity` applies the same Swagger security metadata currently applied by `@ApiKeyAuth()` and `@KeycloakSSOAuth()`:

- If `allowApiKey: true` → apply both `@ApiBearerAuth()` and `@ApiSecurity('api-key')`.
- If `allowApiKey: false` (default) → apply only `@ApiBearerAuth()`.

All existing usages of `@ApiKeyAuth()` and `@KeycloakSSOAuth()` are replaced with `@Identity(...)` accordingly.

---

## Removals

| Item | Action |
|---|---|
| `RolesGuard` | Delete |
| `@Roles` decorator | Delete |
| `identityCanAccessGroup` helper | Delete — migrate all usages |
| `getIdentityGroupIds` helper | Delete — migrate all usages |
| `@ApiKeyAuth()` decorator | Delete — replaced by `@Identity` |
| `@KeycloakSSOAuth()` decorator | Delete — replaced by `@Identity` |

---

## Migration of Existing Endpoints

- **Resource-by-ID endpoints** (e.g. `GET /documents/:documentId`): These fetch the resource first to get its `group_id`, then call `identityCanAccessGroup`. After this feature, they instead check `request.resolvedIdentity.groupRoles[document.group_id]` directly — no helper needed, but the controller still does the resource fetch. `@Identity` is still applied (e.g. with just `allowApiKey: true` for Swagger replacement), and manual group checks use the enriched `resolvedIdentity.groupRoles` map.
- **List endpoints** (e.g. `GET /documents`): These use `getIdentityGroupIds` for filtering. After removal, they use `resolvedIdentity.groupRoles` (via `Object.keys`) or `resolvedIdentity.isSystemAdmin` to determine visible groups.
- **Creation endpoints with `group_id` in body** (e.g. `POST /upload`): Replaced fully by `@Identity({ groupIdFrom: { body: 'group_id' }, allowApiKey: true })`.
- **System-admin endpoints** (group management, etc.): Replaced by `@Identity({ requireSystemAdmin: true })`.

---

## Constraints & Out of Scope

- **Sub-resource traversal** (e.g. finding a group via a review session's parent document) is out of scope. Those endpoints keep manual controller-layer checks using `resolvedIdentity.groupRoles`.
- **Group membership requests** endpoints that check `groupId` from a route param can use `@Identity({ groupIdFrom: { param: 'groupId' } })`.
- This feature does not change the database schema.
- `getUsersGroups` in `DatabaseService` already returns the `role` field from `UserGroup`; no DB changes are needed.

---

## Non-Functional Requirements

- The guard must not add DB queries to endpoints without `@Identity`.
- The two DB queries on the JWT path (`isUserSystemAdmin` + `getUsersGroups`) must be issued in parallel (`Promise.all`).
- Unit tests must cover: no decorator (pass-through), API key allowed, API key blocked, system admin bypass, member passes, member fails minimumRole: ADMIN, non-member blocked, missing groupId → 400.
