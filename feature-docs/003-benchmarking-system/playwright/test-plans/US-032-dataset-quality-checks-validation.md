# Test Plan: US-032 - Dataset Quality Checks & Validation

**Source**: `user-stories/US-032-dataset-quality-checks-validation.md`
**Requirement Section**: Section 3.7 (Data Quality Checks)
**Priority**: Medium (Phase 1.5)

## User Story
**As a** user,
**I want to** validate a dataset version for quality issues before publishing it,
**So that** I can catch schema violations, missing ground truth, duplicates, and corrupted files before they affect benchmarks.

## Acceptance Criteria
- Validate endpoint exists
- Schema validation against declared ground truth schema
- Missing ground truth detection
- Duplicate detection
- Corruption checks
- Optional sampling preview
- Validation results UI
- Overall pass/fail determination

## Test Scenarios

### Scenario 1: Trigger Validation from UI
- **Type**: Happy Path
- **Priority**: High

**Given**: User is viewing a draft dataset version detail page
**When**: User clicks "Validate" button
**Then**:
- POST request to `/api/benchmark/datasets/{id}/versions/{versionId}/validate` is sent
- Loading indicator appears during validation
- Validation results are displayed when complete
- Button shows success/failure state after validation

**Affected Pages**: Dataset version detail page
**Data Requirements**: Draft dataset version
**Prerequisites**: User logged in, dataset version exists

### Scenario 2: Validation Results - All Passed
- **Type**: Happy Path
- **Priority**: High

**Given**: Dataset version with all valid data
**When**: Validation completes successfully
**Then**:
- Overall status: "Valid" with green checkmark
- Summary shows: "0 errors, 0 warnings"
- All check categories show pass status:
  - Schema validation: ✅ Pass
  - Missing ground truth: ✅ Pass
  - Duplicates: ✅ Pass
  - Corruption: ✅ Pass
- "Publish" button is enabled

**Affected Pages**: Dataset version detail page (validation results section)
**Data Requirements**: Valid dataset version
**Prerequisites**: User logged in

### Scenario 3: Validation Results - Schema Violations
- **Type**: Error Case
- **Priority**: High

**Given**: Dataset version with ground truth files that violate schema
**When**: Validation runs and detects schema errors
**Then**:
- Overall status: "Invalid" with red X
- Schema validation section shows:
  - Number of samples with violations
  - Detailed list: sample ID, file path, specific schema errors
  - Expandable details for each error
- Example error: "Sample sample-001, field 'income1': expected number, got string"
- "Publish" button is disabled or shows warning

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset with schema violations
**Prerequisites**: User logged in, dataset with groundTruthSchema defined

### Scenario 4: Missing Ground Truth Detection
- **Type**: Error Case
- **Priority**: High

**Given**: Dataset version with some samples missing ground truth files
**When**: Validation runs
**Then**:
- Missing ground truth section shows:
  - Count of affected samples
  - List of sample IDs without ground truth
  - Warning severity indicator
- User can click to view sample details
- Overall validation fails or shows warning

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset with incomplete ground truth
**Prerequisites**: User logged in

### Scenario 5: Duplicate Detection Results
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Dataset version with duplicate samples (by content hash or metadata)
**When**: Validation runs and detects duplicates
**Then**:
- Duplicate section shows:
  - Number of duplicate groups
  - Each group lists: duplicate sample IDs, similarity metric
  - Option to view/compare duplicates
- Warning level (not blocking publish, but informational)
- User can choose to ignore or fix duplicates

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset with duplicate samples
**Prerequisites**: User logged in

### Scenario 6: Corruption Check Results
- **Type**: Error Case
- **Priority**: High

**Given**: Dataset version with corrupted files (unreadable, invalid format)
**When**: Validation runs corruption checks
**Then**:
- Corruption section shows:
  - Count of corrupted files
  - List: sample ID, file path, corruption type
  - Examples: "Image header invalid", "JSON parse error", "File not readable"
- Overall validation fails
- User is prompted to re-upload affected files

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset with corrupted files
**Prerequisites**: User logged in

### Scenario 7: Sampled Validation
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Large dataset version with 1000+ samples
**When**: User triggers validation with "Quick Validate" option (sample size: 100)
**Then**:
- Validation runs on random 100 samples only
- Results indicate: "Sampled validation (100 of 1000 samples)"
- Warning: "Full validation recommended before publish"
- Validation completes faster
- Option to run full validation is available

**Affected Pages**: Dataset version detail page
**Data Requirements**: Large dataset
**Prerequisites**: User logged in

### Scenario 8: Validation Progress Indicator
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User triggers validation on a dataset
**When**: Validation is running
**Then**:
- Progress bar shows percentage complete
- Current check being performed is indicated (e.g., "Validating schema... 45%")
- User can cancel validation (optional)
- Page remains responsive during validation

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset that takes >5 seconds to validate
**Prerequisites**: User logged in

### Scenario 9: Expand/Collapse Error Details
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Validation results contain multiple errors
**When**: User views the validation results
**Then**:
- Error categories are collapsible
- Each category shows error count in header
- User can expand to see full error list
- Individual errors can be expanded for details
- UI doesn't become overwhelming with many errors

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset with multiple validation errors
**Prerequisites**: User logged in

### Scenario 10: Retry Validation After Fixes
- **Type**: Happy Path
- **Priority**: High

**Given**: Validation failed, user has fixed issues (re-uploaded files)
**When**: User clicks "Re-validate" button
**Then**:
- Previous validation results are cleared
- New validation runs
- Updated results replace old results
- User can see improvements or remaining issues

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset with fixable errors
**Prerequisites**: User logged in

### Scenario 11: Validation History (Optional)
- **Type**: Happy Path
- **Priority**: Low

**Given**: Dataset version has been validated multiple times
**When**: User views validation section
**Then**:
- History shows: timestamp, result (pass/fail), error count
- User can view results from previous validations
- Latest validation is highlighted
- History helps track progress of fixes

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset validated multiple times
**Prerequisites**: User logged in

### Scenario 12: Export Validation Report
- **Type**: Happy Path
- **Priority**: Low

**Given**: Validation has been completed
**When**: User clicks "Export Report" button
**Then**:
- Validation report is downloaded as JSON or CSV
- Report includes: summary, all errors with details, timestamp
- File is named appropriately (e.g., "validation-report-2026-02-15.json")
- Report can be shared with team

**Affected Pages**: Dataset version detail page
**Data Requirements**: Completed validation
**Prerequisites**: User logged in

### Scenario 13: Publish Warning for Invalid Dataset
- **Type**: Edge Case
- **Priority**: High

**Given**: Dataset version has validation errors
**When**: User attempts to click "Publish" button
**Then**:
- Either button is disabled with tooltip explaining why OR
- Warning modal appears: "This version has validation errors. Publish anyway?"
- User must explicitly acknowledge risks
- If forced publish, audit log records the override

**Affected Pages**: Dataset version detail page
**Data Requirements**: Invalid dataset version
**Prerequisites**: User logged in

### Scenario 14: Validation for Dataset Without Schema
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Dataset version has no `groundTruthSchema` defined
**When**: Validation runs
**Then**:
- Schema validation is skipped
- Message indicates: "No schema defined, skipping schema validation"
- Other checks (missing ground truth, corruption) still run
- Overall validation can still pass/fail

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset without schema
**Prerequisites**: User logged in

### Scenario 15: Validation API Error Handling
- **Type**: Error Case
- **Priority**: Medium

**Given**: User triggers validation
**When**: API returns 500 error or times out
**Then**:
- Error notification appears: "Validation failed to complete"
- Technical error details are shown (optional, for debugging)
- User can retry validation
- Previous validation results (if any) are not cleared

**Affected Pages**: Dataset version detail page
**Data Requirements**: Simulated API error
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (validation trigger, results display, pass/fail)
- ✅ Edge cases covered (sampled validation, missing schema, large datasets)
- ✅ Error handling covered (schema violations, corruption, API errors)
- ✅ User actions covered (retry, export, expand/collapse)
- ⚠️ Missing: Performance testing with very large datasets (10,000+ samples)
- ⚠️ Missing: Concurrent validations on same dataset
