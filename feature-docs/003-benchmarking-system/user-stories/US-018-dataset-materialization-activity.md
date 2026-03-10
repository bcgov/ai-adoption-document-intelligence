# US-018: Dataset Materialization Activity

**As a** developer,
**I want to** have a Temporal activity that materializes a pinned dataset version on the worker,
**So that** benchmark workflows can access dataset files locally for processing.

## Acceptance Criteria
- [ ] **Scenario 1**: Clone and checkout dataset repo at pinned revision
    - **Given** a dataset version with a known gitRevision
    - **When** the `benchmark.materializeDataset` activity is executed
    - **Then** the dataset Git repository is cloned to a temporary directory on the worker and checked out at the exact gitRevision

- [ ] **Scenario 2**: Pull data files from MinIO via DVC
    - **Given** the repository is checked out at the pinned revision
    - **When** the activity continues execution
    - **Then** `dvc pull` is executed to fetch all data files from the MinIO `datasets` bucket to the local working directory

- [ ] **Scenario 3**: Return path to materialized dataset
    - **Given** the dataset has been fully materialized
    - **When** the activity completes
    - **Then** the absolute path to the materialized dataset directory is returned, containing all input files, ground truth files, and the manifest

- [ ] **Scenario 4**: Cache materialized datasets
    - **Given** a dataset version has been materialized previously on this worker
    - **When** the same `benchmark.materializeDataset` activity is executed for the same gitRevision
    - **Then** the cached copy is reused without re-cloning or re-pulling, and the cached path is returned

- [ ] **Scenario 5**: Cache invalidation on revision mismatch
    - **Given** a cached dataset exists for a different gitRevision
    - **When** `benchmark.materializeDataset` is executed for a new gitRevision of the same dataset
    - **Then** the old cache is not used, and a fresh clone/checkout/pull is performed

- [ ] **Scenario 6**: Handle materialization failure
    - **Given** the dataset repository is unreachable or DVC pull fails
    - **When** the activity fails
    - **Then** a descriptive error is thrown indicating whether the failure was in Git clone, Git checkout, or DVC pull, and temporary files are cleaned up

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/activities/benchmark-materialize.ts`
- Activity type: `benchmark.materializeDataset`
- Uses `child_process` to invoke `git` and `dvc` CLI commands on the worker
- Cache directory configurable via environment variable (e.g., `BENCHMARK_CACHE_DIR`)
- Cache key: `{datasetId}-{gitRevision}`
- DVC remote credentials (MinIO) must be available on the worker environment
- See Requirements Section 3.3 (Dataset Materialization), Section 11.4 (Temporal Activities)
- Tests: `apps/temporal/src/activities/benchmark-materialize.test.ts`
