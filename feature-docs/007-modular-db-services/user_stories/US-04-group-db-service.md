# US-04: Create GroupDbService in the Group Module

**As a** backend developer,
**I want to** create a new `GroupDbService` inside the `group` module that extracts group/user-group queries currently inline in `DatabaseService`,
**So that** group-membership database operations belong to the module that owns them.

## Acceptance Criteria
- [ ] **Scenario 1**: GroupDbService is created at the correct path
    - **Given** the group module at `apps/backend-services/src/group/`
    - **When** the implementation is complete
    - **Then** `GroupDbService` exists at `apps/backend-services/src/group/group-db.service.ts`

- [ ] **Scenario 2**: GroupDbService exposes the required methods
    - **Given** the new `GroupDbService`
    - **When** reviewing its public API
    - **Then** it provides exactly: `findUsersGroups`, `isUserInGroup`, `isUserSystemAdmin`

- [ ] **Scenario 3**: GroupDbService is registered as a provider but not exported
    - **Given** `GroupModule`
    - **When** reviewing its `@Module` decorator
    - **Then** `GroupDbService` is listed in `providers` and is NOT listed in `exports`

- [ ] **Scenario 4**: GroupDbService uses PrismaService via private getter
    - **Given** the new `GroupDbService`
    - **When** reviewing how it accesses Prisma
    - **Then** it uses `private get prisma()` to access the injected `PrismaService`

- [ ] **Scenario 5**: GroupService exposes membership check methods publicly
    - **Given** `GroupService`
    - **When** another module calls it for membership checks
    - **Then** `GroupService` exposes `isUserInGroup`, `isUserSystemAdmin`, and `findUsersGroups` as public methods delegating to `GroupDbService`

- [ ] **Scenario 6**: Inline queries are removed from DatabaseService
    - **Given** the original `DatabaseService`
    - **When** the migration is complete
    - **Then** `getUsersGroups`, `isUserInGroup`, and `isUserSystemAdmin` are no longer implemented inline in `DatabaseService`

- [ ] **Scenario 7**: Unit tests exist for GroupDbService
    - **Given** the new `GroupDbService`
    - **When** running `npx jest group-db.service`
    - **Then** all tests pass with mocked `PrismaService`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This is a new `GroupDbService`; the methods are extracted from inline code in `DatabaseService`.
- `PrismaService` is globally available via `@Global()` on `DatabaseModule`; no explicit import of `DatabaseModule` is needed in `GroupModule`.
- Any module that currently calls `DatabaseService.isUserInGroup` (or similar) must be updated to call `GroupService` instead.
- CRUD naming convention: `getUsersGroups` → `findUsersGroups`.
