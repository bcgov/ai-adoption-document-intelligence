# US-052: Shared validator runs `validateActivityParameters` on `pollUntil` nodes

**As a** workflow author authoring a `pollUntil` block,
**I want** the polled activity's parameters to be catalog-validated at
save time, not only at runtime,
**So that** the same drift class that US-020 closed for activity nodes
is also impossible to introduce on pollUntil nodes.

## Acceptance Criteria

- [ ] **Scenario 1**: pollUntil parameters are validated
    - **Given** a graph with a pollUntil node whose `activityType` has a catalog entry, and whose `parameters` violate the catalog Zod schema
    - **When** `validateGraphConfig` runs
    - **Then** an error appears at `nodes.<id>.parameters.<field>` with severity error

- [ ] **Scenario 2**: pollUntil parameter validation runs after the existing activity-type-registered check
    - **Given** the existing branch around `validator.ts` lines 326–335
    - **When** updated
    - **Then** if `activityType` is unregistered, the registration error is surfaced as-is and parameter validation is skipped (matches the activity-node behaviour)

- [ ] **Scenario 3**: Pre-existing pollUntil-using templates still pass
    - **Given** any template currently in `docs-md/graph-workflows/templates/` that uses `pollUntil`
    - **When** validated
    - **Then** zero new errors are raised (the change is catalog-driven and the templates are already correct)

- [ ] **Scenario 4**: Backend + temporal validators inherit the change
    - **Given** both apps consume `validateGraphConfig`
    - **When** this lands
    - **Then** no app-side change is required

## Priority
- [x] High (Must Have)

## Files modified

- `packages/graph-workflow/src/validator/validator.ts` — extend the pollUntil branch.
- `packages/graph-workflow/src/validator/validator.test.ts` — add scenarios.
