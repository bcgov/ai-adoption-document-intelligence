# US-011: Persist new workflow version from workflow modification utility

**As a** pipeline or activity,
**I want to** persist the output of the workflow modification utility as a new workflow version (e.g. new Workflow record or new version),
**So that** the candidate workflow can be referenced by id for benchmark runs and for replacement.

## Acceptance Criteria
- [ ] **Scenario 1**: New version created without overwriting
    - **Given** a new graph config from the workflow modification utility (US-010)
    - **When** persistence is invoked
    - **Then** a new Workflow record (or new version) is created; the previous workflow record is not overwritten in place

- [ ] **Scenario 2**: Workflow id returned
    - **Given** the new workflow is persisted
    - **When** the caller needs to reference it
    - **Then** the workflow id (and optionally version) is returned so it can be used as a workflow override for benchmark runs or as the new active workflow after replacement

- [ ] **Scenario 3**: Optional from utility
    - **Given** the workflow modification utility (US-010)
    - **When** the utility is designed
    - **Then** persistence may be a separate step or an optional part of the utility; this story covers the persistence behavior

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Step 4; requirements Section 6–7. Workflow model: Prisma Workflow (id, name, config, version, ...). “New version” = new row or version field; no in-place overwrite.
