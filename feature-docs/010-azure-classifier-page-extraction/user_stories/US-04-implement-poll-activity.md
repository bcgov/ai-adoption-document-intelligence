# US-04: Implement azureClassify.poll Activity

**As a** Temporal Worker,
**I want to** poll Azure Document Intelligence for the result of a classifier analysis and split the source document into labelled sub-documents,
**So that** downstream workflow nodes receive individually addressable files grouped by their classifier-assigned label.

## Acceptance Criteria
- [ ] **Scenario 1**: Operation still in progress
    - **Given** the Azure DI operation status is `running` or `notStarted`
    - **When** the activity polls the result
    - **Then** a retryable error is thrown so Temporal retries the activity automatically

- [ ] **Scenario 2**: Operation failed
    - **Given** the Azure DI operation status is `failed`
    - **When** the activity polls the result
    - **Then** a non-retryable error is thrown with details from the response

- [ ] **Scenario 3**: Operation succeeded — page ranges derived correctly
    - **Given** the Azure DI operation status is `succeeded` and `analyzeResult.documents` contains entries
    - **When** the activity processes the result
    - **Then** the page range for each document is the min and max `pageNumber` across all its `boundingRegions`

- [ ] **Scenario 4**: Each detected document is split into its own file
    - **Given** a succeeded operation with multiple detected documents
    - **When** the activity processes the result
    - **Then** `splitDocument` is called once per detected document with `strategy: "custom-ranges"` and the correct `{ start, end }` page range, producing a unique blob key per document

- [ ] **Scenario 5**: Adjacent documents with the same label are separate files
    - **Given** two separate classifier results with the same `docType` label
    - **When** the activity groups results
    - **Then** each appears as a separate entry in the label's array (they are not merged)

- [ ] **Scenario 6**: Output structure is correct
    - **Given** a succeeded operation
    - **When** the output is returned
    - **Then** `originalBlobKey` equals the input `blobKey` unchanged, and `labeledDocuments` is a `Record<string, ClassifiedDocument[]>` where each `ClassifiedDocument` has `blobKey`, `confidence`, and `pageRange`

- [ ] **Scenario 7**: `documentId` is derived from blobKey when not provided
    - **Given** `documentId` is not present in the input
    - **When** `splitDocument` is called
    - **Then** the `documentId` is derived using `extractDocumentId(blobKey)`

- [ ] **Scenario 8**: Poll URL uses configured endpoint
    - **Given** `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` is set
    - **When** the activity polls for results
    - **Then** it calls `.path("/documentClassifiers/{classifierName}/analyzeResults/{resultId}", constructedClassifierName, resultId).get()` on a client built from the configured endpoint (not a raw URL)

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/activities/azure-classify-poll.ts`
- Azure DI client instantiated with `DocumentIntelligence(endpoint, { key: apiKey }, ...)` matching the pattern in `poll-ocr-results.ts`.
- `splitDocument` is called as a direct function import (not via Temporal activity proxy) to avoid nested Temporal scheduling.
- `extractDocumentId` is already exported from `split-document.ts` — confirm it is exported or export it.
- The `@ts-expect-error` suppressions may be needed for the `.path()` call on the classifier endpoint (matches existing pattern in backend-services).
- Unit tests required; mock `DocumentIntelligence`, `splitDocument`, and `getPrismaClient` where needed.
