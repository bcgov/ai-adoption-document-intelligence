# Template Training Architecture

## Overview

The Template Training system enables organizations to create custom AI models tailored to their specific document types and field extraction needs. Instead of relying on generic prebuilt models (like "prebuilt-layout"), users can train custom models optimized for their unique documents using Azure Document Intelligence's custom model training capabilities.

## Core Concepts

### What is Template Training?

**Template training** is the process of creating a custom OCR model by training Azure Document Intelligence on a labeled dataset of example documents. The key characteristics:

- **Training Data**: Manually labeled documents with field definitions
- **Build Mode**: Uses Azure's `"template"` buildMode - a template-based approach where the model learns field positions and patterns from examples
- **Custom Model Output**: A trained model with a unique model ID that can extract specific fields from similar documents
- **Purpose**: Achieve higher accuracy for domain-specific documents vs. generic prebuilt models

### Training vs Processing

```
TRAINING PHASE (one-time):
  Labeled Documents → Training Job → Custom Model (model_id)

PROCESSING PHASE (ongoing):
  New Documents → OCR with custom model_id → Extracted Fields
```

### Template vs Prebuilt Models

| Aspect | Prebuilt Models | Template Models |
|--------|----------------|-----------------|
| Setup | None - ready to use | Requires labeling + training |
| Accuracy | Generic - works for many doc types | Optimized for specific doc types |
| Fields | Fixed fields per model type | Custom fields you define |
| Example | `prebuilt-invoice`, `prebuilt-layout` | `my-custom-invoice-model` |
| Use Case | Quick start, diverse documents | Specialized workflows, high accuracy needs |

## Data Model

### Database Schema

```prisma
model LabelingProject {
  id              String            @id @default(cuid())
  name            String
  description     String?
  created_by      String
  created_at      DateTime          @default(now())
  updated_at      DateTime          @updatedAt
  status          ProjectStatus     @default(active)
  field_schema    FieldDefinition[]
  documents       LabeledDocument[]
  training_jobs   TrainingJob[]
  trained_models  TrainedModel[]

  @@map("labeling_projects")
}

model FieldDefinition {
  field_key       String
  field_type      FieldType         // string | number | date | selectionMark | signature
  field_format    String?           // For dates: "MM/DD/YYYY"
}

model LabeledDocument {
  id                      String            @id @default(cuid())
  project_id              String
  project                 LabelingProject   @relation(fields: [project_id], references: [id])
  labeling_document_id    String
  labeling_document       Document          @relation(fields: [labeling_document_id], references: [id])
  status                  LabelStatus       @default(unlabeled)
  labels                  DocumentLabel[]
  ocr_data                Json?
  created_at              DateTime          @default(now())
  updated_at              DateTime          @updatedAt

  @@map("labeled_documents")
}

model DocumentLabel {
  id              String           @id @default(cuid())
  document_id     String
  document        LabeledDocument  @relation(fields: [document_id], references: [id], onDelete: Cascade)
  field_key       String
  value           String?
  page_number     Int
  bounding_box    Json?            // { x, y, width, height }
  created_at      DateTime         @default(now())

  @@map("document_labels")
}

model TrainingJob {
  id              String           @id @default(cuid())
  project_id      String
  project         LabelingProject  @relation(fields: [project_id], references: [id])
  status          TrainingStatus   @default(PENDING)
  container_name  String?
  sas_url         String?
  blob_count      Int?
  model_id        String
  operation_id    String?
  error_message   String?
  started_at      DateTime         @default(now())
  completed_at    DateTime?
  trained_models  TrainedModel[]

  @@map("training_jobs")
}

model TrainedModel {
  id              String           @id @default(cuid())
  project_id      String
  project         LabelingProject  @relation(fields: [project_id], references: [id])
  training_job_id String
  training_job    TrainingJob      @relation(fields: [training_job_id], references: [id])
  model_id        String           @unique
  description     String?
  doc_types       Json?
  field_count     Int?
  created_at      DateTime         @default(now())

  @@map("trained_models")
}

enum ProjectStatus {
  active
  archived
  training
}

enum LabelStatus {
  unlabeled
  in_progress
  labeled
  reviewed
}

enum TrainingStatus {
  PENDING      // Job created, not started
  UPLOADING    // Uploading files to Azure Blob
  UPLOADED     // Files uploaded successfully
  TRAINING     // Azure is training the model
  SUCCEEDED    // Training completed successfully
  FAILED       // Training failed
}

enum FieldType {
  string
  number
  date
  selectionMark
  signature
  table
}
```

### Key Relationships

- **LabelingProject** is the container for the entire training dataset
- **FieldDefinition** defines the schema (what fields to extract)
- **LabeledDocument** links project documents with their labels
- **DocumentLabel** stores individual field extractions with bounding boxes
- **TrainingJob** represents one training execution attempt
- **TrainedModel** is the successful output artifact with metadata

## Training Process - Complete Flow

### Phase 1: Project Setup

```
User creates LabelingProject
      ↓
POST /api/labeling/projects
  { name, description }
      ↓
INSERT INTO labeling_projects
      ↓
Define field schema
      ↓
POST /api/labeling/projects/{id}/fields
  { fields: [
    { field_key: "invoice_number", field_type: "string" },
    { field_key: "total_amount", field_type: "number" },
    { field_key: "invoice_date", field_type: "date", field_format: "MM/DD/YYYY" }
  ]}
      ↓
UPDATE labeling_projects SET field_schema = [...]
```

### Phase 2: Document Labeling

```
Add documents to project
      ↓
POST /api/labeling/projects/{id}/documents
  { documentIds: ["doc1", "doc2", ...] }
      ↓
INSERT INTO labeled_documents (project_id, labeling_document_id, status='unlabeled')
      ↓
User opens labeling interface
      ↓
Frontend displays document image + field list
      ↓
User draws bounding boxes and extracts text for each field
      ↓
POST /api/labeling/projects/{projectId}/documents/{docId}/labels
  { labels: [
    { field_key: "invoice_number", value: "INV-12345", page_number: 1, bounding_box: {...} },
    { field_key: "total_amount", value: "1000.00", page_number: 1, bounding_box: {...} }
  ]}
      ↓
INSERT INTO document_labels (...)
UPDATE labeled_documents SET status='labeled'
      ↓
Repeat for minimum 5 documents (TRAINING_MIN_DOCUMENTS)
```

### Phase 3: Validation

```
Frontend: TrainingPanel.tsx
      ↓
GET /api/training/projects/{id}/validate
      ↓
TrainingService.validateTrainingData()
      ↓
Checks:
  1. Project has field_schema defined? ✓
  2. Labeled documents >= minimum (5)? ✓
  3. Each labeled document has labels? ✓
      ↓
Returns ValidationResultDto:
  {
    valid: true/false,
    labeledDocumentsCount: 7,
    minimumRequired: 5,
    issues: []
  }
      ↓
Frontend shows "Training Readiness" status
```

### Phase 4: Start Training

```
User clicks "Start Training"
      ↓
User enters Model ID and Description
  - Model ID format: 2-64 chars, alphanumeric + ._~-
  - Example: "my-invoice-model-v1"
      ↓
POST /api/training/projects/{id}/train
  { modelId: "my-invoice-model-v1", description: "Invoice model trained on 2024 data" }
      ↓
TrainingController.startTraining()
      ↓
TrainingService.startTraining()
  1. Validate training data
  2. Check if model already exists → delete old model
  3. Create TrainingJob record (status: PENDING)
  4. Trigger async uploadAndTrain()
  5. Return job immediately
      ↓
INSERT INTO training_jobs (project_id, model_id, status='PENDING', started_at=NOW())
      ↓
Response: TrainingJobDto
      ↓
Frontend starts polling every 5 seconds
```

### Phase 5: Upload & Train (Async Background Process)

```
uploadAndTrain() starts
      ↓
UPDATE training_jobs SET status='UPLOADING'
      ↓
Prepare training files:
  - exportProject() generates files
  - fields.json (field definitions)
  - For each document:
    - {filename}.pdf (or image)
    - {filename}.pdf.ocr.json (OCR results)
    - {filename}.pdf.labels.json (user labels in Azure format)
      ↓
Upload to Azure Blob Storage:
  - Container: training-{projectId}
  - Generate SAS URL (read/list permissions, 7-day expiry)
  - Upload all files
      ↓
UPDATE training_jobs SET
  status='UPLOADED',
  container_name='training-{projectId}',
  sas_url='https://...?sas=...',
  blob_count=15
      ↓
Validate SAS URL and blob contents:
  - Check fields.json exists
  - Check *.labels.json files exist
      ↓
Submit to Azure Document Intelligence:
POST https://{endpoint}/documentintelligence/documentModels:build?api-version=2024-11-30
  {
    "modelId": "my-invoice-model-v1",
    "description": "Invoice model trained on 2024 data",
    "buildMode": "template",  ← KEY: tells Azure this is template-based training
    "azureBlobSource": {
      "containerUrl": "https://...?sas=..."
    }
  }
      ↓
Azure responds with operation_id
      ↓
UPDATE training_jobs SET
  status='TRAINING',
  operation_id='{operation_id}'
```

### Phase 6: Polling & Completion

```
TrainingPollerService (runs every 10 seconds via @Cron)
      ↓
Find all jobs with status IN ('TRAINING', 'UPLOADED')
      ↓
For each job:
  GET https://{endpoint}/documentintelligence/operations/{operationId}?api-version=2024-11-30
      ↓
  Azure response:
    {
      "status": "running" | "succeeded" | "failed",
      "result": { ... }  // Only present when succeeded
    }
      ↓
  If status = "succeeded":
    ↓
    Fetch model details:
    GET https://{endpoint}/documentintelligence/documentModels/{modelId}?api-version=2024-11-30
      ↓
    Azure returns model metadata:
      {
        "modelId": "my-invoice-model-v1",
        "description": "...",
        "docTypes": {
          "document": {
            "fieldSchema": {
              "invoice_number": { "type": "string" },
              "total_amount": { "type": "number" },
              ...
            }
          }
        }
      }
      ↓
    Count fields in fieldSchema
      ↓
    INSERT INTO trained_models (
      project_id,
      training_job_id,
      model_id='my-invoice-model-v1',
      description='...',
      doc_types={...},
      field_count=3,
      created_at=NOW()
    )
      ↓
    UPDATE training_jobs SET
      status='SUCCEEDED',
      completed_at=NOW()
      ↓
    Frontend polling detects completion
      ↓
    Display in "Trained Models" table

  If status = "failed":
    ↓
    UPDATE training_jobs SET
      status='FAILED',
      error_message='...',
      completed_at=NOW()
```

### Phase 7: Using the Trained Model

```
User uploads new document for processing
      ↓
POST /api/upload
  {
    file: base64_data,
    model_id: "my-invoice-model-v1"  ← Use trained model instead of prebuilt
  }
      ↓
Document record created with model_id
      ↓
OCR processing triggered (Temporal workflow)
      ↓
Temporal Activity: submitToAzureOCR()
  POST https://{endpoint}/documentintelligence/documentModels/my-invoice-model-v1:analyze
      ↓
Azure analyzes using custom model
      ↓
Temporal Activity: pollOCRResults()
  GET https://{endpoint}/documentintelligence/documentModels/my-invoice-model-v1/analyzeResults/{apimRequestId}
      ↓
Azure returns results with custom fields:
  {
    "analyzeResult": {
      "documents": [
        {
          "docType": "document",
          "fields": {
            "invoice_number": { "content": "INV-12345", "confidence": 0.98 },
            "total_amount": { "content": "1000.00", "confidence": 0.95 },
            ...
          }
        }
      ]
    }
  }
      ↓
Store in Document.ocr_results
```

## API Endpoints

### Training Management

| Method | Endpoint | Purpose | Request Body | Response |
|--------|----------|---------|--------------|----------|
| `GET` | `/api/training/projects/:projectId/validate` | Check if project is ready for training | - | `ValidationResultDto` |
| `POST` | `/api/training/projects/:projectId/train` | Start training job | `{ modelId, description? }` | `TrainingJobDto` |
| `GET` | `/api/training/projects/:projectId/jobs` | List all training jobs for project | - | `TrainingJobDto[]` |
| `GET` | `/api/training/jobs/:jobId` | Get specific job details | - | `TrainingJobDto` |
| `DELETE` | `/api/training/jobs/:jobId` | Cancel running job | - | `{ success: true }` |
| `GET` | `/api/training/projects/:projectId/models` | List trained models for project | - | `TrainedModelDto[]` |

### Labeling Project Management

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/labeling/projects` | Create new project |
| `GET` | `/api/labeling/projects` | List all projects |
| `GET` | `/api/labeling/projects/:id` | Get project details |
| `PATCH` | `/api/labeling/projects/:id` | Update project |
| `DELETE` | `/api/labeling/projects/:id` | Delete project |
| `POST` | `/api/labeling/projects/:id/fields` | Define field schema |
| `POST` | `/api/labeling/projects/:id/documents` | Add documents to project |
| `POST` | `/api/labeling/projects/:projectId/documents/:docId/labels` | Save labels for document |

## Frontend Architecture

### Key Components

**[TrainingPanel.tsx](../apps/frontend/src/features/annotation/labeling/TrainingPanel.tsx)**
- Main UI for training operations
- Displays training readiness validation
- Form to input Model ID and Description
- Real-time job status updates
- Tables showing training jobs and trained models

**[LabelingWorkspace.tsx](../apps/frontend/src/features/annotation/labeling/LabelingWorkspace.tsx)**
- Document labeling interface
- Displays document image with zoom/pan controls
- Field list from project schema
- Bounding box drawing and text extraction
- Label saving functionality

### Key Hooks

**[useTraining.ts](../apps/frontend/src/features/annotation/labeling/hooks/useTraining.ts)**
- Manages all training-related queries and mutations
- **Queries**:
  - `training-validation`: Checks project readiness
  - `training-jobs`: Lists all jobs for project
  - `trained-models`: Lists successfully trained models
- **Mutations**:
  - `startTraining(modelId, description)`: Initiates training
  - `cancelJob(jobId)`: Cancels running job
- **Auto-polling**: Every 5 seconds when jobs are in progress
- **Cache management**: Invalidates on mutations

**[useLabeling.ts](../apps/frontend/src/features/annotation/labeling/hooks/useLabeling.ts)**
- Manages labeling project operations
- CRUD operations for projects
- Field schema management
- Document labeling operations

### Types

```typescript
enum TrainingStatus {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING',
  UPLOADED = 'UPLOADED',
  TRAINING = 'TRAINING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED'
}

interface TrainingJob {
  id: string;
  projectId: string;
  status: TrainingStatus;
  containerName?: string;
  sasUrl?: string;
  blobCount?: number;
  modelId: string;
  operationId?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

interface TrainedModel {
  id: string;
  projectId: string;
  trainingJobId: string;
  modelId: string;
  description?: string;
  docTypes?: any;
  fieldCount?: number;
  createdAt: string;
}

interface ValidationResult {
  valid: boolean;
  labeledDocumentsCount: number;
  minimumRequired: number;
  issues: string[];
}
```

## Backend Architecture

### Key Services

**[training.controller.ts](../apps/backend-services/src/training/training.controller.ts)**
- REST API endpoints for training operations
- Request validation and authentication
- `@ApiKeyAuth()` and `@KeycloakSSOAuth()` decorators
- Extracts userId from auth token

**[training.service.ts](../apps/backend-services/src/training/training.service.ts)**
- Core business logic for training workflow
- **Key Methods**:
  - `validateTrainingData()`: Checks project readiness
  - `startTraining()`: Orchestrates training initiation
  - `uploadAndTrain()`: Async file upload and Azure submission
  - `prepareTrainingFiles()`: Exports project to Azure format
  - `deleteAzureModel()`: Removes existing model before retraining
  - `getTrainingJobs()`, `getTrainedModels()`: Query operations

**[training-poller.service.ts](../apps/backend-services/src/training/training-poller.service.ts)**
- Background service with `@Cron(CronExpression.EVERY_10_SECONDS)`
- Polls Azure operation status for in-progress jobs
- Updates job status based on Azure response
- Creates TrainedModel records on success
- Handles timeouts and errors

**[azure-blob.service.ts](../apps/backend-services/src/training/azure-blob.service.ts)**
- Manages Azure Blob Storage operations
- Creates containers with proper naming
- Uploads files to blob storage
- Generates SAS URLs with expiration
- Validates blob contents before training

**[export.service.ts](../apps/backend-services/src/labeling/export.service.ts)**
- Exports labeling project to Azure training format
- Generates `fields.json` from field schema
- Exports each document with:
  - Original file (PDF/image)
  - `{filename}.ocr.json` (OCR results)
  - `{filename}.labels.json` (user labels in Azure format)

## Azure Integration

### Azure Document Intelligence API

**Training Endpoint**:
```
POST https://{endpoint}/documentintelligence/documentModels:build?api-version=2024-11-30

Headers:
  Ocp-Apim-Subscription-Key: {API_KEY}
  Content-Type: application/json

Body:
{
  "modelId": "my-invoice-model-v1",
  "description": "Custom invoice model",
  "buildMode": "template",  ← KEY PARAMETER
  "azureBlobSource": {
    "containerUrl": "https://...?sas=..."
  }
}

Response:
{
  "operationId": "...",
  "status": "running",
  "createdDateTime": "...",
  ...
}
```

**Operation Polling**:
```
GET https://{endpoint}/documentintelligence/operations/{operationId}?api-version=2024-11-30

Response (when succeeded):
{
  "status": "succeeded",
  "result": {
    "modelId": "my-invoice-model-v1",
    "description": "...",
    "createdDateTime": "...",
    ...
  }
}
```

**Model Metadata**:
```
GET https://{endpoint}/documentintelligence/documentModels/{modelId}?api-version=2024-11-30

Response:
{
  "modelId": "my-invoice-model-v1",
  "description": "Custom invoice model",
  "createdDateTime": "...",
  "docTypes": {
    "document": {
      "fieldSchema": {
        "invoice_number": { "type": "string" },
        "total_amount": { "type": "number" },
        "invoice_date": { "type": "date" }
      }
    }
  }
}
```

**Document Analysis with Custom Model**:
```
POST https://{endpoint}/documentintelligence/documentModels/{modelId}:analyze?api-version=2024-11-30

Response:
{
  "analyzeResult": {
    "documents": [
      {
        "docType": "document",
        "fields": {
          "invoice_number": { "content": "INV-12345", "confidence": 0.98 },
          "total_amount": { "content": "1000.00", "confidence": 0.95 }
        }
      }
    ]
  }
}
```

### Azure Blob Storage Format

**Container Structure**:
```
training-{projectId}/
├─ fields.json                    ← Field definitions
├─ invoice-001.pdf                ← Original document
├─ invoice-001.pdf.ocr.json       ← OCR results from Azure
├─ invoice-001.pdf.labels.json    ← User labels
├─ invoice-002.pdf
├─ invoice-002.pdf.ocr.json
├─ invoice-002.pdf.labels.json
└─ ...
```

**fields.json Format**:
```json
{
  "fields": [
    {
      "fieldKey": "invoice_number",
      "fieldType": "string"
    },
    {
      "fieldKey": "total_amount",
      "fieldType": "number"
    },
    {
      "fieldKey": "invoice_date",
      "fieldType": "date",
      "fieldFormat": "MM/DD/YYYY"
    }
  ]
}
```

**{filename}.labels.json Format**:
```json
{
  "document": "{filename}.pdf",
  "labels": [
    {
      "key": "invoice_number",
      "value": [
        {
          "page": 1,
          "text": "INV-12345",
          "boundingBoxes": [
            [
              { "x": 100, "y": 200 },
              { "x": 200, "y": 200 },
              { "x": 200, "y": 220 },
              { "x": 100, "y": 220 }
            ]
          ]
        }
      ]
    }
  ]
}
```

## Configuration

### Environment Variables

```bash
# Azure Document Intelligence
AZURE_DOCUMENT_INTELLIGENCE_TRAIN_ENDPOINT=https://your-resource.cognitiveservices.azure.com
AZURE_DOCUMENT_INTELLIGENCE_API_KEY=your-api-key

# Azure Blob Storage (for training data)
AZURE_STORAGE_ACCOUNT_NAME=your-storage-account
AZURE_STORAGE_ACCOUNT_KEY=your-storage-key

# Training Configuration
TRAINING_MIN_DOCUMENTS=5                    # Minimum labeled documents required
TRAINING_SAS_EXPIRY_DAYS=7                  # SAS URL expiration (days)
TRAINING_POLL_INTERVAL_SECONDS=10           # How often to poll Azure (seconds)
TRAINING_MAX_POLL_ATTEMPTS=60               # Max polling attempts (~10 minutes)
```

### Validation Rules

- **Minimum Documents**: Default 5 labeled documents (configurable via `TRAINING_MIN_DOCUMENTS`)
- **Model ID Format**: `^[a-zA-Z0-9][a-zA-Z0-9._~-]{1,63}$` (2-64 characters, alphanumeric + `._~-`)
- **Field Schema**: Project must have at least one field defined
- **Labels**: Each labeled document must have at least one label
- **SAS URL**: Must be valid and accessible by Azure
- **Blob Contents**: Must include `fields.json` and `*.labels.json` files

## Use Cases

### Basic Training Workflow

1. **Project Setup**
   - Create labeling project: "Invoice Processing Q1 2024"
   - Define fields: invoice_number, total_amount, invoice_date, vendor_name

2. **Labeling Phase**
   - Upload 10 sample invoice documents
   - Open each document in labeling interface
   - Draw bounding boxes around each field
   - Extract text for each field
   - Save labels

3. **Training Initiation**
   - Navigate to Training Panel
   - Check validation: "7 documents labeled (minimum 5 required) ✓"
   - Enter Model ID: "invoice-model-2024-q1"
   - Enter Description: "Custom invoice model trained on Q1 2024 invoices"
   - Click "Start Training"

4. **Monitor Progress**
   - Watch job status: PENDING → UPLOADING → UPLOADED → TRAINING
   - Wait ~5-10 minutes for Azure training
   - Status changes to SUCCEEDED
   - Trained model appears in "Trained Models" table

5. **Use Trained Model**
   - Upload new invoices with `model_id: "invoice-model-2024-q1"`
   - OCR extracts fields with high accuracy
   - Review results in HITL workflow if needed

### Retraining Workflow

1. **Identify Need for Retraining**
   - HITL analytics show low confidence on certain fields
   - New document format variations discovered

2. **Add More Training Data**
   - Add 5 more documents to existing project
   - Label the new documents
   - Ensure coverage of problematic cases

3. **Retrain Model**
   - Navigate to Training Panel
   - Enter same Model ID: "invoice-model-2024-q1" (or increment version)
   - System deletes old model and trains new one
   - New model replaces old model with same ID

### Multi-Model Strategy

1. **Create Specialized Models**
   - Project 1: "Standard Invoices" → `invoice-standard-v1`
   - Project 2: "Medical Invoices" → `invoice-medical-v1`
   - Project 3: "Government Forms" → `govt-form-sdpr-v1`

2. **Route Documents to Correct Model**
   - Document classification determines doc type
   - Upload API receives `model_id` based on classification
   - Each document processes with optimal model

## Design Rationale

### Why Template-Based Training?

Azure Document Intelligence offers two build modes:
- **Template**: Position-based, learns field locations from examples
- **Neural**: Content-based, understands context and semantics

Template mode was chosen because:
- **Predictability**: Works well for structured forms with consistent layouts
- **Data Efficiency**: Requires fewer training examples (5 vs 15+)
- **Speed**: Faster training time
- **Cost**: Lower training costs
- **Use Case Fit**: Government forms and invoices are highly structured

### Why Async Training Process?

Training jobs are async because:
- **Duration**: Azure training takes 5-10 minutes
- **User Experience**: Users shouldn't wait for HTTP response
- **Reliability**: Background process can retry and handle failures
- **Scalability**: Multiple training jobs can run concurrently
- **Monitoring**: Polling service provides status updates

### Why Polling Instead of Webhooks?

Polling was chosen over Azure webhooks because:
- **Simplicity**: No need for public webhook endpoints
- **Control**: Can adjust polling frequency based on load
- **Reliability**: Polling is more resilient to network issues
- **Consistency**: Works in all deployment environments (dev, staging, prod)

### Why Minimum 5 Documents?

Azure recommends 5+ training documents because:
- **Variance**: Captures variations in layout and content
- **Accuracy**: Model learns patterns vs memorizing single examples
- **Generalization**: Better performance on unseen documents
- **Quality**: Below 5 documents often produces unreliable models

### Why Delete Existing Model on Retrain?

Deleting before retraining because:
- **Azure Limit**: Can't have duplicate model IDs
- **Atomic Update**: Ensures model ID always points to latest version
- **Simplicity**: Avoids versioning complexity for users
- **Use Case**: Retraining is typically for improvement, not A/B testing

## Error Handling

### Common Errors and Resolutions

| Error | Cause | Resolution |
|-------|-------|------------|
| "Minimum 5 documents required" | Not enough labeled documents | Label more documents |
| "Field schema not defined" | Project has no fields | Define field schema |
| "Model ID already exists" | Model ID in use | System auto-deletes before training |
| "SAS URL validation failed" | Blob upload failed | Check Azure storage credentials |
| "Training timeout" | Azure took too long | Check Azure status, may retry |
| "Invalid model ID format" | Model ID has invalid chars | Use alphanumeric + `._~-` only |

### Error Recovery

- **Upload Failures**: Job status set to FAILED with error message, user can retry
- **Training Failures**: Error message stored, user can fix issues and retrain
- **Polling Timeouts**: After 60 attempts (~10 min), job marked FAILED
- **Network Issues**: Poller retries on next cron execution (10 seconds)

## Performance Considerations

### Training Time

- **Upload Phase**: ~30 seconds for 10 documents
- **Azure Training**: ~5-10 minutes for template mode
- **Total**: ~10-15 minutes end-to-end

### Polling Load

- **Frequency**: Every 10 seconds
- **Queries**: One per in-progress job
- **Optimization**: Only polls jobs in TRAINING or UPLOADED status

### Blob Storage Costs

- **Storage**: Minimal, training data deleted after 7 days (SAS expiry)
- **Transfer**: One-time upload per training job
- **Access**: Azure reads once during training

## Implementation Files

### Database
- **Schema**: [apps/shared/prisma/schema.prisma](../apps/shared/prisma/schema.prisma)
- **Migration**: [apps/shared/prisma/migrations/20260124063638_add_training_tables/](../apps/shared/prisma/migrations/20260124063638_add_training_tables/)

### Backend
- **Training Controller**: [apps/backend-services/src/training/training.controller.ts](../apps/backend-services/src/training/training.controller.ts)
- **Training Service**: [apps/backend-services/src/training/training.service.ts](../apps/backend-services/src/training/training.service.ts)
- **Poller Service**: [apps/backend-services/src/training/training-poller.service.ts](../apps/backend-services/src/training/training-poller.service.ts)
- **Blob Service**: [apps/backend-services/src/training/azure-blob.service.ts](../apps/backend-services/src/training/azure-blob.service.ts)
- **Export Service**: [apps/backend-services/src/labeling/export.service.ts](../apps/backend-services/src/labeling/export.service.ts)

### Frontend
- **Training Panel**: [apps/frontend/src/features/annotation/labeling/TrainingPanel.tsx](../apps/frontend/src/features/annotation/labeling/TrainingPanel.tsx)
- **Labeling Workspace**: [apps/frontend/src/features/annotation/labeling/LabelingWorkspace.tsx](../apps/frontend/src/features/annotation/labeling/LabelingWorkspace.tsx)
- **Training Hook**: [apps/frontend/src/features/annotation/labeling/hooks/useTraining.ts](../apps/frontend/src/features/annotation/labeling/hooks/useTraining.ts)
- **Labeling Hook**: [apps/frontend/src/features/annotation/labeling/hooks/useLabeling.ts](../apps/frontend/src/features/annotation/labeling/hooks/useLabeling.ts)
- **Types**: [apps/frontend/src/features/annotation/labeling/types.ts](../apps/frontend/src/features/annotation/labeling/types.ts)

### OCR Integration
- **OCR Service**: [apps/backend-services/src/ocr/ocr.service.ts](../apps/backend-services/src/ocr/ocr.service.ts)
- **Temporal Activities**: [apps/temporal/src/activities.ts](../apps/temporal/src/activities.ts)

## Future Enhancements

Potential areas for expansion:
- **Neural Build Mode**: Support for content-based training (requires more data)
- **Incremental Training**: Add new examples without full retrain
- **Model Versioning**: A/B testing with multiple model versions
- **Active Learning**: Suggest documents to label based on uncertainty
- **Auto-Labeling**: Pre-fill labels using existing models for faster labeling
- **Quality Metrics**: Track model accuracy over time
- **Model Marketplace**: Share models across projects/teams
- **Batch Training**: Train multiple models simultaneously
- **Training Webhooks**: Real-time status updates via Azure Event Grid
