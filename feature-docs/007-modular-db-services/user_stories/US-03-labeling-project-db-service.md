# US-03: Move LabelingProjectDbService into the Labeling Module

**As a** backend developer,
**I want to** move `LabelingProjectDbService` from the `database` module into the `labeling` module,
**So that** labeling-project database operations are colocated with their owning module.

## Acceptance Criteria
- [ ] **Scenario 1**: LabelingProjectDbService lives in the labeling module
    - **Given** the labeling module exists at `apps/backend-services/src/labeling/`
    - **When** the migration is complete
    - **Then** `LabelingProjectDbService` exists at `apps/backend-services/src/labeling/labeling-project-db.service.ts` and is removed from the `database` module

- [ ] **Scenario 2**: LabelingProjectDbService exposes only the required methods
    - **Given** the new `LabelingProjectDbService`
    - **When** reviewing its public API
    - **Then** it provides exactly: `createLabelingProject`, `findLabelingProject`, `findAllLabelingProjects`, `updateLabelingProject`, `deleteLabelingProject`, `createFieldDefinition`, `updateFieldDefinition`, `deleteFieldDefinition`, `addDocumentToProject`, `findLabeledDocument`, `findLabeledDocuments`, `removeDocumentFromProject`, `updateLabeledDocumentStatus`, `saveDocumentLabels`, `deleteDocumentLabel`

- [ ] **Scenario 3**: LabelingProjectDbService is registered as a provider but not exported
    - **Given** `LabelingModule`
    - **When** reviewing its `@Module` decorator
    - **Then** `LabelingProjectDbService` is listed in `providers` and is NOT listed in `exports`

- [ ] **Scenario 4**: LabelingProjectDbService uses PrismaService via private getter
    - **Given** the new `LabelingProjectDbService`
    - **When** reviewing how it accesses Prisma
    - **Then** it uses `private get prisma()` to access the injected `PrismaService`

- [ ] **Scenario 5**: Types are colocated with the db-service
    - **Given** the labeling module folder
    - **When** reviewing its files
    - **Then** `LabelingProjectData` and `LabeledDocumentData` types are defined in `apps/backend-services/src/labeling/labeling-project-db.types.ts`

- [ ] **Scenario 6**: Unit tests exist for LabelingProjectDbService
    - **Given** the new `LabelingProjectDbService`
    - **When** running `npx jest labeling-project-db.service`
    - **Then** all tests pass with mocked `PrismaService`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- `LabelingProjectDbService` currently lives in `apps/backend-services/src/database/`; it handles `LabelingProject`, `FieldDefinition`, `LabeledDocument`, and label-related Prisma models.
- `PrismaService` is globally available via `@Global()` on `DatabaseModule`; no explicit import of `DatabaseModule` is needed in `LabelingModule`.
- Existing tests for `LabelingProjectDbService` must be updated to reflect the new import path.
- Both `LabelingDocumentDbService` (US-02) and `LabelingProjectDbService` live in the same module; they may be implemented together.
