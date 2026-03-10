# US-001: Docker Compose -- MinIO & MLflow Services

**As a** developer,
**I want to** have MinIO and MLflow services configured in docker-compose,
**So that** the benchmarking system has S3-compatible object storage and experiment tracking infrastructure available locally.

## Acceptance Criteria
- [ ] **Scenario 1**: MinIO service is defined
    - **Given** the existing `apps/backend-services/docker-compose.yml`
    - **When** the MinIO service definition is added
    - **Then** MinIO runs on port 9000 (API) and 9001 (Console) with `minio/minio` image, a persistent `minio_data` volume, and configurable `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` environment variables

- [ ] **Scenario 2**: MinIO default buckets are created on startup
    - **Given** the MinIO service is running
    - **When** the initialization completes
    - **Then** three buckets exist: `datasets` (DVC remote), `mlflow-artifacts` (MLflow artifact store), and `benchmark-outputs` (run outputs)

- [ ] **Scenario 3**: MLflow server service is defined
    - **Given** the existing `apps/backend-services/docker-compose.yml`
    - **When** the MLflow service definition is added
    - **Then** MLflow runs on port 5000 with `ghcr.io/mlflow/mlflow` image, `--backend-store-uri postgresql://mlflow:password@postgres:5432/mlflow`, and `--default-artifact-root s3://mlflow-artifacts/` pointing to MinIO

- [ ] **Scenario 4**: MLflow database is initialized on PostgreSQL
    - **Given** the existing PostgreSQL 15 service in docker-compose
    - **When** the database initialization runs
    - **Then** a separate `mlflow` database is created on the same PostgreSQL instance with appropriate credentials

- [ ] **Scenario 5**: Service dependencies are configured correctly
    - **Given** all services are defined in docker-compose
    - **When** `docker-compose up` is executed
    - **Then** MLflow depends on both `postgres` and `minio`, MinIO starts independently, and all services reach healthy state

- [ ] **Scenario 6**: Environment variables are documented
    - **Given** the new services require credentials
    - **When** the docker-compose file is reviewed
    - **Then** all required environment variables (`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MLFLOW_S3_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) are defined with sensible defaults for local development

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/backend-services/docker-compose.yml` (extend existing)
- MLflow uses PostgreSQL as its backend store via SQLAlchemy -- this is the standard production pattern
- MLflow artifact store communicates with MinIO via S3-compatible API, requiring `MLFLOW_S3_ENDPOINT_URL` to be set to `http://minio:9000`
- Bucket creation can use an init container or entrypoint script with the `mc` (MinIO Client) tool
- See Requirements Section 8.1 (Storage Architecture) and Section 12.1 (Deployment)
- See Requirements Section 13.5 for infrastructure diagram
