# Database services (backend-services)

The database layer in `apps/backend-services/src/database/` is split into focused services for maintainability.

## Layout

| File | Service | Responsibility |
|------|---------|----------------|
| `database.types.ts` | — | Shared types: `DocumentData`, `LabelingProjectData`, `LabeledDocumentData`, `LabelingDocumentData`, `ReviewSessionData` |
| `prisma.service.ts` | `PrismaService` | Owns the Prisma client (connection, config). Exposes `prisma: PrismaClient`. |
| `document-db.service.ts` | `DocumentDbService` | Document CRUD and OCR results: `createDocument`, `findDocument`, `findAllDocuments`, `updateDocument`, `findOcrResult`, `upsertOcrResult` |
| `labeling-document-db.service.ts` | `LabelingDocumentDbService` | Labeling document CRUD: `createLabelingDocument`, `findLabelingDocument`, `updateLabelingDocument` |
| `labeling-project-db.service.ts` | `LabelingProjectDbService` | Labeling projects, field definitions, labeled documents, document labels |
| `review-db.service.ts` | `ReviewDbService` | Review sessions, field corrections, review queue, review analytics |
| `database.service.ts` | `DatabaseService` | Facade that delegates to the above services and re-exports types. Exposes `prisma` getter for code that needs direct Prisma access (e.g. training). |

## Usage

- **Most callers** should keep using `DatabaseService` (same API as before).
- **New code** can inject the specific service (`DocumentDbService`, `LabelingProjectDbService`, etc.) when only one area is needed.
- **Direct Prisma access** (e.g. `TrainingJob`, `TrainedModel`) is via `DatabaseService.prisma` or by injecting `PrismaService` and using `prismaService.prisma`.

## Module

`DatabaseModule` provides and exports: `PrismaService`, `DocumentDbService`, `LabelingDocumentDbService`, `LabelingProjectDbService`, `ReviewDbService`, `DatabaseService`.

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
