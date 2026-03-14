# US-06: Move ReviewDbService into the HITL Module

**As a** backend developer,
**I want to** move `ReviewDbService` from the `database` module into the `hitl` module,
**So that** review session database operations are colocated with their owning module.

## Acceptance Criteria
- [x] **Scenario 1**: ReviewDbService lives in the hitl module
    - **Given** the hitl module exists at `apps/backend-services/src/hitl/`
    - **When** the migration is complete
    - **Then** `ReviewDbService` exists at `apps/backend-services/src/hitl/review-db.service.ts` and is removed from the `database` module

- [x] **Scenario 2**: ReviewDbService exposes only the required methods
    - **Given** the new `ReviewDbService`
    - **When** reviewing its public API
    - **Then** it provides exactly: `createReviewSession`, `findReviewSession`, `findReviewQueue`, `updateReviewSession`, `createFieldCorrection`, `findSessionCorrections`, `getReviewAnalytics`

- [x] **Scenario 3**: ReviewDbService is registered as a provider but not exported
    - **Given** `HitlModule`
    - **When** reviewing its `@Module` decorator
    - **Then** `ReviewDbService` is listed in `providers` and is NOT listed in `exports`

- [x] **Scenario 4**: ReviewDbService uses PrismaService via private getter
    - **Given** the new `ReviewDbService`
    - **When** reviewing how it accesses Prisma
    - **Then** it uses `private get prisma()` to access the injected `PrismaService`

- [x] **Scenario 5**: Types are colocated with the db-service
    - **Given** the hitl module folder
    - **When** reviewing its files
    - **Then** `ReviewSessionData` type is defined in `apps/backend-services/src/hitl/review-db.types.ts`

- [x] **Scenario 6**: Unit tests exist for ReviewDbService
    - **Given** the new `ReviewDbService`
    - **When** running `npx jest review-db.service`
    - **Then** all tests pass with mocked `PrismaService`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- `ReviewDbService` currently lives in `apps/backend-services/src/database/`; it handles `ReviewSession`, `FieldCorrection`, and review analytics.
- `PrismaService` is globally available via `@Global()` on `DatabaseModule`; no explicit import of `DatabaseModule` is needed in `HitlModule`.
- Existing tests for `ReviewDbService` must be updated to reflect the new import path.
