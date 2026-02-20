# US-032: Dataset Quality Checks & Validation

**As a** user,
**I want to** validate a dataset version for quality issues before publishing it,
**So that** I can catch schema violations, missing ground truth, duplicates, and corrupted files before they affect benchmarks.

## Acceptance Criteria
- [ ] **Scenario 1**: Validate endpoint exists
    - **Given** a dataset version exists
    - **When** `POST /api/benchmark/datasets/:id/versions/:versionId/validate` is called
    - **Then** the validation runs and returns a structured validation report

- [ ] **Scenario 2**: Schema validation against declared ground truth schema
    - **Given** a dataset version has a `groundTruthSchema` defined
    - **When** validation runs
    - **Then** each ground truth file is validated against the schema, and violations are reported with sample ID, file path, and specific schema errors

- [ ] **Scenario 3**: Missing ground truth detection
    - **Given** a dataset version with some samples missing ground truth files
    - **When** validation runs
    - **Then** samples with input files but no corresponding ground truth files are identified and reported

- [ ] **Scenario 4**: Duplicate detection
    - **Given** a dataset version with duplicate samples
    - **When** validation runs
    - **Then** duplicates are detected by content hash and/or metadata, and duplicate groups are reported with sample IDs

- [ ] **Scenario 5**: Corruption checks
    - **Given** a dataset version with files that may be corrupted
    - **When** validation runs
    - **Then** file integrity checks are performed (file readability, format validation for JSON files, image header validation), and corrupted files are reported

- [ ] **Scenario 6**: Optional sampling preview
    - **Given** a dataset version with many samples
    - **When** validation is called with a `sampleSize` parameter
    - **Then** only N random samples are validated (for faster preview), and the report indicates it was a sampled validation

- [ ] **Scenario 7**: Validation results UI
    - **Given** the validation endpoint returns results
    - **When** the user views the validation results in the UI
    - **Then** a structured report is displayed with pass/fail status, issue counts by category, and a detailed list of issues with sample references

- [ ] **Scenario 8**: Overall pass/fail determination
    - **Given** validation has completed
    - **When** the results are evaluated
    - **Then** an overall `valid` boolean is returned: `true` if no errors (warnings allowed), `false` if any errors are found

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Endpoint: `POST /api/benchmark/datasets/:id/versions/:versionId/validate`
- Validation runs on the backend, reading files from the dataset repository via DvcService
- JSON schema validation can use `ajv` or similar library
- Image corruption checks validate file headers (magic bytes)
- See Requirements Section 3.7 (Data Quality Checks)
- Files: extend `apps/backend-services/src/benchmark/dataset.service.ts`, `dataset.controller.ts`
- Frontend: `apps/frontend/src/components/benchmarking/ValidationReport.tsx`
- Tests: extend `apps/backend-services/src/benchmark/dataset.service.spec.ts`
