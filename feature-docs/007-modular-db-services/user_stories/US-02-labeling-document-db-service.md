# US-02: Move LabelingDocumentDbService into the Labeling Module

**As a** backend developer,
**I want to** move `LabelingDocumentDbService` from the `database` module into the `labeling` module,
**So that** labeling-document database operations are colocated with their owning module.

## Acceptance Criteria
- [ ] **Scenario 1**: LabelingDocumentDbService lives in the labeling module
    - **Given** the labeling module exists at `apps/backend-services/src/labeling/`
    - **When** the migration is complete
    - **Then** `LabelingDocumentDbService` exists at `apps/backend-services/src/labeling/labeling-document-db.service.ts` and is removed from the `database` module

- [ ] **Scenario 2**: LabelingDocumentDbService exposes only the required methods
    - **Given** the new `LabelingDocumentDbService`
    - **When** reviewing its public API
    - **Then** it provides exactly: `createLabelingDocument`, `findLabelingDocument`, `updateLabelingDocument`

- [ ] **Scenario 3**: LabelingDocumentDbService is registered as a provider but not exported
    - **Given** `LabelingModule`
    - **When** reviewing its `@Module` decorator
    - **Then** `LabelingDocumentDbService` is listed in `providers` and is NOT listed in `exports`

- [ ] **Scenario 4**: LabelingDocumentDbService uses PrismaService via private getter
    - **Given** the new `LabelingDocumentDbService`
    - **When** reviewing how it accesses Prisma
    - **Then** it uses `private get prisma()` to access the injected `PrismaService`

- [ ] **Scenario 5**: Types are colocated with the db-service
    - **Given** the labeling module folder
    - **When** reviewing its files
    - **Then** `LabelingDocumentData` type is defined in `apps/backend-services/src/labeling/labeling-document-db.types.ts`

- [ ] **Scenario 6**: Unit tests exist for LabelingDocumentDbService
    - **Given** the new `LabelingDocumentDbService`
    - **When** running `npx jest labeling-document-db.service`
    - **Then** all tests pass with mocked `PrismaService`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- `LabelingDocumentDbService` currently lives in `apps/backend-services/src/database/`; it handles the `LabelingDocument` Prisma model.
- `PrismaService` is globally available via `@Global()` on `DatabaseModule`; no explicit import of `DatabaseModule` is needed in `LabelingModule`.
- Existing tests for `LabelingDocumentDbService` must be updated to reflect the new import path.
