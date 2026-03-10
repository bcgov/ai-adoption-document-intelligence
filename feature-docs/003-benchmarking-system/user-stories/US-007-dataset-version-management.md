# US-007: Dataset Version Management

**As a** developer,
**I want to** create, publish, archive, and query dataset versions,
**So that** datasets can be versioned with immutable snapshots pinned to specific Git revisions.

## Acceptance Criteria
- [ ] **Scenario 1**: Create a new dataset version
    - **Given** a dataset with uploaded files exists
    - **When** `POST /api/benchmark/datasets/:id/versions` is called with version label and ground truth schema
    - **Then** the service generates/validates the manifest, runs `dvc add`, commits to Git, runs `dvc push`, and creates a DatasetVersion record with status `draft`, the Git commit SHA as `gitRevision`, and the computed `documentCount`

- [ ] **Scenario 2**: Publish a dataset version
    - **Given** a DatasetVersion exists with status `draft`
    - **When** the publish action is invoked on the version
    - **Then** the status transitions to `published`, `publishedAt` is set to the current timestamp, and an audit log entry is recorded with action `version_published`

- [ ] **Scenario 3**: Archive a dataset version
    - **Given** a DatasetVersion exists with status `published`
    - **When** the archive action is invoked on the version
    - **Then** the status transitions to `archived`

- [ ] **Scenario 4**: List versions for a dataset
    - **Given** a dataset with multiple versions exists
    - **When** `GET /api/benchmark/datasets/:id/versions` is called
    - **Then** a list of versions is returned with version label, status, documentCount, gitRevision, publishedAt, and createdAt

- [ ] **Scenario 5**: Get version details
    - **Given** a DatasetVersion exists
    - **When** `GET /api/benchmark/datasets/:id/versions/:versionId` is called
    - **Then** full version details are returned including groundTruthSchema, manifestPath, split list, and all metadata

- [ ] **Scenario 6**: Version not found returns 404
    - **Given** no version exists with the provided versionId for the given dataset
    - **When** `GET /api/benchmark/datasets/:id/versions/:versionId` is called
    - **Then** a 404 response is returned

- [ ] **Scenario 7**: Cannot publish an already published version
    - **Given** a DatasetVersion with status `published`
    - **When** a publish action is attempted
    - **Then** a 400 response is returned indicating the version is already published

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Extends: `apps/backend-services/src/benchmark/dataset.service.ts`
- Controller endpoints added to: `apps/backend-services/src/benchmark/dataset.controller.ts`
- DVC automation flow per Section 3.2: write files -> dvc add -> git commit -> dvc push -> record gitRevision
- Version label can be semantic (e.g., "1.0.0") or incremental
- See Requirements Section 2.2 (DatasetVersion model), Section 3.2 (Dataset Upload & DVC Automation)
- Tests: extend `apps/backend-services/src/benchmark/dataset.service.spec.ts`
