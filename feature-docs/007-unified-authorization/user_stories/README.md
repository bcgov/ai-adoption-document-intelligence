# Feature 007 – Unified Authorization via `@Identity` Decorator: User Stories

## Overview

This folder contains atomic user stories derived from the [REQUIREMENTS.md](../REQUIREMENTS.md) for the Unified Authorization feature. Stories are organized into five phases that reflect a logical implementation order.

---

## Phase 1: Core Infrastructure

Establish the foundational types, decorator, and guard wiring before any enforcement is added.

- [x] [US-001: Create `@Identity` Method Decorator with Options Interface](US-001-create-identity-decorator.md)
- [x] [US-002: Extend `ResolvedIdentity` Type with `isSystemAdmin` and `groupRoles`](US-002-extend-resolved-identity-type.md)
- [ ] [US-003: Enrich `resolvedIdentity` for API Key Requests in `IdentityGuard`](US-003-guard-enrichment-api-key-path.md)
- [ ] [US-004: Enrich `resolvedIdentity` for JWT Requests in `IdentityGuard`](US-004-guard-enrichment-jwt-path.md)
- [ ] [US-010: `IdentityGuard` Pass-Through When `@Identity` Is Absent](US-010-guard-passthrough-no-decorator.md)

---

## Phase 2: Enforcement Logic

Add the authorization enforcement checks inside the guard.

- [ ] [US-005: Enforce `requireSystemAdmin` in `IdentityGuard`](US-005-enforce-require-system-admin.md)
- [ ] [US-006: Extract `group_id` and Enforce Group Membership via `groupIdFrom`](US-006-enforce-group-membership.md)
- [ ] [US-007: Enforce `minimumRole` Within a Group in `IdentityGuard`](US-007-enforce-minimum-role.md)
- [ ] [US-008: Enforce `allowApiKey` in `IdentityGuard`](US-008-enforce-allow-api-key.md)

---

## Phase 3: Swagger Replacement & Dead Code Removal

Replace legacy auth decorators with `@Identity` and remove dead code.

- [ ] [US-009: `@Identity` Applies Swagger Security Metadata](US-009-identity-swagger-metadata.md)
- [ ] [US-011: Delete `RolesGuard`, `@Roles`, `@ApiKeyAuth()`, and `@KeycloakSSOAuth()` Dead Code](US-011-delete-dead-code-guards-decorators.md)
- [ ] [US-012: Delete `identityCanAccessGroup` and `getIdentityGroupIds` Helper Functions](US-012-delete-identity-helper-functions.md)

---

## Phase 4: Endpoint Migration

Update existing endpoints to use `@Identity` and the enriched `resolvedIdentity`.

- [ ] [US-013: Migrate Creation Endpoints to Use `@Identity` with `groupIdFrom`](US-013-migrate-creation-endpoints.md)
- [ ] [US-014: Migrate System-Admin Endpoints to Use `@Identity({ requireSystemAdmin: true })`](US-014-migrate-system-admin-endpoints.md)
- [ ] [US-015: Migrate Resource-by-ID Endpoints to Use `resolvedIdentity.groupRoles`](US-015-migrate-resource-by-id-endpoints.md)
- [ ] [US-016: Migrate List Endpoints to Use `resolvedIdentity.groupRoles`](US-016-migrate-list-endpoints.md)

---

## Phase 5: Testing

Ensure complete test coverage for the guard.

- [ ] [US-017: Write Unit Tests for `IdentityGuard`](US-017-unit-tests-identity-guard.md)
