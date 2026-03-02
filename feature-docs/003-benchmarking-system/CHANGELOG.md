# Benchmarking System - Changelog

## 2026-02-15 - Repository URL Portability & Testing Improvements

### Overview
Added tilde expansion support and test utilities to make dataset repository configuration portable across development environments and enable robust e2e testing without hardcoded paths.

### Changes

#### Requirements (`REQUIREMENTS.md`)
- **Section 3.3a (NEW)**: Added "Repository URL Portability & Testing"
  - Documents tilde expansion feature (`~/path` → `/home/username/path`)
  - Documents test utilities for creating temporary repositories
  - Explains benefits for portability and testing

#### User Stories

**US-005: DVC Service** (`user-stories/US-005-dvc-service.md`)
- ✅ **Scenario 9 (NEW)**: Expand tilde in repository URLs
  - Tests tilde expansion in direct paths and file:// URLs
  - Verifies remote URLs are not affected
- **Technical Notes**: Added documentation for:
  - Tilde expansion support
  - Test utilities location and usage
  - Updated test file references

#### Playwright Test Plans

**US-027: Dataset List & Create UI** (`playwright/test-plans/US-027-dataset-list-create-ui.md`)
- ✅ **Scenario 14 (NEW)**: Create Dataset with Tilde Path
  - Tests `~/Github/datasets-repo` format
  - Documents use of `createTempDatasetRepo()` helper
- ✅ **Scenario 15 (NEW)**: Create Dataset with file:// URL
  - Tests `file://~/Github/datasets-repo` format
  - Verifies both tilde formats work equivalently
- ✅ **Scenario 16 (NEW)**: Create Dataset with Remote Repository
  - Tests `https://github.com/org/repo.git` format
  - Verifies remote URLs work unchanged
  - Documents credential injection behavior
- **Test Implementation Notes (NEW)**: Added code examples showing:
  - How to use `createTempDatasetRepo()` in Playwright tests
  - Setup/teardown patterns
  - Benefits of using test utilities

### Implementation Files

#### New Files
- `apps/backend-services/src/testUtils/datasetTestHelpers.ts` - Test utilities
- `apps/backend-services/src/testUtils/datasetTestHelpers.spec.ts` - Test utility tests
- `tests/e2e/examples/benchmark-dataset-example.spec.ts.example` - E2E test example
- `docs/benchmarking/DATASET_REPOSITORY_SETUP.md` - Setup guide

#### Modified Files
- `apps/backend-services/src/benchmark/dvc.service.ts` - Added tilde expansion
- `apps/backend-services/src/benchmark/dvc.service.spec.ts` - Added tilde expansion tests
- `apps/backend-services/.env.sample` - Added `DEFAULT_DATASET_REPOSITORY_PATH`
- `apps/backend-services/Dockerfile` - Added Git and DVC installation
- `.vscode/tasks.json` - Added MinIO and MLflow health checks

### Test Coverage
- ✅ 7 new tests in `datasetTestHelpers.spec.ts` (all passing)
- ✅ 3 new tests in `dvc.service.spec.ts` (all passing)
- ✅ Total: 10 new tests, 100% passing

### Environment Variables

New environment variables added to `.env.sample`:
```bash
# MinIO Configuration for Application
MINIO_ENDPOINT=http://localhost:19000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# Dataset Git Repository Credentials
DATASET_GIT_USERNAME=
DATASET_GIT_PASSWORD=

# Default Dataset Repository Path (optional)
DEFAULT_DATASET_REPOSITORY_PATH=~/Github/datasets-repo
```

### Documentation

New documentation files:
- [DATASET_REPOSITORY_SETUP.md](../../docs/benchmarking/DATASET_REPOSITORY_SETUP.md) - Complete setup guide
  - Local development configuration
  - E2E test patterns
  - Troubleshooting
  - Environment variables reference

### Breaking Changes
**None** - All changes are additive and backward compatible.

### Migration Guide
No migration needed. Existing dataset repository URLs continue to work as before. New features are opt-in:
- Developers can start using `~` in repository URLs for portability
- Tests can adopt `createTempDatasetRepo()` utilities incrementally
- Remote repository URLs work exactly as before

### Benefits
✅ **Portability**: No hardcoded usernames in dataset URLs
✅ **Testing**: Isolated, self-cleaning test repositories
✅ **Flexibility**: Supports local, remote, SSH, and HTTPS repository URLs
✅ **Developer Experience**: Works the same across all developer machines
✅ **CI/CD Ready**: Tests run reliably in any environment

### Next Steps
1. Update existing e2e tests to use `createTempDatasetRepo()` when they're written
2. Consider adding frontend default value from `DEFAULT_DATASET_REPOSITORY_PATH` env var
3. Add documentation for containerized/production deployment scenarios
