# US-010: Benchmark Project Service & Controller

**As a** user,
**I want to** create and manage benchmark projects,
**So that** I can logically group benchmark experiments and have them mapped to MLflow experiments for tracking.

## Acceptance Criteria
- [ ] **Scenario 1**: Create a benchmark project
    - **Given** a valid project creation request with name, description, and createdBy
    - **When** `POST /api/benchmark/projects` is called
    - **Then** a BenchmarkProject record is created in Postgres, a corresponding MLflow experiment is created via MlflowClientService, the `mlflowExperimentId` is stored on the project, and the created project is returned

- [ ] **Scenario 2**: List benchmark projects
    - **Given** multiple benchmark projects exist
    - **When** `GET /api/benchmark/projects` is called
    - **Then** a list of projects is returned with name, description, mlflowExperimentId, createdBy, definition count, run count, and timestamps

- [ ] **Scenario 3**: Get project details
    - **Given** a benchmark project with ID exists
    - **When** `GET /api/benchmark/projects/:id` is called
    - **Then** the full project details are returned including name, description, mlflowExperimentId, createdBy, list of definitions, recent runs, and timestamps

- [ ] **Scenario 4**: Project not found returns 404
    - **Given** no project exists with the provided ID
    - **When** `GET /api/benchmark/projects/:id` is called
    - **Then** a 404 response is returned with an appropriate error message

- [ ] **Scenario 5**: Create project validates required fields
    - **Given** a project creation request missing the `name` field
    - **When** `POST /api/benchmark/projects` is called
    - **Then** a 400 response is returned with validation error details

- [ ] **Scenario 6**: MLflow experiment creation failure is handled
    - **Given** the MLflow server is unreachable
    - **When** a project creation is attempted
    - **Then** the creation fails with a 503 response and no orphaned project record is created in Postgres

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Files: `apps/backend-services/src/benchmark/benchmark.service.ts`, `apps/backend-services/src/benchmark/benchmark.controller.ts`
- Controller: `@Controller('api/benchmark/projects')`
- Service depends on PrismaService and MlflowClientService
- MLflow experiment name should match the benchmark project name for easy correlation
- See Requirements Section 2.4 (BenchmarkProject model), Section 6.2 (MLflow Integration), Section 11.2 (Benchmark APIs)
- Tests: `apps/backend-services/src/benchmark/benchmark.service.spec.ts`, `apps/backend-services/src/benchmark/benchmark.controller.spec.ts`
