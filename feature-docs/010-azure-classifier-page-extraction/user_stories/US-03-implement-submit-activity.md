# US-03: Implement azureClassify.submit Activity

**As a** Temporal Worker,
**I want to** submit a document to Azure Document Intelligence for classifier-based page classification,
**So that** the classifier can determine the type and boundaries of each document within a multi-page file.

## Acceptance Criteria
- [ ] **Scenario 1**: Classifier not found or not READY
    - **Given** a `classifierName` and `groupId` are provided
    - **When** no `ClassifierModel` with `status = READY` exists for that name/group combination
    - **Then** a descriptive error is thrown and no Azure API call is made

- [ ] **Scenario 2**: Successful submission on Azure storage provider
    - **Given** `BLOB_STORAGE_PROVIDER` is `azure` and the classifier is `READY`
    - **When** the activity is invoked
    - **Then** a SAS URL is generated for the blob key and passed as `urlSource` in the Azure DI request body

- [ ] **Scenario 3**: Successful submission on Minio storage provider
    - **Given** `BLOB_STORAGE_PROVIDER` is `minio` (or unset) and the classifier is `READY`
    - **When** the activity is invoked
    - **Then** the file bytes are read and passed as `base64Source` in the Azure DI request body

- [ ] **Scenario 4**: Azure returns 202 Accepted
    - **Given** Azure DI returns a `202` response with an `operation-location` header
    - **When** the activity processes the response
    - **Then** the output contains `resultId` (last path segment of the operation-location URL) and `constructedClassifierName` (e.g. `{groupId}__{classifierName}`)

- [ ] **Scenario 5**: Azure returns non-202 status
    - **Given** Azure DI returns any status other than `202`
    - **When** the activity processes the response
    - **Then** an error is thrown containing the response status and body

- [ ] **Scenario 6**: `documentId` and `blobKey` are forwarded
    - **Given** a successful `202` response
    - **When** the activity returns its output
    - **Then** `blobKey`, `groupId`, and `documentId` (if provided) are included unchanged in the output

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/activities/azure-classify-submit.ts`
- Uses `getPrismaClient()` for DB lookup; filters on `{ name: classifierName, group_id: groupId, status: "READY" }`.
- Constructed classifier name format: `{groupId}__{classifierName}` (matches existing `getConstructedClassifierName` convention).
- Azure DI endpoint: `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`; API key: `AZURE_DOCUMENT_INTELLIGENCE_API_KEY`.
- Request: POST `/documentClassifiers/{constructedClassifierName}:analyze` with query `{ "api-version": "2024-11-30", "_overload": "classifyDocument", "splitMode": "auto" }`.
- `resultId` extracted as the last segment of the `operation-location` header URL.
- Unit tests required; mock `getPrismaClient`, `getBlobStorageClient`, and the Azure DI client.
