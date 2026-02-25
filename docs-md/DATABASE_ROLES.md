# Roles Table Separation

## Overview

The system now uses a normalized roles schema in the database. Instead of storing roles as an array or embedded field on the `User` or `ApiKey` models, roles are managed in their own table and linked to users via a join table. This enables flexible, scalable, and auditable role-based access control (RBAC).

## Schema Changes

- **Role Table**: Stores all possible roles (e.g., `admin`, `user-manager`, `reviewer`).
- **UserRole Table**: Join table linking users to roles (many-to-many relationship).
- **User Table**: No longer contains a `roles` array field. Roles are now resolved via the join table.
- **ApiKey Table**: No longer contains `user_email` or `roles` fields. API keys are linked to users via `user_id`.

## Migration Notes

- All backend code now queries user roles via the `UserRole` join table and `Role` table.
- All tests and mocks have been updated to reflect the new schema.
- Prisma schema and client have been updated. Run migrations and regenerate the Prisma client after pulling schema changes.

## Example Usage

To fetch a user's roles:

```typescript
const userWithRoles = await prisma.user.findFirst({
  where: { id: userId },
  include: { userRoles: { include: { role: true } } },
});
const roles = userWithRoles.userRoles.map(ur => ur.role.name);
```

## RBAC Enforcement

- The `RolesGuard` and `@Roles()` decorator enforce RBAC using the normalized roles.
- Controllers should use `@Roles('admin')` or similar decorators to restrict access.

## Benefits

- Centralized role management
- Supports arbitrary role assignments
- Enables future auditing and reporting

## See Also
- [AUTHENTICATION.md](AUTHENTICATION.md) for RBAC and guard usage
- [DATABASE_SERVICES.md](DATABASE_SERVICES.md) for model details
