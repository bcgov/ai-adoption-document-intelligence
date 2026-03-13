# US-10: Migrate Upload Module Away from DatabaseService

**As a** backend developer,
**I want to** update the `upload` module to call the relevant module services instead of `DatabaseService`,
**So that** the upload module no longer has a direct dependency on the monolithic `DatabaseService`.

## Acceptance Criteria
- [ ] **Scenario 1**: Upload module no longer injects DatabaseService
    - **Given** all classes in the `upload` module
    - **When** reviewing their constructors
    - **Then** none of them inject `DatabaseService`

- [ ] **Scenario 2**: Upload module uses the correct module services
    - **Given** the upload module's database operations
    - **When** reviewing which services are called
    - **Then** each operation is delegated to the appropriate module's primary service (e.g., `DocumentService`)

- [ ] **Scenario 3**: Upload module does not inject any db-services from other modules
    - **Given** all classes in the `upload` module
    - **When** reviewing their constructors
    - **Then** none of them inject a db-service from another module

- [ ] **Scenario 4**: All existing upload tests still pass
    - **Given** the updated upload module
    - **When** running `npx jest upload`
    - **Then** all tests pass without modification to test behaviour

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The `upload` module currently injects `DatabaseService`; all usages must be identified and replaced before `DatabaseService` can be deleted.
- This story depends on US-01 through US-06 being complete so that the target services exist.
- Watch for circular dependency issues if `upload` imports a module that already imports `upload`.
