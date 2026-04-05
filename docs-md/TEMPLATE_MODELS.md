# Template Models

## Overview

Template Models enable organizations to train custom Azure Document Intelligence models for domain-specific field extraction. Instead of relying on generic prebuilt models (like `prebuilt-layout`), users create a Template Model, define its field schema, label example documents, and train the model. Once trained, the model appears in the processing model dropdown for document uploads.

The system follows a **model-first** architecture: the Template Model is the primary entity. Training is an operation on a model, not a way to produce a model from a project.

## Core Concepts

- **Template Model**: The primary entity. Has a display `name` and an auto-generated Azure-safe `model_id` (immutable after creation).
- **Field Schema**: User-defined fields the model should extract (e.g., `invoice_number`, `total_amount`, `date`).
- **Labeled Documents**: Example documents with manually annotated field values and bounding boxes.
- **Training Job**: An async process that uploads labeled data to Azure and trains the custom model.
- **Trained Model Record**: Metadata stored after successful training, making the model available for document processing.

## Model ID Generation

When creating a Template Model, the user provides a free-text display name (e.g., "Invoice Extractor Q1"). The system auto-generates an Azure-safe `model_id`:

1. Lowercase the name
2. Replace spaces and non-alphanumeric chars with `-`
3. Keep only characters in `[a-z0-9._~-]`
4. Collapse consecutive `-` into one
5. Trim leading/trailing `-`
6. Truncate to 64 chars
7. Ensure starts with letter/number
8. On uniqueness collision, append `-2`, `-3`, etc.

The `model_id` is immutable after creation and is used as the Azure Document Intelligence model identifier.

## Status Lifecycle

```
draft → training → trained
                  ↘ failed
```

- **draft**: Model created, can define fields and label documents
- **training**: Training job in progress
- **trained**: Model successfully trained and available for document processing
- **failed**: Training failed (can retry)

## Database Schema

```
TemplateModel (template_models)
  ├── FieldDefinition[]    (field schema)
  ├── LabeledDocument[]    (training data)
  ├── TrainingJob[]        (training history)
  └── TrainedModel?        (one-to-one, successful training result)

TrainingJob (training_jobs)
  └── TrainedModel?        (one-to-one)

TrainedModel (trained_models)
  └── model_id @unique     (mirrors parent TemplateModel.model_id)
```

Key constraints:
- `TemplateModel.model_id` is globally unique
- `TrainedModel.template_model_id` is unique (one-to-one with parent)
- `TrainedModel.training_job_id` is unique (one-to-one with job)
- Retraining overwrites the previous TrainedModel record

## Backend Architecture

### Module Structure

```
apps/backend-services/src/template-model/
  template-model.module.ts
  template-model.controller.ts       # api/template-models
  template-model.service.ts           # Business logic + model_id generation
  template-model-ocr.service.ts       # Azure OCR for uploaded documents
  suggestion.service.ts               # Auto-suggestion for labeling
  dto/
    create-template-model.dto.ts      # Create/Update DTOs
    template-model-responses.dto.ts   # Response DTOs
    add-document.dto.ts
    export.dto.ts
    field-definition.dto.ts
    label.dto.ts
    labeling-upload.dto.ts
    suggestion.dto.ts

apps/backend-services/src/training/
  training.controller.ts              # Training endpoints under api/template-models
  training.service.ts                 # Training orchestration
  training-poller.service.ts          # Polls Azure for training status
  dto/
    start-training.dto.ts             # Only optional description (no modelId)
    training-job.dto.ts
    trained-model.dto.ts
```

### API Endpoints

#### Template Model CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/template-models` | List all template models (filtered by group) |
| POST | `/api/template-models` | Create (name + description + group_id) |
| GET | `/api/template-models/:id` | Get details |
| PUT | `/api/template-models/:id` | Update (name, description, status) |
| DELETE | `/api/template-models/:id` | Delete |

#### Field Schema

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/template-models/:id/fields` | Get field schema |
| POST | `/api/template-models/:id/fields` | Add field |
| PUT | `/api/template-models/:id/fields/:fieldId` | Update field |
| DELETE | `/api/template-models/:id/fields/:fieldId` | Delete field |

#### Documents & Labels

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/template-models/:id/documents` | List documents |
| POST | `/api/template-models/:id/documents` | Add document |
| POST | `/api/template-models/:id/upload` | Upload and OCR |
| GET | `/api/template-models/:id/documents/:docId` | Get document |
| GET | `/api/template-models/:id/documents/:docId/download` | Download file |
| DELETE | `/api/template-models/:id/documents/:docId` | Remove document |
| GET | `/api/template-models/:id/documents/:docId/labels` | Get labels |
| POST | `/api/template-models/:id/documents/:docId/labels` | Save labels |
| DELETE | `/api/template-models/:id/documents/:docId/labels/:labelId` | Delete label |
| GET | `/api/template-models/:id/documents/:docId/ocr` | Get OCR data |
| POST | `/api/template-models/:id/documents/:docId/suggestions` | Generate suggestions |
| POST | `/api/template-models/:id/export` | Export for training |
| POST | `/api/template-models/:id/suggest-formats` | AI-suggested format specs |

#### Training

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/template-models/:modelId/training/validate` | Check training readiness |
| POST | `/api/template-models/:modelId/training/train` | Start training |
| GET | `/api/template-models/:modelId/training/jobs` | List training jobs |
| GET | `/api/template-models/training/jobs/:jobId` | Get job status |
| DELETE | `/api/template-models/training/jobs/:jobId` | Cancel job |

## Frontend Architecture

### Routes

| Route | Page | Description |
|-------|------|-------------|
| `/template-models` | ModelListPage | List and create template models |
| `/template-models/:modelId` | ModelDetailPage | Detail view with tabs |
| `/template-models/:modelId/document/:documentId` | LabelingWorkspacePage | Document labeling |

### File Structure

```
apps/frontend/src/features/annotation/template-models/
  types/training.types.ts
  hooks/
    useTemplateModels.ts     # CRUD for template models and documents
    useTraining.ts           # Training validation, jobs, start/cancel
    useLabels.ts             # Label management
    useFieldSchema.ts        # Field schema CRUD
    useSuggestions.ts        # Auto-suggestions
  pages/
    ModelListPage.tsx        # Grid of ModelCards with create modal
    ModelDetailPage.tsx      # Tabbed detail view
    LabelingWorkspacePage.tsx
  components/
    ModelCard.tsx            # Card with name, model_id, status badge
    TrainingPanel.tsx        # Train button + job status (no model_id input)
    ExportPanel.tsx
    FieldSchemaEditor.tsx
```

### Key UX Changes

- **Create modal**: User enters a display name; model_id preview shown below the input
- **Training panel**: No model_id input — just click "Train" with optional description
- **Model card**: Shows both friendly name and copyable `model_id`
- **Status badges**: draft (blue), training (yellow), trained (green), failed (red)

## Training Flow

1. User creates a Template Model (name auto-generates model_id)
2. Defines field schema (field keys + types)
3. Uploads documents (OCR processed automatically)
4. Labels documents with field values and bounding boxes
5. Clicks "Train" on the Training tab
6. Backend validates readiness (min 5 labeled docs, schema defined, all docs have labels)
7. Uploads training data to Azure Blob Storage
8. Submits to Azure Document Intelligence `buildMode: "template"`
9. Poller checks Azure every 10 seconds
10. On success: TrainedModel record created, model appears in upload dropdown

## Model Availability

Trained models automatically appear in the "Processing Model" dropdown on the upload page. The `/api/models` endpoint merges:
- Prebuilt models from `AZURE_DOC_INTELLIGENCE_MODELS` env var
- All `TrainedModel.model_id` values from the database
