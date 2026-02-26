# US-013: Enforce Group Authorization on Sub-Resources via Parent Traversal

**As a** system user,
**I want to** be prevented from reading or modifying sub-resources whose parent belongs to a group I am not a member of,
**So that** sub-resource access is consistently protected by the same group authorization as their parents.

## Acceptance Criteria

### LabeledDocument (sub-resource of LabelingProject)
- [x] **Scenario 1**: Member accesses a LabeledDocument under a LabelingProject in their group
    - **Given** a requestor who is a member of group X
    - **And** a `LabelingProject` with `group_id` = X exists with a child `LabeledDocument`
    - **When** the requestor fetches the `LabeledDocument`
    - **Then** the resource is returned successfully

- [x] **Scenario 2**: Non-member attempts to access a LabeledDocument
    - **Given** a requestor who is NOT a member of group X
    - **And** a `LabelingProject` with `group_id` = X exists with a child `LabeledDocument`
    - **When** the requestor attempts any of: `GET/POST /projects/:id/documents`, `GET/DELETE /projects/:id/documents/:docId`, `GET /projects/:id/documents/:docId/download`
    - **Then** the API returns `403 Forbidden`

### FieldDefinition (sub-resource of LabelingProject)
- [x] **Scenario 3**: Member accesses field definitions in their group's project
    - **Given** a requestor who is a member of group X
    - **And** a `LabelingProject` with `group_id` = X exists
    - **When** the requestor accesses `GET /projects/:id/fields`
    - **Then** the field schema is returned successfully

- [x] **Scenario 4**: Non-member attempts to access or modify field definitions
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts any of: `GET/POST /projects/:id/fields`, `PUT/DELETE /projects/:id/fields/:fieldId`
    - **Then** the API returns `403 Forbidden`

### DocumentLabel (sub-resource of LabelingProject via LabeledDocument)
- [x] **Scenario 5**: Member reads and saves labels in their group's project
    - **Given** a requestor who is a member of group X
    - **And** a `LabelingProject` with `group_id` = X exists
    - **When** the requestor accesses or saves labels via `GET/POST /projects/:id/documents/:docId/labels`
    - **Then** the operation succeeds

- [x] **Scenario 6**: Non-member attempts to access or modify labels
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts any of: `GET/POST /projects/:id/documents/:docId/labels`, `DELETE /projects/:id/documents/:docId/labels/:labelId`
    - **Then** the API returns `403 Forbidden`

### OCR Data (accessed via LabelingProject)
- [x] **Scenario 7**: Non-member attempts to read OCR data
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts `GET /projects/:id/documents/:docId/ocr`
    - **Then** the API returns `403 Forbidden`

### Export (project-level operation on LabelingProject)
- [x] **Scenario 8**: Non-member attempts to export a project
    - **Given** a requestor who is NOT a member of group X
    - **When** the requestor attempts `POST /projects/:id/export`
    - **Then** the API returns `403 Forbidden`

### TrainingJob (sub-resource of LabelingProject)
- [x] **Scenario 9**: Non-member attempts to access or create training jobs
    - **Given** a requestor who is NOT a member of group X
    - **And** a `LabelingProject` with `group_id` = X exists
    - **When** the requestor attempts any of: `GET /training/projects/:projectId/validate`, `POST /training/projects/:projectId/train`, `GET /training/projects/:projectId/jobs`
    - **Then** the API returns `403 Forbidden`

- [x] **Scenario 10**: Non-member attempts to access or cancel a TrainingJob directly by ID
    - **Given** a requestor who is NOT a member of group X
    - **And** a `TrainingJob` whose parent `LabelingProject` has `group_id` = X exists
    - **When** the requestor attempts `GET /training/jobs/:jobId` or `DELETE /training/jobs/:jobId`
    - **Then** the API returns `403 Forbidden`

### TrainedModel (sub-resource of LabelingProject)
- [x] **Scenario 11**: Non-member attempts to access trained models
    - **Given** a requestor who is NOT a member of group X
    - **And** a `LabelingProject` with `group_id` = X exists with child `TrainedModel` records
    - **When** the requestor attempts `GET /training/projects/:projectId/models`
    - **Then** the API returns `403 Forbidden`

### ReviewSession (sub-resource of Document)
- [x] **Scenario 12**: Member accesses a ReviewSession for a document in their group
    - **Given** a requestor who is a member of group X
    - **And** a `Document` with `group_id` = X exists with a child `ReviewSession`
    - **When** the requestor accesses the session
    - **Then** the session is returned successfully

- [x] **Scenario 13**: Non-member attempts to access or act on a ReviewSession
    - **Given** a requestor who is NOT a member of group X
    - **And** a `Document` with `group_id` = X exists with a child `ReviewSession`
    - **When** the requestor attempts any of: `GET /hitl/sessions/:id`, `POST /hitl/sessions/:id/corrections`, `GET /hitl/sessions/:id/corrections`, `POST /hitl/sessions/:id/submit`, `POST /hitl/sessions/:id/escalate`, `POST /hitl/sessions/:id/skip`
    - **Then** the API returns `403 Forbidden`

- [x] **Scenario 14**: Non-member attempts to create a ReviewSession for a document in another group
    - **Given** a requestor who is NOT a member of group X
    - **And** a `Document` with `group_id` = X exists
    - **When** the requestor attempts `POST /hitl/sessions`
    - **Then** the API returns `403 Forbidden`

- [x] **Scenario 15**: Unit tests cover all sub-resource types and controllers
    - **Given** the enforcement implementation
    - **When** unit tests are run
    - **Then** authorized and unauthorized access for `LabeledDocument`, `FieldDefinition`, `DocumentLabel`, OCR data, export, `TrainingJob`, `TrainedModel`, and `ReviewSession` are all covered and pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Sub-resources have no `group_id` column; the parent's `group_id` is resolved by traversal at the service layer
- Sub-resource → parent mappings:
  - `LabeledDocument` → `LabelingProject`
  - `FieldDefinition` → `LabelingProject`
  - `DocumentLabel` → `LabelingProject` (via `LabeledDocument`)
  - OCR data → `LabelingProject` (via `LabeledDocument`, no separate entity)
  - Export → `LabelingProject` (project-level operation)
  - `TrainingJob` → `LabelingProject`
  - `TrainedModel` → `LabelingProject`
  - `ReviewSession` → `Document`
- For endpoints that include `:projectId` or `:id` (labeling project) in the path, fetch the project first to resolve `group_id`
- For `GET /training/jobs/:jobId` and `DELETE /training/jobs/:jobId`, resolve `group_id` via `TrainingJob.project_id → LabelingProject.group_id`
- For all HITL session endpoints using `:id`, resolve `group_id` via `ReviewSession.document_id → Document.group_id`
- Traversal can be done via a single JOIN or a two-step fetch; prefer the approach that minimizes additional DB queries
- Reuses the shared authorization helper from US-007; no new membership check logic required
- All CRUD operations on sub-resources must be covered
