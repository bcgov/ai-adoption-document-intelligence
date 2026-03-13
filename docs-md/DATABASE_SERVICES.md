# Database services (backend-services)

The database layer in `apps/backend-services/src/database/` is split into focused services for maintainability.

## Layout

| File | Service | Responsibility |
|------|---------|----------------|
| `database.types.ts` | — | Shared types: `DocumentData`, `LabelingProjectData`, `LabeledDocumentData`, `LabelingDocumentData`, `ReviewSessionData` |
| `prisma.service.ts` | `PrismaService` | Owns the Prisma client (connection, config). Exposes `prisma: PrismaClient`. |
| `labeling-document-db.service.ts` | `LabelingDocumentDbService` | Labeling document CRUD: `createLabelingDocument`, `findLabelingDocument`, `updateLabelingDocument` |
| `labeling-project-db.service.ts` | `LabelingProjectDbService` | Labeling projects, field definitions, labeled documents, document labels |
| `review-db.service.ts` | `ReviewDbService` | Review sessions, field corrections, review queue, review analytics |
| `database.service.ts` | `DatabaseService` | Facade that delegates to the above services and re-exports types. Exposes `prisma` getter for code that needs direct Prisma access (e.g. training). Document operations (`createDocument`, `findDocument`, etc.) are implemented directly here using Prisma for backward compatibility with existing callers. |

## Document Module DB Service

`DocumentDbService` has moved to `apps/backend-services/src/document/document-db.service.ts` and is scoped to the `DocumentModule`. It is a private provider (not exported) that `DocumentService` injects for all document DB operations. The `DocumentData` type is defined in `document/document-db.types.ts`.

New code that only needs document DB operations should inject `DocumentService` (which exposes `findDocument`, `findAllDocuments`, `updateDocumentFields`, `findOcrResult`, etc.) instead of `DatabaseService`.

## Group Module DB Service

`GroupDbService` lives at `apps/backend-services/src/group/group-db.service.ts` and is scoped to the `GroupModule`. It is a private provider (not exported) that `GroupService` injects for all group-related DB operations. `GroupService` itself is the public interface for callers outside the module.

`GroupDbService` wraps all Prisma operations for the `Group`, `UserGroup`, and `GroupMembershipRequest` models, including:
- **Group CRUD**: `findGroup`, `findActiveGroup`, `findGroupByName`, `findActiveGroupByNameExcluding`, `findAllGroups`, `createGroup`, `updateGroupData`, `softDeleteGroup`
- **UserGroup**: `findUsersGroups`, `findUserAdminMemberships`, `findUserGroupsWithGroup`, `findUserGroupsInGroups`, `isUserInGroup`, `findUserGroupMembership`, `upsertUserGroup`, `deleteUserGroup`, `findGroupMembersWithUser`, `isUserSystemAdmin`
- **GroupMembershipRequest**: `findMembershipRequest`, `findPendingMembershipRequest`, `createMembershipRequest`, `updateMembershipRequest`, `approveRequestTransaction`, `findGroupMembershipRequests`, `findUserMembershipRequests`

`GroupModule` imports `DatabaseModule` so that `PrismaService` is available for injection into `GroupDbService`. `GroupService` no longer references `DatabaseService` or Prisma directly.

## Usage

- **Existing callers** (OCR service, HITL, benchmark) continue to use `DatabaseService` for document operations and do not need to change.
- **New code** in the document module should inject `DocumentService` (backed by `DocumentDbService`).
- **Direct Prisma access** (e.g. `TrainingJob`, `TrainedModel`) is via `DatabaseService.prisma` or by injecting `PrismaService` and using `prismaService.prisma`.

## Module

`DatabaseModule` provides and exports: `PrismaService`, `LabelingDocumentDbService`, `LabelingProjectDbService`, `ReviewDbService`, `DatabaseService`.

`DocumentModule` provides (not exported): `DocumentDbService`. Imports `DatabaseModule` for `PrismaService`.

# User Model

## Overview
The `User` model tracks users separately in its own table. This enables referencing users via foreign keys in other tables, such as `created_by`, `updated_by`, and `user_id`.

## Fields
- `id`: Unique identifier for the user (UUID).
- `email`: Unique email address for the user.
- `roles`: Array of roles assigned to the user.
- `last_login_at`: Timestamp of the user's last login.
- `created_at`: Timestamp when the user was created.
- `updated_at`: Timestamp when the user was last updated.

## Usage
- The `ApiKey` table now references `User` via `user_id` foreign key.
- Other tables can reference `User` for audit fields (e.g., `created_by`, `updated_by`).

## Migration Notes
- `user_email` and `roles` have been removed from `ApiKey`.
- Use `user_id` to link API keys to users.

## Example
```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  roles         String[]
  last_login_at DateTime?
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt
}
```

## Next Steps
- Update backend code to use the new `User` model.
- Update tests to reflect schema changes.
- Run migrations and regenerate Prisma client.
