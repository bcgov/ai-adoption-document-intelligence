# US-01: Move DocumentDbService into the Document Module

**As a** backend developer,
**I want to** move `DocumentDbService` from the `database` module into the `document` module,
**So that** document-related database operations are colocated with their owning module and the `document` module is self-contained.

## Acceptance Criteria
- [ ] **Scenario 1**: DocumentDbService lives in the document module
    - **Given** the document module exists at `apps/backend-services/src/document/`
    - **When** the migration is complete
    - **Then** `DocumentDbService` exists at `apps/backend-services/src/document/document-db.service.ts` and is removed from the `database` module

- [ ] **Scenario 2**: DocumentDbService only exposes the required methods
    - **Given** the new `DocumentDbService`
    - **When** reviewing its public API
    - **Then** it provides exactly: `createDocument`, `findDocument`, `findAllDocuments`, `updateDocument`, `deleteDocument`, `findOcrResult`, `upsertOcrResult`

- [ ] **Scenario 3**: DocumentDbService injects PrismaService via private getter
    - **Given** the new `DocumentDbService`
    - **When** reviewing how it accesses Prisma
    - **Then** it uses `private get prisma()` to access the injected `PrismaService` and does not expose the prisma client directly

- [ ] **Scenario 4**: DocumentDbService is registered as a provider but not exported
    - **Given** `DocumentModule`
    - **When** reviewing its `@Module` decorator
    - **Then** `DocumentDbService` is listed in `providers` and is NOT listed in `exports`

- [ ] **Scenario 5**: DocumentService injects DocumentDbService
    - **Given** `DocumentService`
    - **When** reviewing its constructor
    - **Then** it injects `DocumentDbService` and uses it for all database operations

- [ ] **Scenario 6**: Types are colocated with the db-service
    - **Given** the document module folder
    - **When** reviewing its files
    - **Then** `DocumentData` type is defined in `apps/backend-services/src/document/document-db.types.ts`

- [ ] **Scenario 7**: Unit tests exist for DocumentDbService
    - **Given** the new `DocumentDbService`
    - **When** running `npx jest document-db.service`
    - **Then** all tests pass with mocked `PrismaService`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- `DocumentDbService` currently lives in `apps/backend-services/src/database/`; it handles the `Document` and `OcrResult` Prisma models.
- `PrismaService` is globally available via `@Global()` on `DatabaseModule`; no explicit import of `DatabaseModule` is needed in `DocumentModule`.
- Existing callers of `DocumentDbService` that go through `DatabaseService` must be updated to use `DocumentService` instead.
- All existing unit tests for `DocumentDbService` must be updated to reflect the new import path.
