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
