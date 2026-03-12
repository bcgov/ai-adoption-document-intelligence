# Test Plan: US-033 - Split Management UI

**Source**: `user-stories/US-033-split-management-ui.md`
**Requirement Section**: Section 3.8 (Split Management)
**Priority**: Medium (Phase 1.5)

## User Story
**As a** user,
**I want to** create, edit, and freeze splits on dataset versions,
**So that** I can define which subset of samples to use for benchmarking with support for stratification and golden regression sets.

## Acceptance Criteria
- Create a split
- List splits for a version
- Update a split
- Cannot update a frozen split
- Stratification by metadata fields
- Freeze golden regression set
- Split management UI within dataset version view
- Sample selection interface

## Test Scenarios

### Scenario 1: View Splits List
- **Type**: Happy Path
- **Priority**: High

**Given**: Dataset version has multiple splits defined
**When**: User views the dataset version detail page
**Then**:
- Splits section displays table with columns: name, type, sample count, frozen status, creation date
- All splits for the version are listed
- Split types are color-coded or badged (train, val, test, golden)
- "Create Split" button is visible

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset version with 3+ splits
**Prerequisites**: User logged in, splits exist

### Scenario 2: Open Create Split Dialog
- **Type**: Happy Path
- **Priority**: High

**Given**: User is viewing dataset version detail with samples
**When**: User clicks "Create Split" button
**Then**:
- Split creation dialog/form appears
- Form fields include:
  - Name (required text input)
  - Type (dropdown: train, val, test, golden)
  - Sample selection (multi-select interface or manual IDs)
  - Stratification rules (optional section)
- Submit and Cancel buttons are visible

**Affected Pages**: Dataset version detail page (modal)
**Data Requirements**: Dataset version with samples
**Prerequisites**: User logged in

### Scenario 3: Create Split with Manual Sample Selection
- **Type**: Happy Path
- **Priority**: High

**Given**: Create split dialog is open
**When**: User enters name "test-split-001", type "test", and selects 10 samples, then submits
**Then**:
- POST to `/api/benchmark/datasets/{id}/versions/{versionId}/splits` with sampleIds array
- Success notification appears
- Dialog closes
- Split list refreshes showing new split
- New split shows correct sample count (10)

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset with 20+ samples
**Prerequisites**: User logged in

### Scenario 4: Sample Selection Interface
- **Type**: Happy Path
- **Priority**: High

**Given**: Create split form is displayed
**When**: User interacts with sample selection interface
**Then**:
- Multi-select checkbox list or picker is displayed
- Samples shown with: ID, preview thumbnail (if image), metadata
- Search/filter functionality available (by ID, metadata fields)
- Selected count is displayed (e.g., "5 of 100 samples selected")
- Select all / deselect all options available

**Affected Pages**: Create split dialog
**Data Requirements**: Dataset with diverse samples
**Prerequisites**: User logged in

### Scenario 5: Create Split with Stratification
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Create split form is open and samples have metadata (e.g., docType field)
**When**: User selects stratification by "docType" and specifies distribution (e.g., equal split)
**Then**:
- Stratification rule is included in POST request
- Backend distributes samples proportionally by docType values
- Split is created with balanced representation
- Stratification rules are shown in split details

**Affected Pages**: Create split dialog, Dataset version detail
**Data Requirements**: Dataset with metadata-rich samples
**Prerequisites**: User logged in

### Scenario 6: Update Unfrozen Split
- **Type**: Happy Path
- **Priority**: High

**Given**: Unfrozen split exists
**When**: User clicks "Edit" action and modifies sample selection, then saves
**Then**:
- PUT to `/api/benchmark/datasets/{id}/versions/{versionId}/splits/{splitId}` with updated sampleIds
- Split is updated with new sample list
- Sample count updates
- Success notification appears

**Affected Pages**: Dataset version detail page (edit dialog)
**Data Requirements**: Unfrozen split
**Prerequisites**: User logged in

### Scenario 7: Cannot Edit Frozen Split
- **Type**: Edge Case
- **Priority**: High

**Given**: Split with `frozen=true` exists
**When**: User views the split in the list
**Then**:
- "Edit" button is disabled or not visible
- Frozen badge/indicator is displayed
- Tooltip explains: "Frozen splits cannot be modified"
- Attempting to call update API returns 400 error

**Affected Pages**: Dataset version detail page
**Data Requirements**: Frozen split
**Prerequisites**: User logged in

### Scenario 8: Freeze Golden Regression Split
- **Type**: Happy Path
- **Priority**: High

**Given**: Unfrozen split of type "golden" exists
**When**: User clicks "Freeze" action
**Then**:
- Confirmation dialog: "Are you sure? This cannot be undone."
- After confirmation, split's `frozen` flag is set to true
- Split can no longer be edited
- Frozen badge appears
- Success notification

**Affected Pages**: Dataset version detail page
**Data Requirements**: Unfrozen golden split
**Prerequisites**: User logged in

### Scenario 9: Freeze Confirmation Dialog
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User initiates freeze action on a split
**When**: Confirmation dialog appears
**Then**:
- Dialog clearly states: "Freezing this split will make it immutable. This action cannot be undone."
- Split details are shown (name, type, sample count)
- Confirm and Cancel buttons
- User must explicitly confirm

**Affected Pages**: Dataset version detail page (modal)
**Data Requirements**: Unfrozen split
**Prerequisites**: User logged in

### Scenario 10: Split Type Badge Display
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Splits of different types exist
**When**: Split list is rendered
**Then**:
- Each type has distinct badge color:
  - train: blue
  - val: yellow
  - test: green
  - golden: purple/gold
- Badge includes icon or label indicating type
- Colors are accessible (contrast requirements met)

**Affected Pages**: Dataset version detail page
**Data Requirements**: Splits of all types
**Prerequisites**: User logged in

### Scenario 11: Empty Splits List
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Dataset version has no splits defined
**When**: User views the splits section
**Then**:
- Empty state message: "No splits defined for this version"
- Prompt: "Create your first split to organize samples for benchmarking"
- "Create Split" button is prominently displayed
- No table is shown

**Affected Pages**: Dataset version detail page
**Data Requirements**: Dataset version without splits
**Prerequisites**: User logged in

### Scenario 12: Split Name Validation
- **Type**: Error Case
- **Priority**: High

**Given**: Create split form is open
**When**: User submits without entering a name OR enters invalid characters
**Then**:
- Error message: "Split name is required" or "Invalid characters in name"
- Form does not submit
- Name field is highlighted
- User can correct and retry

**Affected Pages**: Create split dialog
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 13: Stratification Preview
- **Type**: Happy Path
- **Priority**: Low

**Given**: User has selected stratification by a metadata field
**When**: Stratification rule is configured
**Then**:
- Preview shows sample distribution by field values
- Example: "docType: invoice (20%), form (30%), receipt (50%)"
- User can see if stratification is balanced
- Helps verify stratification before creating split

**Affected Pages**: Create split dialog
**Data Requirements**: Samples with metadata
**Prerequisites**: User logged in

### Scenario 14: Delete Split (if supported)
- **Type**: Happy Path
- **Priority**: Low

**Given**: Unfrozen split exists
**When**: User clicks "Delete" action
**Then**:
- Confirmation dialog: "Delete this split?"
- After confirmation, DELETE request is sent
- Split is removed from list
- Success notification appears
- Frozen splits cannot be deleted (button disabled)

**Affected Pages**: Dataset version detail page
**Data Requirements**: Unfrozen split
**Prerequisites**: User logged in

### Scenario 15: Split Used in Definition Warning
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Split is referenced by one or more benchmark definitions
**When**: User attempts to delete or modify the split
**Then**:
- Warning appears: "This split is used by X definition(s)"
- List of definitions using the split is shown
- User must confirm understanding before proceeding
- Or deletion/edit is blocked entirely

**Affected Pages**: Dataset version detail page
**Data Requirements**: Split used in definitions
**Prerequisites**: User logged in

### Scenario 16: API Error Handling
- **Type**: Error Case
- **Priority**: Medium

**Given**: User attempts to create or update a split
**When**: API returns error (500, validation error)
**Then**:
- Error notification displays with server message
- Form remains open with user's data preserved
- User can retry submission
- Split list does not update

**Affected Pages**: Create/edit split dialog
**Data Requirements**: Simulated API error
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (create, list, update, freeze)
- ✅ Edge cases covered (frozen splits, empty lists, deletion warnings)
- ✅ Error handling covered (validation, API errors)
- ✅ Stratification covered (rules, preview)
- ⚠️ Missing: Performance with very large sample sets (10,000+)
- ⚠️ Missing: Complex stratification scenarios (multi-field stratification)
