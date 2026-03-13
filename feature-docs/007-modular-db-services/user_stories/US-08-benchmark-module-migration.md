# US-08: Migrate Benchmark Module Away from DatabaseService

**As a** backend developer,
**I want to** update the `benchmark` module to call the relevant module services instead of `DatabaseService`,
**So that** the benchmark module no longer has a direct dependency on the monolithic `DatabaseService`.

## Acceptance Criteria
- [ ] **Scenario 1**: Benchmark module no longer injects DatabaseService
    - **Given** all classes in the `benchmark` module
    - **When** reviewing their constructors
    - **Then** none of them inject `DatabaseService`

- [ ] **Scenario 2**: Benchmark module uses the correct module services
    - **Given** the benchmark module's database operations
    - **When** reviewing which services are called
    - **Then** each operation is delegated to the appropriate module's primary service (e.g., `DocumentService`, `GroupService`)

- [ ] **Scenario 3**: Benchmark module does not inject any db-services from other modules
    - **Given** all classes in the `benchmark` module
    - **When** reviewing their constructors
    - **Then** none of them inject a db-service from another module (e.g., `DocumentDbService`, `GroupDbService`)

- [ ] **Scenario 4**: All existing benchmark tests still pass
    - **Given** the updated benchmark module
    - **When** running `npx jest benchmark`
    - **Then** all tests pass without modification to test behaviour

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The `benchmark` module currently injects `DatabaseService`; all usages must be identified and replaced before `DatabaseService` can be deleted.
- This story depends on US-01 through US-06 being complete so that the target services exist.
- Watch for circular dependency issues if `benchmark` imports a module that already imports `benchmark`.
