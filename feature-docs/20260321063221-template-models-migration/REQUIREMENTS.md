# Plan: Migrate from Project-Centric to Model-First Architecture

## Context

The "Training Labels" feature at `/labeling` uses "LabelingProjects" as the primary entity, but users actually care about **models**. The current design causes chaos: model IDs are typed at training time with no ownership, any project can overwrite any model, and there's no model-centric view. The feature name doesn't describe its function.

**Goal**: Restructure around "Template Models" as the primary entity. The model name (set at creation) IS the Azure model_id. Training becomes an operation on a model, not a way to produce a model from a project.

**Design Decisions** (confirmed):
- Feature name: **"Template Models"** at `/template-models`
- **Friendly name + auto-generated model_id**: User picks a display name (e.g., "Invoice Extractor Q1"), system generates an Azure-safe `model_id` (e.g., `invoice-extractor-q1`). Both stored in DB. `name` is free-text display, `model_id` is unique/immutable/Azure-safe.
- Overwrite on retrain (no versioning)
- Rename DB tables, no data migration (dev mode)

---

## Phase 1: Prisma Schema

**File**: `apps/shared/prisma/schema.prisma`

### 1.1 Rename `LabelingProject` → `TemplateModel`
- Table: `template_models`
- Two name fields:
  - `name` (String) — free-text display name, e.g. "Invoice Extractor Q1"
  - `model_id` (String, `@unique`) — auto-generated Azure-safe ID, e.g. `invoice-extractor-q1`. Immutable after creation.
- `model_id` generation logic (backend service, at creation time):
  1. Lowercase the name
  2. Replace spaces and non-alphanumeric chars with `-`
  3. Strip anything not in `[a-z0-9._~-]`
  4. Collapse consecutive `-` into one
  5. Trim leading/trailing `-`
  6. Truncate to 64 chars
  7. Ensure starts with letter/number
  8. On uniqueness collision, append `-2`, `-3`, etc.
- Relation to `TrainedModel` becomes optional one-to-one (`TrainedModel?`)

### 1.2 Rename enum `ProjectStatus` → `TemplateModelStatus`
- Values: `draft` (was `active`), `training`, `trained` (new), `failed` (new)
- Remove `archived` (add back later if needed)

### 1.3 Update FK references across related models
| Model | Old FK | New FK |
|---|---|---|
| `FieldDefinition` | `project_id` → `LabelingProject` | `template_model_id` → `TemplateModel` |
| `LabeledDocument` | `project_id` → `LabelingProject` | `template_model_id` → `TemplateModel` |
| `TrainingJob` | `project_id` → `LabelingProject` | `template_model_id` → `TemplateModel` |
| `TrainedModel` | `project_id` → `LabelingProject` | `template_model_id` → `TemplateModel` |

### 1.4 `TrainingJob` changes
- **Remove** `model_id` column (now derived from parent `TemplateModel.model_id` via relation)
- Relation to `TrainedModel` becomes optional one-to-one (`TrainedModel?`)

### 1.5 `TrainedModel` changes
- `template_model_id` becomes `@unique` (one-to-one with parent)
- `training_job_id` becomes `@unique` (one-to-one with job)
- Keep `model_id @unique` (mirrors parent name, used by `/api/models` endpoint)

### 1.6 Update `Group` and `User` relation fields
- `Group.labeling_projects` → `Group.template_models`
- `User.labelingProjects` → `User.templateModels`

### 1.7 `LabelingDocument` — NO CHANGES
This is a shared file record, not part of the rename.

### 1.8 Migration
- Run `npx prisma migrate dev --name rename-labeling-to-template-models`
- Run `npm run db:generate` from `apps/backend-services`

---

## Phase 2: Database Service Layer

### 2.1 Rename `labeling-project-db.service.ts` → `template-model-db.service.ts`
**Old**: `apps/backend-services/src/database/labeling-project-db.service.ts`
**New**: `apps/backend-services/src/database/template-model-db.service.ts`

Method renames:
| Old | New |
|---|---|
| `createLabelingProject` | `createTemplateModel` |
| `findLabelingProject` | `findTemplateModel` |
| `findAllLabelingProjects` | `findAllTemplateModels` |
| `updateLabelingProject` | `updateTemplateModel` |
| `deleteLabelingProject` | `deleteTemplateModel` |
| `addDocumentToProject` | `addDocumentToTemplateModel` |
| `removeDocumentFromProject` | `removeDocumentFromTemplateModel` |

All internal Prisma calls: `this.prisma.labelingProject` → `this.prisma.templateModel`

### 2.2 Update `database.types.ts`
- `LabelingProjectData` → `TemplateModelData`

### 2.3 Update `database.service.ts`
- Rename all delegating methods to match

### 2.4 Update `database.module.ts`
- Register `TemplateModelDbService`

### 2.5 `labeling-document-db.service.ts` — NO RENAME
This stays as-is (LabelingDocument is not being renamed).

---

## Phase 3: Template Model Module (replaces Labeling Module)

**Old dir**: `apps/backend-services/src/labeling/`
**New dir**: `apps/backend-services/src/template-model/`

### 3.1 File renames
| Old | New |
|---|---|
| `labeling.module.ts` | `template-model.module.ts` (`TemplateModelModule`) |
| `labeling.controller.ts` | `template-model.controller.ts` (`TemplateModelController`) |
| `labeling.service.ts` | `template-model.service.ts` (`TemplateModelService`) |
| `labeling-ocr.service.ts` | `template-model-ocr.service.ts` |
| `suggestion.service.ts` | `suggestion.service.ts` (unchanged) |
| All spec files | Renamed to match |

### 3.2 Route prefix change
```
@ApiTags("Template Models")
@Controller("api/template-models")
```

### 3.3 Endpoint renames
All `/api/labeling/projects/...` → `/api/template-models/...`

Key endpoints:
- `GET /api/template-models` — list models
- `POST /api/template-models` — create model (name validated with Azure regex)
- `GET /api/template-models/:id` — get model
- `PUT /api/template-models/:id` — update (description/status only, name immutable)
- `DELETE /api/template-models/:id` — delete model
- Fields: `/api/template-models/:id/fields`
- Documents: `/api/template-models/:id/documents`
- Labels: `/api/template-models/:id/documents/:docId/labels`
- Upload: `/api/template-models/:id/upload`
- Export: `/api/template-models/:id/export`
- Suggestions: `/api/template-models/:id/documents/:docId/suggestions`

### 3.4 DTOs
| Old | New |
|---|---|
| `CreateProjectDto` | `CreateTemplateModelDto` — `name` (free-text display name, required). `model_id` auto-generated server-side. |
| `UpdateProjectDto` | `UpdateTemplateModelDto` — `name` + `description` + `status` (`model_id` is immutable, never in update DTO) |
| `LabelingProjectResponseDto` | `TemplateModelResponseDto` |

Other DTOs (label, field, export, upload, suggestion) — rename `projectId` params to `templateModelId` where applicable.

### 3.5 Delete old `labeling/` directory after new module is complete

---

## Phase 4: Training Module Updates

**Dir**: `apps/backend-services/src/training/` (keeps its directory, updates internals)

### 4.1 Route changes
| Old | New |
|---|---|
| `GET /api/training/projects/:projectId/validate` | `GET /api/template-models/:modelId/training/validate` |
| `POST /api/training/projects/:projectId/train` | `POST /api/template-models/:modelId/training/train` |
| `GET /api/training/projects/:projectId/jobs` | `GET /api/template-models/:modelId/training/jobs` |
| `GET /api/training/jobs/:jobId` | `GET /api/template-models/training/jobs/:jobId` |
| `DELETE /api/training/jobs/:jobId` | `DELETE /api/template-models/training/jobs/:jobId` |
| `GET /api/training/projects/:projectId/models` | **REMOVED** (parent IS the model) |

### 4.2 `StartTrainingDto`
- **Remove** `modelId` field — model_id comes from parent `TemplateModel.model_id`
- Keep optional `description`

### 4.3 `TrainingJobDto`
- Rename `projectId` → `templateModelId`
- Remove `modelId` field

### 4.4 `TrainedModelDto`
- Rename `projectId` → `templateModelId`

### 4.5 `training.service.ts`
- Inject `TemplateModelService` (was `LabelingService`)
- `startTraining()`: read model_id from `templateModel.model_id` instead of `dto.modelId`
- `startTraining()`: delete existing `TrainedModel` for this `template_model_id` before retrain (one-to-one)
- `prepareTrainingFiles()`: call `templateModelService.exportTemplateModel()` (was `labelingService.exportProject()`)
- `uploadAndTrain()`: use `templateModel.model_id` for Azure `modelId` param

### 4.6 `training-poller.service.ts`
- Query jobs with `include: { template_model: true }` to get model name
- Read `job.template_model.model_id` instead of `job.model_id`
- Create `TrainedModel` with `template_model_id` instead of `project_id`

### 4.7 `training.module.ts`
- Import `TemplateModelModule` (was `LabelingModule`)

### 4.8 Update all spec files

---

## Phase 5: Cross-Cutting Backend Updates

### 5.1 `apps/backend-services/src/app.module.ts`
- Replace `LabelingModule` → `TemplateModelModule`

### 5.2 `apps/backend-services/src/ocr/ocr.controller.ts`
- `getModels()` still queries `prisma.trainedModel` — works unchanged
- Update spec if needed

### 5.3 `apps/backend-services/src/workflow/workflow-validator.ts`
- Line 128: `"LabelingProject ID"` → `"TemplateModel ID"`

### 5.4 Run all backend tests

---

## Phase 6: Frontend

### 6.1 Directory move
**Old**: `apps/frontend/src/features/annotation/labeling/`
**New**: `apps/frontend/src/features/annotation/template-models/`

### 6.2 Page renames
| Old | New |
|---|---|
| `ProjectListPage.tsx` | `ModelListPage.tsx` |
| `ProjectDetailPage.tsx` | `ModelDetailPage.tsx` |
| `LabelingWorkspacePage.tsx` | `LabelingWorkspacePage.tsx` (unchanged — labeling is the activity) |

### 6.3 Component renames
| Old | New |
|---|---|
| `ProjectCard.tsx` | `ModelCard.tsx` |
| `TrainingPanel.tsx` | `TrainingPanel.tsx` (simplified: remove model_id input) |
| `ExportPanel.tsx` | `ExportPanel.tsx` (param rename) |
| `FieldSchemaEditor.tsx` | unchanged |

### 6.4 Hook renames & API path updates
| Old | New | API path change |
|---|---|---|
| `useProjects.ts` | `useTemplateModels.ts` | `/labeling/projects` → `/template-models` |
| `useTraining.ts` | `useTraining.ts` | `/training/projects/:id` → `/template-models/:id/training` |
| `useLabels.ts` | `useLabels.ts` | `/labeling/projects/:id/documents` → `/template-models/:id/documents` |
| `useFieldSchema.ts` | `useFieldSchema.ts` | `/labeling/projects/:id/fields` → `/template-models/:id/fields` |
| `useSuggestions.ts` | `useSuggestions.ts` | `/labeling/projects/:id/documents` → `/template-models/:id/documents` |

Query key renames: `"labeling-projects"` → `"template-models"`, etc.

### 6.5 `TrainingPanel.tsx` — Key UX change
- **Remove** Model ID text input (model_id is auto-generated at model creation)
- **Remove** model_id validation logic
- Simplify "Start Training" to just optional description + "Train" button
- Show the model's `model_id` as read-only info (copyable) so users know what Azure model name will be used
- "Trained Models" table replaced with single status card (0 or 1 trained model)
- Retrain = "Train" button (overwrites previous)

### 6.6 `ModelListPage.tsx` — Create modal changes
- Title: "Create Template Model"
- Name field: free-text, e.g. "Invoice Extractor Q1" (no Azure naming restrictions on display name)
- Show auto-generated `model_id` preview below the name field (live preview as user types)
- Description field (optional)
- Navigate to `/template-models/${model.id}`

### 6.6.1 `ModelCard.tsx` — Display both name and model_id
- Show friendly `name` as title
- Show `model_id` in a `Code` block with copy button (for use in API/upload)

### 6.7 Router (`App.tsx`)
```
/template-models → ModelListPage
/template-models/:modelId → ModelDetailPage
/template-models/:modelId/document/:documentId → LabelingWorkspacePage
```

### 6.8 Navigation (`RootLayout.tsx`)
- Label: "Template Models", path: `/template-models`

### 6.9 Workflow pages — update references
- `apps/frontend/src/pages/WorkflowEditPage.tsx`: import from `template-models/hooks/useTemplateModels`, update UI strings ("labeling project" → "template model")
- `apps/frontend/src/components/workflow/GraphConfigFormEditor.tsx`: update label text

### 6.10 Test file updates
- `ProjectListPage.test.tsx` → `ModelListPage.test.tsx`
- `useProjects.test.ts` → `useTemplateModels.test.ts`

### 6.11 Delete old `labeling/` directory

---

## Phase 7: Documentation

- Create/update `docs-md/TEMPLATE_MODELS.md` (was `TEMPLATE_TRAINING.md` if it exists)
- Document the model-first architecture, API endpoints, and UX flow

---

## Verification

1. **DB**: `npx prisma migrate dev` succeeds, `npm run db:generate` succeeds
2. **Backend tests**: `npm test` in `apps/backend-services` — all pass
3. **Frontend build**: `npm run build` in `apps/frontend` — no errors
4. **Manual smoke test**:
   - Navigate to `/template-models` — see empty list
   - Create a template model with name `test-model-v1` — succeeds, redirects to detail page
   - Add field schema, upload documents, label them
   - Click "Train" — job starts, polls, completes
   - Navigate to upload page — `test-model-v1` appears in model dropdown
5. **Workflow pages**: verify template model dropdown still works in workflow config
