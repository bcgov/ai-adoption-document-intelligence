# US-015: Active workflow pointer (designate current production workflow)

**As a** system operator,
**I want to** have a single notion of "current" production workflow (e.g. a designated workflow id or a default workflow id used at upload time when workflow_config_id is not provided),
**So that** replacement can update "the" active workflow and new documents can resolve to the correct config.

## Acceptance Criteria
- [ ] **Scenario 1**: Current workflow resolvable
    - **Given** the system is configured
    - **When** a consumer needs the current production workflow (e.g. for upload default or for replacement logic)
    - **Then** it can resolve the active workflow (e.g. by workflow id from config/settings or by name + active version)

- [ ] **Scenario 2**: Documents resolve to active workflow
    - **Given** a document is uploaded with or without an explicit workflow_config_id
    - **When** the runtime resolves which workflow to use
    - **Then** it uses the document's workflow_config_id if present, or the designated default/active workflow id so that id resolves to the active workflow

- [ ] **Scenario 3**: No overwrite of previous version
    - **Given** workflow versioning
    - **When** the "current" workflow is updated (see US-016)
    - **Then** the update is by changing the active pointer to a new workflow id/version, not by overwriting the previous workflow record in place

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Feature 005 Step 1. Implementation may use existing Workflow model with a separate "active" pointer (e.g. default workflow id in config/settings) or workflow name + version convention.
