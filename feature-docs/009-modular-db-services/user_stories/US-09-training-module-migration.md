# US-09: Migrate Training Module Away from DatabaseService

**As a** backend developer,
**I want to** update the `training` module to call the relevant module services instead of `DatabaseService`,
**So that** the training module no longer has a direct dependency on the monolithic `DatabaseService`.

## Acceptance Criteria
- [x] **Scenario 1**: Training module no longer injects DatabaseService
    - **Given** all classes in the `training` module
    - **When** reviewing their constructors
    - **Then** none of them inject `DatabaseService`

- [x] **Scenario 2**: Training module uses the correct module services
    - **Given** the training module's database operations
    - **When** reviewing which services are called
    - **Then** each operation is delegated to the appropriate module's primary service (e.g., `DocumentService`, `LabelingService`)

- [x] **Scenario 3**: Training module does not inject any db-services from other modules
    - **Given** all classes in the `training` module
    - **When** reviewing their constructors
    - **Then** none of them inject a db-service from another module

- [x] **Scenario 4**: All existing training tests still pass
    - **Given** the updated training module
    - **When** running `npx jest training`
    - **Then** all tests pass without modification to test behaviour

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The `training` module currently injects `DatabaseService`; all usages must be identified and replaced before `DatabaseService` can be deleted.
- This story depends on US-01 through US-06 being complete so that the target services exist.
- Watch for circular dependency issues if `training` imports a module that already imports `training`.
