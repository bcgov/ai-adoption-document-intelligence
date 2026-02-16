# Test Generation Progress

- [x] US-026-benchmarking-navigation-routing.md - Completed 2026-02-15
- [x] US-027-dataset-list-create-ui.md - Completed 2026-02-15 (8/14 tests passing)
- [ ] US-028-dataset-version-sample-preview-ui.md
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

**Status**: 2/13 test plans generated
**Last Updated**: 2026-02-15 9:40 PM

## Test Results Summary

### US-027 - Dataset List & Create UI
- ✅ **8 passing**: List display, dialog management, validation, metadata, navigation
- ❌ **6 failing**: Dataset creation tests (implementation issue - dialog closes before API completes)
- ⏭️ **2 skipped**: Empty state tests

**Implementation issues found**:
1. Dialog closes before mutation completes - needs async handling
2. Name input autofocus not working
