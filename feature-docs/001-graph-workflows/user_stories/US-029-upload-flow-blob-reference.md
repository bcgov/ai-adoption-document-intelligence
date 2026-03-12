# US-029: Update Upload Flow to Use Blob References Instead of Base64

**As a** developer,
**I want to** change the document upload flow to save files to the blob storage and pass blob keys through the workflow context,
**So that** file data is not passed inline through Temporal workflow input, keeping workflow history bounded and supporting large multi-page documents.

## Acceptance Criteria
- [ ] **Scenario 1**: Uploaded file is saved to blob storage
    - **Given** a document is uploaded via the API
    - **When** the file is received
    - **Then** it is saved to the local blob storage under `documents/{documentId}/original.{ext}` and the blob key is stored in the document record

- [ ] **Scenario 2**: Blob key is passed in workflow initial context
    - **Given** a workflow is started for a document
    - **When** `startGraphWorkflow` constructs the `initialCtx`
    - **Then** it includes `blobKey` (the storage reference) instead of inline base64 data

- [ ] **Scenario 3**: Activities read files via blob key
    - **Given** an activity needs to access file data (e.g., `file.prepare`, `azureOcr.submit`)
    - **When** the activity executes
    - **Then** it reads the file from blob storage using the `blobKey` from context, not from inline data

- [ ] **Scenario 4**: No base64 data in workflow input
    - **Given** a workflow is started
    - **When** the `GraphWorkflowInput` is inspected
    - **Then** it does not contain `binaryData` or any base64-encoded file content

- [ ] **Scenario 5**: Existing activities adapted for blob key input
    - **Given** activities that previously received base64 data
    - **When** they are updated
    - **Then** they accept a `blobKey` parameter and use the `BlobStorageService` to read file data

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Depends on US-016 (BlobStorageService)
- Upload flow change documented in Section 13.4: Upload -> save to filesystem -> store blobKey -> pass blobKey in ctx -> activity reads via blobKey
- The old `OCRWorkflowInput.binaryData` base64 pattern is removed
- The `BlobReference` type includes `blobKey` and `storageBackend: "local"` per Section 13.2
- Segment storage from splits follows the pattern in Section 13.5
- This change is critical for multi-page document support (2000+ pages)
