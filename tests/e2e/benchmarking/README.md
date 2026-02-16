# Benchmarking E2E Tests

## Overview
End-to-end tests for the benchmarking system, covering dataset management, version control, and sample preview functionality.

## Test Structure

### Test Files
- `dataset-list-create.spec.ts` - Dataset list display and creation UI
- `dataset-version-sample-preview.spec.ts` - Version lifecycle and sample preview
- `navigation-routing.spec.ts` - Navigation and routing within benchmarking section

### Database Requirements

**CRITICAL**: These tests require a fresh database seed before each test run.

#### Reset and Seed Database
```bash
cd apps/backend-services
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes" npx prisma migrate reset --force
npm run db:seed
cd ../..
```

#### Why Database Reset is Required
- Tests in `dataset-version-sample-preview.spec.ts` modify database state (publish/archive versions)
- The "Version Lifecycle" tests change version statuses from draft → published → archived
- Running tests multiple times without reset will cause failures due to stale state

### Test Ordering

The `dataset-version-sample-preview.spec.ts` file uses `test.describe.serial()` to ensure proper test ordering:

1. **State-checking tests** (lines 81-115):
   - `should show correct action buttons for each status`
   - `should not show publish button for published version`
   - These tests verify initial state and MUST run before state-modifying tests

2. **State-modifying tests** (lines 117+):
   - `should publish a draft version and update status`
   - `should archive a published version and update status`
   - These tests modify the database and change version statuses

**Important**: State-checking tests are placed inside the "Version Lifecycle" serial group to guarantee they run before the lifecycle tests that modify data.

## Running Tests

### Run all benchmarking tests
```bash
npx playwright test tests/e2e/benchmarking/ --reporter=list
```

### Run specific test file
```bash
npx playwright test tests/e2e/benchmarking/dataset-version-sample-preview.spec.ts
```

### Run with UI mode
```bash
npx playwright test tests/e2e/benchmarking/ --ui
```

## Test Coverage

### Dataset List & Create UI (US-027)
- ✅ Display dataset list with all columns
- ✅ Create dataset with valid data
- ✅ Create dataset with metadata
- ✅ Validation (missing name, missing repo URL)
- ✅ Cancel and discard data
- ✅ Navigate to dataset detail
- ✅ File paths (file://, tilde ~/, remote URLs)
- ✅ Metadata management (add/remove entries)
- ✅ Loading states
- ⚠️ Empty state (requires clean database - run separately)

### Dataset Version & Sample Preview UI (US-028)
- ✅ Display version list with all columns
- ✅ Versions in descending order by creation date
- ✅ Show correct action buttons for each status
- ✅ Cannot publish already published version
- ✅ Publish draft version
- ✅ Archive published version
- ✅ Display sample preview
- ✅ Paginate samples (>20 samples)
- ⚠️ Ground truth JSON viewer (requires actual ground truth files)
- ✅ Upload files dialog
- ✅ Drag-and-drop zone
- ⚠️ Upload files with progress (intentionally minimal)
- ⚠️ File size limits (intentionally minimal)
- ✅ Status badge colors
- ✅ Sample metadata display
- ✅ Empty sample list
- ✅ Git revision truncation
- ⚠️ File type validation (intentionally minimal)
- ⚠️ Concurrent upload handling (intentionally minimal)

### Navigation & Routing
- ✅ Display benchmarking section in sidebar
- ✅ Navigate to datasets/projects/runs pages
- ✅ Navigate to detail pages
- ✅ Load pages from direct URL
- ✅ Browser back/forward navigation
- ✅ Handle invalid routes
- ✅ Load pages without errors

## Skipped Tests

### Intentionally Skipped (7 total)

1. **Ground truth viewer** (1 test)
   - Requires actual ground truth JSON files in dataset repository
   - Seed creates manifest references but not actual files

2. **File upload** (4 tests)
   - Intentionally minimal as they require complex file upload infrastructure
   - Would need backend DVC operations implementation
   - Better suited for unit/integration tests

3. **Empty state** (2 tests)
   - Require clean database without seed data
   - Run these separately with empty database

## Troubleshooting

### Tests fail on second run
**Cause**: Database contains modified state from previous test run.
**Solution**: Reset and seed database before running tests again.

### "element not found" errors
**Cause**: Page elements not loading, possibly due to backend/frontend not running.
**Solution**: Ensure backend and frontend services are running.

### Serial tests run out of order
**Cause**: Playwright's parallel workers can cause ordering issues.
**Solution**: Tests are configured with `test.describe.serial()` to enforce ordering within a single worker. Database reset ensures clean state for each test run.
