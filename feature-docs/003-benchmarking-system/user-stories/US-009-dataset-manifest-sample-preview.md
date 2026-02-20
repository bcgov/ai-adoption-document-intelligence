# US-009: Dataset Manifest & Sample Preview

**As a** user,
**I want to** browse and preview samples within a dataset version,
**So that** I can verify the dataset contents and ground truth before using it in benchmarks.

## Acceptance Criteria
- [ ] **Scenario 1**: Parse and validate manifest JSON
    - **Given** a dataset version with a manifest file in the repository
    - **When** the manifest is loaded
    - **Then** the manifest is validated against the expected schema: `schemaVersion` (string), `samples` array where each sample has `id` (string), `inputs` (array of `{path, mimeType}`), `groundTruth` (array of `{path, format}`), and `metadata` (object)

- [ ] **Scenario 2**: List samples with pagination
    - **Given** a dataset version with 100 samples
    - **When** `GET /api/benchmark/datasets/:id/versions/:versionId/samples?page=1&limit=20` is called
    - **Then** the first 20 samples are returned with their IDs, input file references, ground truth file references, and metadata, along with pagination info (total count, page, limit)

- [ ] **Scenario 3**: Sample metadata is included in response
    - **Given** samples have metadata fields (docType, pageCount, language, source)
    - **When** samples are listed
    - **Then** each sample includes its full metadata object

- [ ] **Scenario 4**: Input file references include path and mimeType
    - **Given** a sample has input files
    - **When** the sample is returned in the API response
    - **Then** each input file reference includes the relative `path` within the dataset repo and the `mimeType`

- [ ] **Scenario 5**: Ground truth file references include path and format
    - **Given** a sample has ground truth files
    - **When** the sample is returned in the API response
    - **Then** each ground truth file reference includes the relative `path` within the dataset repo and the `format` (json, jsonl, csv, etc.)

- [ ] **Scenario 6**: Invalid manifest returns error
    - **Given** a dataset version with a malformed manifest file
    - **When** the manifest is loaded
    - **Then** a validation error is returned describing the specific schema violations

- [ ] **Scenario 7**: Version not found returns 404
    - **Given** no version exists for the given dataset and version ID
    - **When** `GET /api/benchmark/datasets/:id/versions/:versionId/samples` is called
    - **Then** a 404 response is returned

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Endpoint: `GET /api/benchmark/datasets/:id/versions/:versionId/samples`
- Manifest is loaded from the dataset repository at the pinned gitRevision (via DvcService checkout)
- Manifest format per Section 3.4 of the requirements
- Manifest validation can use a JSON schema validator or manual validation
- See Requirements Section 3.4 (Dataset Manifest Format), Section 3.5 (Example Ground Truth), Section 11.1
- Files: extend `apps/backend-services/src/benchmark/dataset.service.ts` and `dataset.controller.ts`
- Tests: extend `apps/backend-services/src/benchmark/dataset.service.spec.ts`
