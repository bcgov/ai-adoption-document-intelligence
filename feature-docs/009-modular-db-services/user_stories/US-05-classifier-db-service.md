# US-05: Create ClassifierDbService in the Azure Module

**As a** backend developer,
**I want to** create a new `ClassifierDbService` inside the `azure` module that extracts classifier-model queries currently inline in `DatabaseService`,
**So that** classifier database operations belong to the module that owns them.

## Acceptance Criteria
- [x] **Scenario 1**: ClassifierDbService is created at the correct path
    - **Given** the azure module at `apps/backend-services/src/azure/`
    - **When** the implementation is complete
    - **Then** `ClassifierDbService` exists at `apps/backend-services/src/azure/classifier-db.service.ts`

- [x] **Scenario 2**: ClassifierDbService exposes the required methods with correct naming
    - **Given** the new `ClassifierDbService`
    - **When** reviewing its public API
    - **Then** it provides exactly: `createClassifierModel`, `updateClassifierModel`, `findClassifierModel`, `findAllClassifierModelsForGroups`

- [x] **Scenario 3**: Method names follow the CRUD naming convention
    - **Given** the old method names in `DatabaseService` (`getClassifierModel`, `getClassifierModelsForGroups`)
    - **When** the new `ClassifierDbService` is created
    - **Then** `getClassifierModel` is renamed to `findClassifierModel` and `getClassifierModelsForGroups` is renamed to `findAllClassifierModelsForGroups`

- [x] **Scenario 4**: ClassifierDbService is registered as a provider but not exported
    - **Given** `AzureModule`
    - **When** reviewing its `@Module` decorator
    - **Then** `ClassifierDbService` is listed in `providers` and is NOT listed in `exports`

- [x] **Scenario 5**: ClassifierDbService uses PrismaService via private getter
    - **Given** the new `ClassifierDbService`
    - **When** reviewing how it accesses Prisma
    - **Then** it uses `private get prisma()` to access the injected `PrismaService`

- [x] **Scenario 6**: ClassifierService or AzureService injects ClassifierDbService
    - **Given** `ClassifierService` or `AzureService`
    - **When** reviewing its constructor
    - **Then** it injects `ClassifierDbService` and exposes necessary accessor methods for other modules

- [x] **Scenario 7**: Inline queries are removed from DatabaseService
    - **Given** the original `DatabaseService`
    - **When** the migration is complete
    - **Then** classifier-model methods are no longer implemented inline in `DatabaseService`

- [x] **Scenario 8**: Unit tests exist for ClassifierDbService
    - **Given** the new `ClassifierDbService`
    - **When** running `npx jest classifier-db.service`
    - **Then** all tests pass with mocked `PrismaService`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This is a new `ClassifierDbService`; the methods are extracted from inline code in `DatabaseService`.
- `PrismaService` is globally available via `@Global()` on `DatabaseModule`; no explicit import of `DatabaseModule` is needed in `AzureModule`.
- Any module that currently calls `DatabaseService.getClassifierModel` (or similar) must be updated to call the azure module's service instead.
