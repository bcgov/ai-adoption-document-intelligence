# Feature: Azure Classifier Page Extraction Activity

## Overview

A new pair of Temporal activities that classifies each page of a multi-page document using an Azure Document Intelligence (DI) classifier, then splits the document into separate files grouped by the classifier-assigned label. A companion frontend form component lets users configure this activity inside the existing workflow builder.

This feature is an alternative to the existing `document.splitAndClassify` activity (which is keyword/OCR-text based). The two activities coexist; the new Azure-based variant has a clearly distinct activity type string.

---

## Actors

- **Workflow Designer**: A user who is a member of a group and has permission to edit workflow templates for that group. They configure the activity in the workflow builder UI.
- **Temporal Worker**: Executes the activity at runtime as part of a graph workflow.

---

## Temporal Activities

### Design: Two-Activity Async Pattern

Follows the same submit → poll pattern as `azureOcr.submit` / `azureOcr.poll`. The submit activity dispatches the classification request to Azure DI and returns an operation location; the poll activity retrieves the result, interprets page groupings, and splits the PDF.

**Activity type identifiers:**
- `azureClassify.submit`
- `azureClassify.poll`

Both must be registered in `activity-types.ts` (`REGISTERED_ACTIVITY_TYPES`) and `activity-registry.ts`.

---

### Activity 1 — `azureClassify.submit`

**File:** `apps/temporal/src/activities/azure-classify-submit.ts`

#### Input

```ts
interface AzureClassifySubmitInput {
  /** Blob key of the source document to classify. */
  blobKey: string;
  /** Group ID used to scope the classifier lookup. */
  groupId: string;
  /** Name of the ClassifierModel (primary key together with groupId). */
  classifierName: string;
  /** Optional document ID. If not provided, it will be derived from the blobKey. */
  documentId?: string;
}
```

#### Behaviour

1. Look up the `ClassifierModel` in the database directly via `getPrismaClient()`, filtering on `{ name: classifierName, group_id: groupId, status: ClassifierStatus.READY }`.
   - If no matching record is found (does not exist or is not `READY`), throw a descriptive error. Do not proceed with the Azure call.
2. Build the document source for the Azure DI request using the storage-provider-aware strategy below.
3. POST to the Azure DI classify endpoint:
   - Path: `/documentClassifiers/{constructedClassifierName}:analyze`
   - Body: either `{ urlSource: <sasUrl> }` or `{ base64Source: <base64> }` depending on step 2.
   - Query: `{ "api-version": "2024-11-30", "_overload": "classifyDocument", "splitMode": "auto" }`
   - The constructed classifier name follows the same `{groupId}_{classifierName}` convention already used in `ClassifierService.getConstructedClassifierName`.
4. On `202 Accepted`, extract the `resultId` from the `operation-location` header — it is the last path segment of the URL (e.g. `https://.../analyzeResults/{resultId}` → `resultId`). Return the `resultId` and the constructed classifier name so the poll activity can reconstruct the URL itself using the configured endpoint. This avoids any domain-correction concerns entirely.
5. On any other status, throw with a descriptive message including the response status and body.

#### Storage-Provider-Aware Document Source

The Azure DI classify API accepts either a `urlSource` (a publicly-accessible or SAS-signed URL) or a `base64Source`. Using `urlSource` is more efficient when the file is already in Azure Blob Storage because it avoids downloading and re-encoding the bytes in the Temporal worker.

Check the `BLOB_STORAGE_PROVIDER` environment variable:

- **`azure`**: Generate a short-lived (e.g. 15-minute) read-only SAS URL for the blob key using the Azure Storage SDK (`BlobClient.generateSasUrl`), then use `{ urlSource: sasUrl }` in the request body. The Temporal Azure storage client (`buildAzureClient` in `blob-storage-client.ts`) already holds a `ContainerClient` which can produce this; a `generateSasUrl(key: BlobFilePath, expiryMinutes: number): Promise<string>` method should be added to the `BlobStorageClient` interface and implemented for the Azure provider only (the Minio implementation may throw `"SAS URLs not supported for Minio storage"`).
- **`minio` (default) or any other value**: Read the file bytes from blob storage and use `{ base64Source: buffer.toString("base64") }` as before.

This mirrors the approach already used in `ClassifierService.createLayoutJson` (backend-services), which calls `getBlobSasUrl` and passes `urlSource` when storage is Azure.

#### Output

```ts
interface AzureClassifySubmitOutput {
  /**
   * The result ID extracted from the last segment of the operation-location header.
   * e.g. for "https://.../documentClassifiers/{name}/analyzeResults/{resultId}"
   * this is just "{resultId}".
   */
  resultId: string;
  /** The constructed classifier name (e.g. "{groupId}__{classifierName}") needed to poll. */
  constructedClassifierName: string;
  /** Forwarded for use by the poll activity. */
  blobKey: string;
  groupId: string;
  documentId?: string;
}
```

> **Why not the full operation-location URL?** Azure DI returns an `operation-location` header whose domain can differ from the configured endpoint. The OCR activities avoid this problem by storing only a short ID and reconstructing the URL from the configured endpoint at poll time. The same pattern applies here: extract just the `resultId` (last path segment of the URL) and let the poll activity build the correct URL via the SDK's `.path()` method against `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`. No domain-correction utility is needed.

---

### Activity 2 — `azureClassify.poll`

**File:** `apps/temporal/src/activities/azure-classify-poll.ts`

#### Input

```ts
interface AzureClassifyPollInput {
  /** Extracted from the operation-location header by the submit activity. */
  resultId: string;
  /** Constructed classifier name (e.g. "{groupId}__{classifierName}") for building the poll URL. */
  constructedClassifierName: string;
  blobKey: string;
  groupId: string;
  documentId?: string;
}
```

#### Behaviour

1. Construct the poll URL using the Azure DI SDK client (same credential/endpoint env vars as OCR: `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`, `AZURE_DOCUMENT_INTELLIGENCE_API_KEY`) via:
   ```ts
   client.path(
     "/documentClassifiers/{classifierName}/analyzeResults/{resultId}",
     constructedClassifierName,
     resultId,
   ).get()
   ```
   This mirrors the pattern in `poll-ocr-results.ts` and ensures the correct endpoint domain is always used.
2. If the operation status is `running` or `notStarted`, throw a retryable error so Temporal retries the activity.
3. If the operation status is `failed`, throw a non-retryable error.
4. On `succeeded`, extract `analyzeResult.documents[]`. Each entry contains:
   - `docType`: string label assigned by the classifier.
   - `confidence`: number (0–1).
   - `boundingRegions`: array of `{ pageNumber, polygon }` — the pages this document spans.
5. Derive a page range for each detected document from its `boundingRegions` (min pageNumber → max pageNumber within that entry).
6. For each detected document, call the existing `splitDocument` activity helper with `strategy: "custom-ranges"` and the derived `{ start, end }` range to produce a per-document blob key.
   - `documentId` for the `splitDocument` call: use the value forwarded from the submit output if present; otherwise derive it from the `blobKey` using the same `extractDocumentId` helper already used in `splitDocument` itself.
7. Group the resulting blob keys by `docType` into a `Record<string, ClassifiedDocument[]>`.
8. Pass through the original `blobKey` unchanged.

#### Output

```ts
interface ClassifiedDocument {
  /** Blob key of the extracted sub-document in storage. */
  blobKey: string;
  /** Confidence score returned by the Azure DI classifier for this document. */
  confidence: number;
  /** Page range from the original document (1-based). */
  pageRange: { start: number; end: number };
}

interface AzureClassifyPollOutput {
  /** Unmodified blob key of the source document. */
  originalBlobKey: string;
  /**
   * Map of classifier label → list of extracted documents.
   * Confidence score is included on each entry so downstream nodes can
   * apply their own filtering logic.
   */
  labeledDocuments: Record<string, ClassifiedDocument[]>;
}
```

---

## Frontend — Activity Configuration Form

### Location

`apps/frontend/src/components/workflow/`

A new dedicated component file: `AzureClassifySubmitForm.tsx`.

### Pattern

The existing `ActivityNodeForm` component inside `GraphConfigFormEditor.tsx` handles all activity nodes generically. The outdated inline `isOcrEnrich` block is the pattern to **avoid**. Instead:

- Create `AzureClassifySubmitForm` as a standalone component that receives `(node: ActivityNode, onChange: (node: ActivityNode) => void)`.
- In `ActivityNodeForm`, detect `node.activityType === "azureClassify.submit"` and render `<AzureClassifySubmitForm>` in place of (or alongside) the generic inputs/outputs section.

### Form Fields

| Field | Control | Description |
|---|---|---|
| **Classifier** | `Select` (dropdown) | Lists all `READY` classifiers for the current group. Fetched from `GET /api/azure/classifier?group_id={groupId}`. Each option displays `classifier.name`; the stored parameter value is the `name` string. The dropdown must filter to `status === "READY"` classifiers only (either server-side via the query param, or client-side after fetch). |
| **Source document (input port)** | Text input for port/ctxKey binding | The blob key of the document coming from a previous workflow node. Uses the standard `inputs` port-binding pattern already present in `ActivityNodeForm`. |

### Data Fetching

- Use Tanstack React Query to fetch classifiers: `useQuery` keyed on `["classifiers", groupId]`.
- The current group ID is available from the existing group context in the frontend.
- While loading, show a disabled `Select` with a loading indicator. On error, show an error message.

### Parameter Storage

All form values are stored in `node.parameters` as part of the `ActivityNode` config, consistent with how `ocr.enrich` stores `documentType`, `confidenceThreshold`, etc.:

```json
{
  "activityType": "azureClassify.submit",
  "parameters": {
    "classifierName": "my-classifier"
  },
  "inputs": [{ "port": "blobKey", "ctxKey": "previousNode.blobKey" }],
  "outputs": [
    { "port": "originalBlobKey", "ctxKey": "classifyResult.originalBlobKey" },
    { "port": "labeledDocuments", "ctxKey": "classifyResult.labeledDocuments" }
  ]
}
```

---

## Workflow Integration

- The two activities are independent nodes in a graph workflow. The workflow author connects `azureClassify.submit` → `azureClassify.poll` by wiring the `operationLocation` output of the submit node to the `operationLocation` input of the poll node.
- The activity can be placed anywhere in the workflow; there is no hard ordering constraint relative to OCR.
- Typical placement: early in the workflow, before OCR, to identify and route sub-documents to appropriate OCR/enrichment pipelines.
- The `labeledDocuments` output of the poll node contains individually addressable blob keys so downstream nodes can process each extracted document independently (e.g., map each entry through OCR + enrich).

---

## Constraints & Non-Functional Requirements

- **No document-specific logic**: The activity must remain generic. It must not reference specific label names or document types in its implementation.
- **Classifier scoping**: Only classifiers belonging to the workflow's `groupId` may be used. The DB lookup enforces this.
- **Untrained classifier guard**: The submit activity must reject classifiers with `status !== READY` with a clear error before making any Azure API call.
- **No backwards compatibility**: New activity types only; existing `document.splitAndClassify` is unchanged.
- **Tests**: Unit tests required for both Temporal activities. Frontend component tests required using React Testing Library / Vitest.
- **Linting**: All code must pass the project's Biome lint/format rules before submission.

---

## Resolved Decisions

1. **`minConfidence`**: Removed entirely. Confidence filtering is the responsibility of downstream workflow nodes, not this activity.
2. **`documentId` availability**: The `documentId` is optional on the input. If absent, the poll activity derives it from the `blobKey` using `extractDocumentId` (already present in `splitDocument.ts`).
3. **Azure endpoint domain replacement**: Not needed. By extracting only the `resultId` from the `operation-location` header (submit activity) and reconstructing the poll URL via the SDK's `.path()` method (poll activity), the wrong-domain issue is bypassed entirely — the same pattern OCR uses with `apimRequestId`.
