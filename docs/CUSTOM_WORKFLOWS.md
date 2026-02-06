# Custom Workflows Architecture

## Overview

Custom workflows allow users to define configurable OCR document processing pipelines. Each workflow is a named, versioned configuration that controls which processing steps are executed and how they are parameterized when a document is submitted for OCR. Workflows run on [Temporal](https://temporal.io/), an open-source durable execution framework that guarantees reliable step-by-step orchestration with automatic retries, timeouts, and human-in-the-loop approval gates.

The system follows a clear separation of concerns:

1. **Frontend** - workflow builder UI for creating/editing workflow configurations
2. **Backend API** - CRUD endpoints for workflow management + document upload with workflow selection
3. **Temporal Worker** - executes the actual OCR pipeline according to the workflow configuration

## Architecture Diagram

```
                                  +-----------------------+
                                  |       Frontend        |
                                  |  (React + Mantine)    |
                                  |                       |
                                  |  WorkflowListPage     |
                                  |  WorkflowPage (create)|
                                  |  WorkflowEditPage     |
                                  |  WorkflowVisualization|
                                  |  DocumentUploadPanel  |
                                  +-----------+-----------+
                                              |
                                    REST API calls via
                                    useWorkflows hooks
                                              |
                                              v
+-----------------+          +---------------------------------+
|   PostgreSQL    |<-------->|        Backend Services          |
|                 |          |         (NestJS)                 |
|  workflows      |          |                                 |
|  documents      |          |  WorkflowController (CRUD)      |
|  ocr_results    |          |  WorkflowService (business logic)|
|  review_sessions|          |  WorkflowValidator              |
|  field_correct  |          |  UploadController                |
|  ...            |          |  OcrService                      |
+-----------------+          |  TemporalClientService           |
                             +----------------+----------------+
                                              |
                                     Starts Temporal
                                     workflow execution
                                              |
                                              v
                             +----------------+----------------+
                             |       Temporal Server           |
                             |  (namespace: default,           |
                             |   task queue: ocr-processing)   |
                             +----------------+----------------+
                                              |
                                     Dispatches tasks to
                                              |
                                              v
                             +----------------+----------------+
                             |       Temporal Worker            |
                             |                                 |
                             |  ocrWorkflow() orchestration    |
                             |  10 activity implementations    |
                             |  Config validation + merging    |
                             +----------------+----------------+
                                              |
                                     Calls Azure APIs,
                                     updates database
                                              |
                                              v
                             +----------------+----------------+
                             |  Azure Document Intelligence    |
                             |  (OCR processing)               |
                             +---------------------------------+
```

## Workflow Steps

Every workflow consists of 11 configurable steps. Each step can be enabled/disabled and some accept parameters. The steps execute sequentially within the Temporal workflow:

| # | Step ID | Description | Required | Configurable Parameters |
|---|---------|-------------|----------|------------------------|
| 1 | `updateStatus` | Sets document status to `ongoing_ocr` in database | No | None |
| 2 | `prepareFileData` | Validates file data, determines content type, resolves model ID | **Yes** | None |
| 3 | `submitToAzureOCR` | Submits document to Azure Document Intelligence API | **Yes** | None |
| 4 | `updateApimRequestId` | Stores Azure API request ID in the document record | No | None |
| 5 | `waitBeforePoll` | Initial delay before polling begins | No | `waitTime` (ms, default: 5000) |
| 6 | `pollOCRResults` | Polls Azure API for OCR completion | **Yes** | `maxRetries` (1-100, default: 20), `waitBeforeFirstPoll` (ms, default: 5000), `waitBetweenPolls` (ms, default: 10000) |
| 7 | `extractOCRResults` | Parses Azure response into structured `OCRResult` | **Yes** | None |
| 8 | `postOcrCleanup` | Text normalization: unicode fixes, dehyphenation, encoding cleanup | No | None |
| 9 | `checkOcrConfidence` | Calculates average word confidence, flags for review if below threshold | No | `threshold` (0-1, default: 0.95) |
| 10 | `humanReview` | Pauses workflow and waits for human approval signal | No | `timeout` (ms, default: 86400000 = 24h) |
| 11 | `storeResults` | Persists OCR results to database, sets document status to `completed_ocr` | **Yes** | None |

Steps marked **Required** will throw an error if disabled - they are essential to the pipeline's operation. Optional steps can be freely toggled.

### Step Execution Order Notes

- Steps 1-9 and 11 execute in the main sequential flow
- Step 10 (`humanReview`) is conditional: it only activates if Step 9 (`checkOcrConfidence`) determines the document's average confidence is below the configured threshold
- Step 11 (`storeResults`) runs before Step 10 in the actual code - results are stored first so reviewers can see the OCR output during review
- If `humanReview` is disabled but confidence is below threshold, the workflow fails

## Database Schema

### Workflow Table

Defined in `apps/shared/prisma/schema.prisma`:

```prisma
model Workflow {
  id          String   @id @default(cuid())
  name        String
  description String?
  user_id     String
  config      Json     // WorkflowStepsConfig stored as JSONB
  version     Int      @default(1)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  @@map("workflows")
}
```

- **`config`** - JSONB column storing a `WorkflowStepsConfig` object (step IDs as keys, `StepConfig` as values)
- **`version`** - Auto-incremented only when the `config` field semantically changes (metadata-only updates like name/description do not increment the version)
- **`user_id`** - Keycloak user ID for ownership scoping

### Document Table (Workflow References)

Documents link to workflows via two fields:

```prisma
model Document {
  // ... other fields ...
  workflow_id           String?  // @deprecated: Use workflow_config_id instead
  workflow_config_id    String?  // Reference to Workflow.id
  workflow_execution_id String?  @unique // Temporal workflow execution ID
  // ...
}
```

- **`workflow_config_id`** - references the `Workflow` table; stores which workflow configuration was used for processing
- **`workflow_execution_id`** - the Temporal workflow execution ID (format: `ocr-{documentId}`), used to query live workflow status
- **`workflow_id`** - deprecated legacy field, kept for backward compatibility

### Migration

The workflow table was introduced in migration `20260124001822_workflow_composition`:

```
apps/shared/prisma/migrations/20260124001822_workflow_composition/migration.sql
```

## Type System

The `WorkflowStepsConfig` type is shared across all three layers (frontend, backend, temporal worker). Each layer has its own copy of the interface to avoid cross-package imports:

```typescript
interface StepConfig {
  enabled?: boolean;             // Defaults to true if not specified
  parameters?: Record<string, unknown>;
}

interface WorkflowStepsConfig {
  [key: string]: StepConfig | undefined;
}
```

Step-specific parameter types (defined in the Temporal package):

```typescript
interface PollStepParams {
  maxRetries?: number;           // 1-100
  waitBeforeFirstPoll?: number;  // milliseconds
  waitBetweenPolls?: number;     // milliseconds
}

interface ConfidenceStepParams {
  threshold?: number;            // 0-1
}

interface HumanReviewParams {
  timeout?: number;              // milliseconds
}
```

The canonical list of valid step IDs is defined as `WorkflowStepId` union type and `VALID_WORKFLOW_STEP_IDS` constant array.

## Backend Services

### Workflow CRUD API

**Controller:** `apps/backend-services/src/workflow/workflow.controller.ts`
**Base path:** `/api/workflows`
**Authentication:** Keycloak SSO (all endpoints)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/workflows` | List all workflows for the authenticated user |
| `GET` | `/api/workflows/:id` | Get a specific workflow by ID |
| `POST` | `/api/workflows` | Create a new workflow |
| `PUT` | `/api/workflows/:id` | Update an existing workflow (partial updates) |
| `DELETE` | `/api/workflows/:id` | Delete a workflow |

**Request body for create/update:**

```json
{
  "name": "Invoice Processing",
  "description": "Extract data from vendor invoices",
  "config": {
    "updateStatus": { "enabled": true },
    "prepareFileData": { "enabled": true },
    "submitToAzureOCR": { "enabled": true },
    "updateApimRequestId": { "enabled": true },
    "waitBeforePoll": { "enabled": true, "parameters": { "waitTime": 5000 } },
    "pollOCRResults": {
      "enabled": true,
      "parameters": { "maxRetries": 20, "waitBeforeFirstPoll": 5000, "waitBetweenPolls": 10000 }
    },
    "extractOCRResults": { "enabled": true },
    "postOcrCleanup": { "enabled": true },
    "checkOcrConfidence": { "enabled": true, "parameters": { "threshold": 0.80 } },
    "humanReview": { "enabled": false },
    "storeResults": { "enabled": true }
  }
}
```

**Response format:**

```json
{
  "workflow": {
    "id": "clx...",
    "name": "Invoice Processing",
    "description": "Extract data from vendor invoices",
    "userId": "keycloak-user-id",
    "config": { ... },
    "version": 1,
    "createdAt": "2026-01-24T00:00:00.000Z",
    "updatedAt": "2026-01-24T00:00:00.000Z"
  }
}
```

### Workflow Service

**File:** `apps/backend-services/src/workflow/workflow.service.ts`

Business logic layer that:

- Performs CRUD operations on the `workflows` table via Prisma
- Validates config using `validateWorkflowConfig()` before create/update
- Implements **smart version management**: uses stable JSON stringification (`stableStringify`) to compare old and new configs, only incrementing `version` when the config actually changes semantically (ignoring key order differences)
- Enforces user ownership on get/update/delete operations
- Provides `getWorkflowById()` for internal use by `TemporalClientService` (no user ownership check)

### Workflow Validator

**Backend:** `apps/backend-services/src/workflow/workflow-validator.ts`
**Temporal:** `apps/temporal/src/workflow-config-validator.ts`

Validation is performed in two places (mirrored logic):
1. **Backend** - when saving a workflow configuration via the API
2. **Temporal worker** - at workflow execution time, before processing begins

Validation rules:
- Step IDs must be in the `VALID_WORKFLOW_STEP_IDS` list
- `enabled` must be a boolean (if provided)
- `pollOCRResults.maxRetries` must be 1-100
- `pollOCRResults.waitBeforeFirstPoll` must be >= 0
- `pollOCRResults.waitBetweenPolls` must be >= 0
- `checkOcrConfidence.threshold` must be 0-1
- `humanReview.timeout` must be >= 0

### Document Upload with Workflow Selection

**Controller:** `apps/backend-services/src/upload/upload.controller.ts`
**Endpoint:** `POST /api/upload`

The upload DTO includes optional workflow fields:

```typescript
class UploadDocumentDto {
  title: string;
  file: string;           // base64-encoded file
  file_type: FileType;    // pdf | image | scan
  original_filename?: string;
  metadata?: Record<string, unknown>;
  model_id: string;
  workflow_id?: string;         // @deprecated
  workflow_config_id?: string;  // Reference to Workflow.id
}
```

When a document is uploaded with a `workflow_config_id`:
1. The file is saved and a document record is created with the `workflow_config_id` reference
2. OCR processing is triggered asynchronously (fire-and-forget)
3. The `OcrService` reads the `workflow_config_id` from the document and passes it to `TemporalClientService`

### OCR Service (Workflow Trigger)

**File:** `apps/backend-services/src/ocr/ocr.service.ts`

The `requestOcr()` method:
1. Finds the document record in the database
2. Reads the file from disk and converts to base64
3. Determines file type and content type
4. Reads `workflow_config_id` from the document (falls back to legacy `workflow_id`)
5. Calls `TemporalClientService.startOCRWorkflow()` with the file data and config ID
6. Updates the document with the Temporal `workflow_execution_id`

### Temporal Client Service

**File:** `apps/backend-services/src/temporal/temporal-client.service.ts`

NestJS injectable service that bridges the backend to Temporal:

**Initialization (on module init):**
- Connects to Temporal server (configurable via `TEMPORAL_ADDRESS`, default: `localhost:7233`)
- Ensures the default namespace exists
- Registers custom search attributes: `DocumentId`, `FileName`, `FileType`, `Status`

**Key methods:**

| Method | Description |
|--------|-------------|
| `startOCRWorkflow()` | Looks up workflow config from DB if `workflowConfigId` is provided, filters invalid keys, starts Temporal workflow with search attributes and memo |
| `getWorkflowStatus()` | Returns workflow execution status and result if completed |
| `queryWorkflowStatus()` | Queries the live workflow's `getStatus` query handler |
| `queryWorkflowProgress()` | Queries the live workflow's `getProgress` query handler |
| `cancelWorkflow()` | Sends cancel signal (`graceful` or `immediate` mode) |
| `sendHumanApproval()` | Sends human approval/rejection signal to a workflow awaiting review |

**Workflow start parameters:**
- `taskQueue`: `ocr-processing` (configurable via `TEMPORAL_TASK_QUEUE`)
- `workflowExecutionTimeout`: 30 minutes
- `workflowId`: `ocr-{documentId}`
- Search attributes for Temporal UI filtering
- Memo includes `documentId`, `fileName`, `fileType`, `workflowConfigId`, `workflowVersion`

### Queue Service

**File:** `apps/backend-services/src/queue/queue.service.ts`

Thin delegation layer that calls `OcrService.requestOcr()`. The upload controller calls this in a fire-and-forget pattern so the upload response returns immediately without waiting for OCR completion.

### Module Registration

**File:** `apps/backend-services/src/app.module.ts`

`WorkflowModule` is registered in the root `AppModule`. It is also imported by `TemporalModule` so that `TemporalClientService` can access `WorkflowService` to look up workflow configurations.

```
AppModule
  ├── WorkflowModule (exports WorkflowService)
  ├── TemporalModule (imports WorkflowModule)
  ├── UploadModule
  ├── OcrModule
  ├── QueueModule
  └── ... other modules
```

## Temporal Worker

### Worker Process

**File:** `apps/temporal/src/worker.ts`

Standalone Node.js process that:
- Connects to Temporal server via `NativeConnection`
- Registers the `ocrWorkflow` function via `workflowsPath`
- Registers all activity implementations
- Listens on the `ocr-processing` task queue

Configuration via environment variables:
- `TEMPORAL_ADDRESS` (default: `localhost:7233`)
- `TEMPORAL_NAMESPACE` (default: `default`)
- `TEMPORAL_TASK_QUEUE` (default: `ocr-processing`)

### Workflow Orchestration

**File:** `apps/temporal/src/workflow.ts`

The `ocrWorkflow()` function is the main orchestration entry point. It:

1. **Validates** the provided step configuration using `validateWorkflowConfig()`
2. **Merges** user config with defaults using `mergeWorkflowConfig()` - any step not specified by the user gets the default configuration
3. **Executes steps** sequentially, checking `isStepEnabled()` before each step
4. **Exposes query handlers** for real-time status monitoring:
   - `getStatus` - returns current step, workflow status, confidence, retry count
   - `getProgress` - returns progress percentage based on poll retry count
5. **Handles signals:**
   - `cancel` - supports `graceful` (finish current activity) and `immediate` (abort now) modes
   - `humanApproval` - receives approval/rejection decisions from the HITL system

**Activity retry configuration** (per-activity):

| Activity | Timeout | Max Attempts | Backoff |
|----------|---------|-------------|---------|
| `prepareFileData` | 1 min | 3 | 1s-10s |
| `submitToAzureOCR` | 2 min | 3 | 1s-30s |
| `pollOCRResults` | 30 sec | 5 | 1s-10s |
| `extractOCRResults` | 1 min | 3 | 1s-10s |
| `updateDocumentStatus` | 30 sec | 5 | 1s-10s |
| `storeDocumentRejection` | 30 sec | 5 | 1s-10s |
| `upsertOcrResult` | 2 min | 5 | 1s-30s |
| `postOcrCleanup` | 2 min | 3 | 1s-10s |
| `checkOcrConfidence` | 30 sec | 3 | 1s-10s |

### Default Configuration

**File:** `apps/temporal/src/workflow-config.ts`

The `DEFAULT_WORKFLOW_STEPS` constant defines the out-of-the-box configuration (all 11 steps enabled with sensible defaults). The `mergeWorkflowConfig()` function performs a shallow merge with deep parameter merging - user-specified steps override defaults while unspecified steps keep their default configuration.

### Activities

**File:** `apps/temporal/src/activities.ts`

Ten activity implementations that perform the actual work:

| Activity | What it does |
|----------|-------------|
| `prepareFileData` | Validates input, determines content type, resolves Azure model ID |
| `submitToAzureOCR` | Sends base64 document to Azure Document Intelligence API, returns `apimRequestId` |
| `pollOCRResults` | Polls Azure API using the `apimRequestId`, returns status and response |
| `extractOCRResults` | Parses Azure response into structured `OCRResult` with pages, tables, paragraphs, key-value pairs |
| `updateDocumentStatus` | Updates document status in the database (e.g., `ongoing_ocr`, `failed`, `completed_ocr`) |
| `storeDocumentRejection` | Persists rejection data when a human reviewer rejects the document |
| `upsertOcrResult` | Creates or updates the `OcrResult` record and sets document status to `completed_ocr` |
| `postOcrCleanup` | Text normalization: unicode fixing, dehyphenation, encoding cleanup |
| `checkOcrConfidence` | Calculates average word confidence across all pages, determines if human review is needed |

### Human-in-the-Loop Flow

When `checkOcrConfidence` determines the average confidence is below the configured threshold:

1. Results are stored first (so reviewers can see them)
2. Workflow enters `awaiting_review` status
3. Workflow blocks on `condition(() => humanApproval !== null, timeout)` - a Temporal signal wait
4. The frontend HITL UI shows the document in the review queue
5. A reviewer can approve or reject via the HITL API, which calls `TemporalClientService.sendHumanApproval()`
6. On **approval**: workflow completes successfully
7. On **rejection**: stores rejection data with a `RejectionReason` enum value and fails with `ApplicationFailure` (type: `HUMAN_REVIEW_REJECTED`)
8. On **timeout**: fails with `ApplicationFailure` (type: `HUMAN_REVIEW_TIMEOUT`)

Rejection reasons: `INPUT_QUALITY`, `OCR_FAILURE`, `MODEL_MISMATCH`, `CONFIDENCE_TOO_LOW`, `SYSTEMIC_ERROR`

## Frontend

### Pages

#### WorkflowListPage
**File:** `apps/frontend/src/pages/WorkflowListPage.tsx`

Displays a table of all workflows belonging to the current user. Features:
- Table columns: name, description, version, created date, updated date
- Delete workflow with confirmation modal
- Edit button navigates to WorkflowEditPage
- Create button navigates to WorkflowPage
- Empty state when no workflows exist

**Hooks:** `useWorkflows()`, `useDeleteWorkflow()`

#### WorkflowPage (Create)
**File:** `apps/frontend/src/pages/WorkflowPage.tsx`

Form for creating a new workflow:
- Basic information: name and description inputs
- Step configuration: toggle switches for each of the 11 steps
- Parameter inputs for configurable steps (polling, confidence, timeout)
- Real-time workflow visualization (rendered alongside the form)
- On submit, calls `useCreateWorkflow()` mutation

#### WorkflowEditPage
**File:** `apps/frontend/src/pages/WorkflowEditPage.tsx`

Form for editing an existing workflow:
- Loads workflow data via `useWorkflow(id)` hook
- Same UI as WorkflowPage with pre-populated values
- Displays current version as a badge
- Handles backward compatibility for wrapped config format
- On submit, calls `useUpdateWorkflow()` mutation

### Components

#### WorkflowVisualization
**File:** `apps/frontend/src/components/workflow/WorkflowVisualization.tsx`

SVG-based visual representation of the workflow pipeline:
- Renders all 11 steps as rectangular nodes in a vertical layout
- Main column (left side): 10 steps in sequential order
- Right column: `humanReview` step (conditional branch)
- Connections drawn as edges between steps
- Color coding: green for linear flow, orange for conditional paths (confidence check to human review)
- Enabled steps: green border/fill; disabled steps: grey border/fill
- Dashed lines for connections involving disabled steps
- Legend showing enabled/disabled states

### API Hooks

**File:** `apps/frontend/src/data/hooks/useWorkflows.ts`

React Query hooks that manage server state:

| Hook | Query Key | HTTP Method | Endpoint |
|------|-----------|-------------|----------|
| `useWorkflows()` | `["workflows"]` | GET | `/workflows` |
| `useWorkflow(id)` | `["workflow", id]` | GET | `/workflows/{id}` |
| `useCreateWorkflow()` | - | POST | `/workflows` |
| `useUpdateWorkflow()` | - | PUT | `/workflows/{id}` |
| `useDeleteWorkflow()` | - | DELETE | `/workflows/{id}` |

Mutations automatically invalidate relevant queries on success.

### Types

**File:** `apps/frontend/src/types/workflow.ts`

Frontend copy of `StepConfig` and `WorkflowStepsConfig` interfaces.

### Navigation

The app uses state-based routing (not file-based). Workflow views:
- `"workflows"` + `"list"` renders `WorkflowListPage`
- `"workflows"` + `"create"` renders `WorkflowPage`
- `"workflows"` + `"edit"` renders `WorkflowEditPage` (requires `selectedWorkflowId`)

### Document Upload Integration

When uploading a document via the `DocumentUploadPanel`, users can optionally select a workflow. The selected workflow's ID is sent as `workflow_config_id` in the upload request, linking the document to that workflow configuration for processing.

## End-to-End Data Flow

### 1. Creating a Workflow

```
User fills form in WorkflowPage
  → useCreateWorkflow() mutation
  → POST /api/workflows { name, description, config }
  → WorkflowController.createWorkflow()
  → WorkflowService.createWorkflow()
    → validateWorkflowConfig(config)
    → prisma.workflow.create()
  → Returns { workflow: WorkflowInfo }
```

### 2. Processing a Document with a Workflow

```
User uploads document with workflow_config_id
  → POST /api/upload { file, title, file_type, model_id, workflow_config_id }
  → UploadController.uploadDocument()
    → DocumentService.uploadDocument() (saves file, creates document record with workflow_config_id)
    → QueueService.processOcrForDocument() (fire-and-forget)
      → OcrService.requestOcr(documentId)
        → Reads file from disk, converts to base64
        → Reads workflow_config_id from document record
        → TemporalClientService.startOCRWorkflow(documentId, fileData, steps, workflowConfigId)
          → WorkflowService.getWorkflowById(workflowConfigId)
          → Extracts and filters config from database record
          → client.workflow.start("ocrWorkflow", { args: [input], taskQueue, ... })
        → Updates document with workflow_execution_id
  → Returns { success, document }
```

### 3. Temporal Worker Execution

```
Temporal server dispatches task to worker
  → ocrWorkflow(input) executes
    → validateWorkflowConfig(input.steps)
    → mergeWorkflowConfig(input.steps) (fills in defaults)
    → For each enabled step:
        → Call activity (e.g., submitToAzureOCR, pollOCRResults)
        → Check for cancellation signals
    → If confidence < threshold and humanReview enabled:
        → Store results first
        → Wait for humanApproval signal (up to timeout)
    → Return OCRResult
```

### 4. Monitoring Workflow Status

```
Frontend polls document status
  → GET /api/documents
  → DocumentController checks workflow_execution_id
  → TemporalClientService.queryWorkflowStatus(workflowExecutionId)
    → handle.query("getStatus")
  → Returns { currentStep, status, retryCount, maxRetries, ... }
```

## File Reference

### Database

| File | Purpose |
|------|---------|
| `apps/shared/prisma/schema.prisma` | Prisma schema with Workflow and Document models |
| `apps/shared/prisma/migrations/20260124001822_workflow_composition/migration.sql` | Migration creating workflows table and document workflow fields |

### Backend Services (`apps/backend-services/src/`)

| File | Purpose |
|------|---------|
| `workflow/workflow.module.ts` | NestJS module registration |
| `workflow/workflow.controller.ts` | REST API endpoints (CRUD) |
| `workflow/workflow.service.ts` | Business logic, Prisma operations, version management |
| `workflow/workflow-validator.ts` | Configuration validation rules |
| `workflow/workflow-types.ts` | `StepConfig` and `WorkflowStepsConfig` interfaces |
| `workflow/dto/create-workflow.dto.ts` | Request DTO with class-validator decorators |
| `workflow/dto/workflow-info.dto.ts` | Response DTOs with Swagger decorators |
| `temporal/temporal-client.service.ts` | Temporal client: starts workflows, sends signals, queries status |
| `temporal/temporal.module.ts` | NestJS module importing WorkflowModule |
| `temporal/workflow-constants.ts` | `VALID_WORKFLOW_STEP_IDS` array |
| `temporal/workflow-types.ts` | `WORKFLOW_TYPES` constant |
| `ocr/ocr.service.ts` | Reads document, starts Temporal workflow |
| `queue/queue.service.ts` | Delegates OCR processing to OcrService |
| `upload/upload.controller.ts` | Document upload endpoint, accepts `workflow_config_id` |
| `upload/dto/upload-document.dto.ts` | Upload DTO with `workflow_config_id` field |
| `document/document.service.ts` | Stores document records with workflow references |
| `document/document.controller.ts` | Document queries, checks Temporal workflow status |
| `app.module.ts` | Root module registering WorkflowModule |

### Backend Tests

| File | Purpose |
|------|---------|
| `workflow/workflow.controller.spec.ts` | Controller unit tests (all 5 CRUD endpoints) |
| `workflow/workflow.service.spec.ts` | Service unit tests (config comparison, versioning, validation) |
| `workflow/workflow-validator.spec.ts` | Validator unit tests (parameter ranges, step ID validation) |

### Temporal Worker (`apps/temporal/src/`)

| File | Purpose |
|------|---------|
| `worker.ts` | Worker process entry point, registers workflows and activities |
| `workflow.ts` | `ocrWorkflow()` orchestration function (11 steps, queries, signals) |
| `activities.ts` | 10 activity implementations (Azure API calls, database operations) |
| `types.ts` | All type definitions: `WorkflowStepId`, `OCRWorkflowInput`, `OCRResult`, signals, etc. |
| `workflow-config.ts` | `DEFAULT_WORKFLOW_STEPS` and `mergeWorkflowConfig()` |
| `workflow-config-validator.ts` | Configuration validator (mirrored from backend) |
| `client.ts` | Standalone client functions for starting workflows |
| `example.ts` | Example script demonstrating workflow execution |

### Temporal Worker Tests

| File | Purpose |
|------|---------|
| `workflow.integration.test.ts` | Integration tests with TestWorkflowEnvironment |
| `workflow.replay.test.ts` | Replay/determinism tests from recorded history |
| `test/mock-activities.ts` | Mock activity implementations for testing |

### Frontend (`apps/frontend/src/`)

| File | Purpose |
|------|---------|
| `pages/WorkflowListPage.tsx` | Workflow list with table, delete, edit, create actions |
| `pages/WorkflowPage.tsx` | Create workflow form with step toggles and parameters |
| `pages/WorkflowEditPage.tsx` | Edit workflow form with pre-populated values |
| `components/workflow/WorkflowVisualization.tsx` | SVG visualization of workflow pipeline |
| `data/hooks/useWorkflows.ts` | React Query hooks for workflow CRUD operations |
| `types/workflow.ts` | `StepConfig` and `WorkflowStepsConfig` interfaces |
| `components/upload/DocumentUploadPanel.tsx` | Document upload with optional workflow selection |
| `App.tsx` | Route definitions including workflow views |

## Environment Configuration

| Variable | Default | Used By | Description |
|----------|---------|---------|-------------|
| `TEMPORAL_ADDRESS` | `localhost:7233` | Backend + Worker | Temporal server gRPC address |
| `TEMPORAL_NAMESPACE` | `default` | Backend + Worker | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | `ocr-processing` | Backend + Worker | Task queue name |
| `DATABASE_URL` | - | Backend + Worker | PostgreSQL connection string |
