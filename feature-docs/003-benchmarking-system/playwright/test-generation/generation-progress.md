# Test Generation Progress

- [x] US-026-benchmarking-navigation-routing.md - Completed 2026-02-15
- [x] US-027-dataset-list-create-ui.md - Completed 2026-02-15 (8/14 tests passing)
- [x] US-028-dataset-version-sample-preview-ui.md - Completed 2026-02-15 (8/19 tests passing)
- [ ] US-029-benchmark-definition-crud-ui.md
- [ ] US-030-run-list-start-cancel-progress-ui.md
- [ ] US-031-results-summary-mlflow-deeplinks-ui.md
- [ ] US-032-dataset-quality-checks-validation.md
- [ ] US-033-split-management-ui.md
- [ ] US-034-baseline-management.md
- [ ] US-036-side-by-side-run-comparison-ui.md
- [ ] US-037-regression-reports-ui.md
- [ ] US-038-slicing-filtering-drilldown-ui.md
- [ ] US-039-in-app-artifact-viewer.md

**Status**: 3/13 test plans generated
**Last Updated**: 2026-02-15 11:00 PM

## Test Results Summary

### US-027 - Dataset List & Create UI
- ✅ **8 passing**: List display, dialog management, validation, metadata, navigation
- ❌ **6 failing**: Dataset creation tests (implementation issue - dialog closes before API completes)
- ⏭️ **2 skipped**: Empty state tests

**Implementation issues found**:
1. Dialog closes before mutation completes - needs async handling
2. Name input autofocus not working

### US-028 - Dataset Version & Sample Preview UI
- ✅ **8 passing**: Version list display, sample preview tab, upload dialog display, status badges, git revision truncation
- ❌ **4 failing**: Version ordering (text matching), action menu items (selector issues), upload dialog title (strict mode)
- ⏭️ **7 skipped**: Sample pagination, ground truth viewer, file upload functionality, metadata display (require backend implementation)

**Implementation issues found**:
1. Version ordering test needs refinement for text content extraction
2. Action menu items may not have correct testids or menu not opening properly
3. Upload dialog "Upload Files" text appears in both button and modal title (strict mode violation)
