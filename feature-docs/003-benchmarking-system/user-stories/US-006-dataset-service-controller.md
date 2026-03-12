# US-006: Dataset Service & Controller

**As a** developer,
**I want to** have CRUD endpoints for the Dataset entity,
**So that** users can create, list, and view datasets through the API.

## Acceptance Criteria
- [ ] **Scenario 1**: Create a new dataset
    - **Given** a valid dataset creation request with name, description, metadata, and repositoryUrl
    - **When** `POST /api/benchmark/datasets` is called
    - **Then** a Dataset record is created in Postgres, the dataset Git repository is initialized via DvcService (clone, dvc init, configure remote), and the created dataset is returned with its ID

- [ ] **Scenario 2**: List datasets with pagination
    - **Given** multiple datasets exist in the database
    - **When** `GET /api/benchmark/datasets?page=1&limit=20` is called
    - **Then** a paginated list of datasets is returned with name, description, metadata, version count, createdBy, and timestamps

- [ ] **Scenario 3**: Get dataset details
    - **Given** a dataset with ID exists
    - **When** `GET /api/benchmark/datasets/:id` is called
    - **Then** the full dataset details are returned including repositoryUrl, dvcRemote, metadata, version count, and list of recent versions

- [ ] **Scenario 4**: Dataset not found returns 404
    - **Given** no dataset exists with the provided ID
    - **When** `GET /api/benchmark/datasets/:id` is called
    - **Then** a 404 response is returned with an appropriate error message

- [ ] **Scenario 5**: Create dataset validates required fields
    - **Given** a dataset creation request missing the `name` field
    - **When** `POST /api/benchmark/datasets` is called
    - **Then** a 400 response is returned with validation error details

- [ ] **Scenario 6**: Audit log is created on dataset creation
    - **Given** a valid dataset creation request
    - **When** the dataset is successfully created
    - **Then** a BenchmarkAuditLog entry is recorded with action `dataset_created`, the user ID, and the new dataset ID

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Files: `apps/backend-services/src/benchmark/dataset.service.ts`, `apps/backend-services/src/benchmark/dataset.controller.ts`
- Controller uses NestJS decorators: `@Controller('api/benchmark/datasets')`, `@Post()`, `@Get()`, `@Get(':id')`
- Service depends on PrismaService, DvcService, and AuditLogService
- DTO validation using `class-validator` decorators
- See Requirements Section 11.1 (Dataset APIs) and Section 2.1 (Dataset model)
- Tests: `apps/backend-services/src/benchmark/dataset.service.spec.ts`, `apps/backend-services/src/benchmark/dataset.controller.spec.ts`
