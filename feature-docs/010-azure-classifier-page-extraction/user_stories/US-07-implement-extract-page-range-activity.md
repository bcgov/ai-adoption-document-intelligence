# US-07: Implement document.extractPageRange Activity

**As a** Temporal Worker,
**I want to** extract a specific page range from a source document and store it as a new blob,
**So that** downstream workflow nodes can consume a physically isolated sub-document produced from classifier-detected boundaries.

## Context

`azureClassify.poll` returns page ranges for each detected document but does not split the source file. This activity is the on-demand counterpart: given a source blob key and a page range, it calls the existing `splitDocument` helper and returns the resulting segment blob key.

This keeps the split I/O out of the poll activity and only incurs the cost when a downstream node actually needs the extracted file.

## Acceptance Criteria

- [ ] **Scenario 1**: Successful extraction
    - **Given** a valid `blobKey`, `groupId`, and `pageRange`
    - **When** the activity is invoked
    - **Then** `splitDocument` is called with `strategy: "custom-ranges"` and `customRanges: [pageRange]`, and the resulting segment blob key is returned

- [ ] **Scenario 2**: `documentId` forwarded when provided
    - **Given** a `documentId` is included in the input
    - **When** `splitDocument` is called
    - **Then** the same `documentId` is passed through

- [ ] **Scenario 3**: `documentId` derived from `blobKey` when absent
    - **Given** `documentId` is not in the input
    - **When** `splitDocument` is called
    - **Then** `documentId` is derived via `extractDocumentId(blobKey)` (the same fallback `splitDocument` itself uses)

- [ ] **Scenario 4**: Output contains segment blob key and page range
    - **Given** a successful extraction
    - **When** the activity returns its output
    - **Then** `segmentBlobKey` is the blob key of the extracted segment and `pageRange` echoes the input range

- [ ] **Scenario 5**: Activity is registered and exported
    - **Given** the activity registry and barrel
    - **When** they are inspected
    - **Then** `document.extractPageRange` resolves to the `extractPageRange` function

## Priority
- [ ] High (Must Have)

## Technical Notes / Assumptions

**File:** `apps/temporal/src/activities/extract-page-range.ts`

**Input:**
```ts
interface ExtractPageRangeInput {
  /** Source document blob key. */
  blobKey: string;
  /** Group ID — used by splitDocument for building the segment blob path. */
  groupId: string;
  /** Page range to extract (1-based, inclusive). */
  pageRange: { start: number; end: number };
  /** Optional document ID. Derived from blobKey via extractDocumentId if absent. */
  documentId?: string;
}
```

**Output:**
```ts
interface ExtractPageRangeOutput {
  /** Blob key of the newly written segment. */
  segmentBlobKey: string;
  /** The extracted page range, echoed from the input. */
  pageRange: { start: number; end: number };
}
```

**Behaviour:**
- Calls `splitDocument({ blobKey, groupId, strategy: "custom-ranges", customRanges: [pageRange], documentId })`.
- `documentId` falls back to `extractDocumentId(blobKey)` if not provided (matching `splitDocument`'s own fallback).
- Returns `segmentBlobKey` (first segment's blob key) and `pageRange`.

**Registration:**
- Activity type string: `"document.extractPageRange"` — add to `REGISTERED_ACTIVITY_TYPES` in `activity-types.ts`.
- Register in `activity-registry.ts` with `defaultTimeout: "5m"` and `maximumAttempts: 3`.
- Export from `activities.ts`.

**Tests:** Mock `splitDocument` directly. No Azure SDK, DB, or blob storage mocking needed.
