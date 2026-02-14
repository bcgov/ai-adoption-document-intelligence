# US-008: Dataset File Upload

**As a** user,
**I want to** upload document files and ground truth files to a dataset,
**So that** I can build evaluation datasets through the UI without manual file management.

## Acceptance Criteria
- [ ] **Scenario 1**: Upload multiple files in a single request
    - **Given** a dataset exists
    - **When** `POST /api/benchmark/datasets/:id/upload` is called with multipart form data containing multiple files
    - **Then** all files are received, written to the dataset repository working directory in the appropriate subdirectories (inputs/ and ground-truth/), and a success response is returned listing the uploaded file paths

- [ ] **Scenario 2**: Manifest entries are generated for uploaded files
    - **Given** files have been uploaded to a dataset
    - **When** the upload completes
    - **Then** manifest entries are generated or updated with sample IDs, input file references (path, mimeType), and ground truth file references (path, format) based on file naming conventions

- [ ] **Scenario 3**: Input files are stored in the inputs subdirectory
    - **Given** a file upload request with document files (images, PDFs)
    - **When** the files are processed
    - **Then** input files are written to `inputs/` within the dataset repository working directory

- [ ] **Scenario 4**: Ground truth files are stored in the ground-truth subdirectory
    - **Given** a file upload request with ground truth files (JSON, JSONL, CSV)
    - **When** the files are processed
    - **Then** ground truth files are written to `ground-truth/` within the dataset repository working directory

- [ ] **Scenario 5**: Upload rejects files exceeding size limits
    - **Given** a configured maximum file size limit
    - **When** a file exceeding the limit is uploaded
    - **Then** a 413 response is returned with an appropriate error message

- [ ] **Scenario 6**: Upload to non-existent dataset returns 404
    - **Given** no dataset exists with the provided ID
    - **When** `POST /api/benchmark/datasets/:id/upload` is called
    - **Then** a 404 response is returned

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Endpoint: `POST /api/benchmark/datasets/:id/upload`
- Use NestJS `@UseInterceptors(FilesInterceptor(...))` for multipart file handling
- Files are written to the dataset Git repository working directory (managed by DvcService)
- File type detection based on extension and/or content-type header
- Manifest update is additive -- new uploads add entries without removing existing ones
- See Requirements Section 3.2 (Dataset Upload & DVC Automation), Section 11.1 (Dataset APIs)
- Files in controller: `apps/backend-services/src/benchmark/dataset.controller.ts`
- Tests: extend `apps/backend-services/src/benchmark/dataset.controller.spec.ts`
