# US-003: MinIO Blob Storage Service

**As a** developer,
**I want to** have a MinIO-backed blob storage service implementing the existing `BlobStorageInterface`,
**So that** benchmark activities can read and write dataset files and artifacts to S3-compatible object storage.

## Acceptance Criteria
- [ ] **Scenario 1**: Service implements BlobStorageInterface
    - **Given** the existing `BlobStorageInterface` with write, read, exists, and delete methods
    - **When** the `MinioBlobStorageService` is created
    - **Then** it implements all methods of `BlobStorageInterface` using S3-compatible API calls to MinIO

- [ ] **Scenario 2**: Write operation stores data in MinIO
    - **Given** a configured MinIO connection and a target bucket
    - **When** `write(key, data)` is called
    - **Then** the data is stored in MinIO at the specified key within the configured bucket and the operation resolves successfully

- [ ] **Scenario 3**: Read operation retrieves data from MinIO
    - **Given** a file exists in MinIO at a known key
    - **When** `read(key)` is called
    - **Then** the file contents are returned as a Buffer

- [ ] **Scenario 4**: Exists operation checks file presence
    - **Given** a MinIO bucket with some files
    - **When** `exists(key)` is called
    - **Then** it returns `true` for existing keys and `false` for non-existing keys

- [ ] **Scenario 5**: Delete operation removes data from MinIO
    - **Given** a file exists in MinIO at a known key
    - **When** `delete(key)` is called
    - **Then** the file is removed from MinIO and subsequent `exists(key)` returns `false`

- [ ] **Scenario 6**: Bucket configuration via environment variables
    - **Given** the need to support multiple buckets (datasets, mlflow-artifacts, benchmark-outputs)
    - **When** the service is initialized
    - **Then** the MinIO endpoint, access key, secret key, and default bucket are configurable via environment variables (`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`)

- [ ] **Scenario 7**: Service is injectable via NestJS DI
    - **Given** the NestJS dependency injection system
    - **When** the service is registered
    - **Then** it can be injected into other services using a provider token, allowing benchmark services to use MinIO while existing services continue using their current blob storage implementations

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/backend-services/src/blob-storage/minio-blob-storage.service.ts`
- Use AWS SDK v3 (`@aws-sdk/client-s3`) or the official MinIO JS client (`minio`) for S3-compatible operations
- Existing `LocalBlobStorageService` and Azure `BlobStorageService` remain unchanged
- Configuration determines which blob storage implementation is injected for benchmark operations
- See Requirements Section 8.2 (Blob Storage Integration) and Section 11.3 (Integration Services)
- Tests: `apps/backend-services/src/blob-storage/minio-blob-storage.service.spec.ts`
