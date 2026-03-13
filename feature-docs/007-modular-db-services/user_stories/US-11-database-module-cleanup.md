# US-11: Clean Up DatabaseModule After Full Migration

**As a** backend developer,
**I want to** delete `DatabaseService` and all sub-db-service files from the `database` module and reduce `DatabaseModule` to only providing `PrismaService`,
**So that** the architecture is fully decoupled and there is no residual monolithic façade.

## Acceptance Criteria
- [ ] **Scenario 1**: DatabaseService is deleted
    - **Given** all consumers have been migrated (US-01 through US-10)
    - **When** the cleanup is complete
    - **Then** `apps/backend-services/src/database/database.service.ts` no longer exists

- [ ] **Scenario 2**: Sub-db-service files are deleted from the database module
    - **Given** the `database` module folder
    - **When** the cleanup is complete
    - **Then** `DocumentDbService`, `LabelingDocumentDbService`, `LabelingProjectDbService`, and `ReviewDbService` files no longer exist inside `apps/backend-services/src/database/`

- [ ] **Scenario 3**: database.types.ts is deleted
    - **Given** all types have been moved to their respective module's types files
    - **When** the cleanup is complete
    - **Then** `apps/backend-services/src/database/database.types.ts` no longer exists

- [ ] **Scenario 4**: DatabaseModule retains only PrismaService
    - **Given** `DatabaseModule`
    - **When** reviewing its `@Module` decorator
    - **Then** `PrismaService` is the only item in both `providers` and `exports`, and `@Global()` is still applied

- [ ] **Scenario 5**: Only AppModule imports DatabaseModule
    - **Given** all module files in the application
    - **When** searching for imports of `DatabaseModule`
    - **Then** only `AppModule` imports `DatabaseModule`; all other modules that previously imported it solely for `PrismaService` have had that import removed

- [ ] **Scenario 6**: Application builds and starts without errors
    - **Given** the cleaned-up codebase
    - **When** running `npm run build`
    - **Then** the build completes with no TypeScript or NestJS errors

- [ ] **Scenario 7**: All tests pass after cleanup
    - **Given** the cleaned-up codebase
    - **When** running the full test suite
    - **Then** all tests pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This story must only be executed after US-01, US-02, US-03, US-04, US-05, US-06, US-08, US-09, and US-10 are all complete.
- Before deleting `DatabaseService`, verify that no file in the codebase still imports from it (including the `get prisma()` getter).
- `database.types.ts` can only be deleted after all types have been moved to their respective module types files.
