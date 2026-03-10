# US-033: Split Management UI

**As a** user,
**I want to** create, edit, and freeze splits on dataset versions,
**So that** I can define which subset of samples to use for benchmarking with support for stratification and golden regression sets.

## Acceptance Criteria
- [ ] **Scenario 1**: Create a split
    - **Given** a dataset version with samples
    - **When** `POST /api/benchmark/datasets/:id/versions/:versionId/splits` is called with name, type, and sampleIds
    - **Then** a Split record is created with the specified name, type (train/val/test/golden), and list of sample IDs

- [ ] **Scenario 2**: List splits for a version
    - **Given** a dataset version with splits defined
    - **When** `GET /api/benchmark/datasets/:id/versions/:versionId/splits` is called
    - **Then** a list of splits is returned with name, type, sample count, frozen status, and creation date

- [ ] **Scenario 3**: Update a split
    - **Given** an unfrozen split exists
    - **When** `PUT /api/benchmark/datasets/:id/versions/:versionId/splits/:splitId` is called with updated sampleIds
    - **Then** the split is updated with the new sample list

- [ ] **Scenario 4**: Cannot update a frozen split
    - **Given** a split with `frozen=true`
    - **When** an update is attempted
    - **Then** a 400 response is returned indicating the split is frozen and cannot be modified

- [ ] **Scenario 5**: Stratification by metadata fields
    - **Given** samples have metadata fields (e.g., docType, language)
    - **When** a split is created with `stratificationRules` specifying a field
    - **Then** samples are distributed across the split such that each metadata value is proportionally represented

- [ ] **Scenario 6**: Freeze golden regression set
    - **Given** an unfrozen split of type `golden`
    - **When** the freeze action is invoked
    - **Then** the split's `frozen` flag is set to `true` and can no longer be modified

- [ ] **Scenario 7**: Split management UI within dataset version view
    - **Given** the user is viewing a dataset version detail
    - **When** the splits section is displayed
    - **Then** the user can see existing splits, create new splits via a form (name, type, sample selection), and freeze golden splits

- [ ] **Scenario 8**: Sample selection interface
    - **Given** the split creation form
    - **When** the user is selecting samples
    - **Then** a multi-select interface allows choosing samples by ID, with search and filtering by metadata

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Endpoints: `POST /api/benchmark/datasets/:id/versions/:versionId/splits`, `GET .../splits`, `PUT .../splits/:splitId`
- Split type enum: `train`, `val`, `test`, `golden`
- Stratification algorithm: round-robin distribution by metadata field values
- See Requirements Section 3.8 (Split Management), Section 11.1 (Dataset APIs)
- Backend files: extend `apps/backend-services/src/benchmark/dataset.service.ts`, `dataset.controller.ts`
- Frontend: `apps/frontend/src/components/benchmarking/SplitManagement.tsx`
- Tests: extend `apps/backend-services/src/benchmark/dataset.service.spec.ts`
