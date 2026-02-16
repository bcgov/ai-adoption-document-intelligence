# US-005: DVC Service

**As a** developer,
**I want to** have a service that automates DVC operations on the dedicated dataset Git repository,
**So that** dataset files are version-controlled and stored in MinIO transparently without manual DVC/Git interaction.

## Acceptance Criteria
- [ ] **Scenario 1**: Initialize a dataset repository with DVC
    - **Given** a new dataset is being created
    - **When** `initRepository(repositoryUrl)` is called
    - **Then** the dataset Git repository is cloned, `dvc init` is executed, and the DVC remote is configured to point to the MinIO `datasets` bucket

- [ ] **Scenario 2**: Add files to DVC tracking
    - **Given** files have been written to the dataset repository working directory
    - **When** `addFiles(repoPath, filePaths)` is called
    - **Then** `dvc add` is executed for each file/directory, creating corresponding `.dvc` files

- [ ] **Scenario 3**: Commit DVC metadata to Git
    - **Given** DVC-tracked files have been added
    - **When** `commitChanges(repoPath, message)` is called
    - **Then** `.dvc` files, `.gitignore` updates, and the manifest file are committed to the Git repository with the provided commit message, and the Git commit SHA is returned

- [ ] **Scenario 4**: Push data to MinIO remote
    - **Given** DVC-tracked files have been committed
    - **When** `pushData(repoPath)` is called
    - **Then** `dvc push` uploads the large data files to the configured MinIO remote (datasets bucket)

- [ ] **Scenario 5**: Pull data from MinIO remote at a specific revision
    - **Given** a dataset version with a known gitRevision exists
    - **When** `pullData(repoPath, gitRevision)` is called
    - **Then** the repository is checked out at the specified Git revision and `dvc pull` fetches the corresponding data files from MinIO

- [ ] **Scenario 6**: Checkout a specific Git revision
    - **Given** a dataset repository has multiple commits
    - **When** `checkout(repoPath, gitRevision)` is called
    - **Then** the working directory reflects the exact state of the dataset at that Git commit/tag

- [ ] **Scenario 7**: Configure DVC remote to MinIO
    - **Given** a dataset repository with DVC initialized
    - **When** `configureRemote(repoPath, remoteName, bucketUrl)` is called
    - **Then** the DVC remote is configured with S3-compatible endpoint URL, access key, and secret key pointing to MinIO

- [ ] **Scenario 8**: Clone dataset repository
    - **Given** a dataset repository URL and optional Git credentials
    - **When** `cloneRepository(repositoryUrl, targetPath)` is called
    - **Then** the repository is cloned to the target path using configured Git credentials from environment variables

- [x] **Scenario 9**: Expand tilde in repository URLs
    - **Given** a repository URL containing tilde (~) for home directory
    - **When** `cloneRepository("~/path/to/repo", targetPath)` or `cloneRepository("file://~/path/to/repo", targetPath)` is called
    - **Then** the tilde is expanded to the user's home directory (e.g., `/home/username/path/to/repo`) before cloning
    - **And** remote repository URLs (https://, git@) are not affected by tilde expansion

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/backend-services/src/benchmark/dvc.service.ts`
- All DVC/Git operations execute against the dedicated dataset repository, NOT the main application repository
- Uses `child_process` (exec/spawn) to invoke `dvc` and `git` CLI commands
- DVC and Git must be available on the backend service container (added to Dockerfile)
- Git credentials managed via environment variables (`DATASET_GIT_USERNAME`, `DATASET_GIT_PASSWORD` or SSH key)
- MinIO credentials for DVC remote: reuses `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_ENDPOINT`
- **Tilde expansion**: Supports `~` in repository URLs for portability across developer machines (e.g., `~/Github/datasets-repo` or `file://~/Github/datasets-repo`)
- **Test utilities**: `createTempDatasetRepo()` helper available in `apps/backend-services/src/testUtils/datasetTestHelpers.ts` for creating isolated temporary repositories in tests
- See Requirements Section 3.1 (Storage Architecture), Section 3.2 (Dataset Upload & DVC Automation), Section 3.3 (Dataset Materialization)
- Tests: `apps/backend-services/src/benchmark/dvc.service.spec.ts`, `apps/backend-services/src/testUtils/datasetTestHelpers.spec.ts`
