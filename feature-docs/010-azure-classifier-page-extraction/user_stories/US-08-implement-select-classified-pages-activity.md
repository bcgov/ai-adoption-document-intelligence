# US-08: Implement document.selectClassifiedPages Activity

**As a** Workflow Designer,
**I want to** extract all page ranges for a specific document label from classifier results,
**So that** downstream nodes have a concrete, ordered list of `pageRange` values to operate on without requiring raw JSON manipulation.

## Context

`azureClassify.poll` outputs `labeledDocuments` — a `Record<label, ClassifiedDocument[]>` where each entry holds a list of detected documents with their confidence score and page range. There is currently no workflow-native way to read a specific label's page range(s) from that structure, because the graph engine's port bindings only support dot-notation on known ctx key paths (not dynamic key lookups by runtime value).

This activity bridges that gap for the **known-label** case: given `labeledDocuments` and a `targetLabel`, it returns **all** matching entries as an ordered array. The caller decides whether to use a single entry directly or feed the array into a `map` node for parallel extraction. For the **all-labels fan-out** case (where labels are not known at design time), see US-09.

## Acceptance Criteria

- [ ] **Scenario 1**: Target label found — single result
    - **Given** `labeledDocuments` contains exactly one entry for `targetLabel`
    - **When** the activity is invoked
    - **Then** `segments` contains that single entry with `pageRange` and `confidence`, sorted by `pageRange.start`

- [ ] **Scenario 2**: Target label found — multiple results, all returned
    - **Given** `labeledDocuments` contains multiple entries for `targetLabel`
    - **When** the activity is invoked
    - **Then** `segments` contains all entries for that label, sorted by `pageRange.start` ascending

- [ ] **Scenario 3**: Target label not found
    - **Given** `labeledDocuments` does not contain an entry for `targetLabel`
    - **When** the activity is invoked
    - **Then** a descriptive non-retryable error is thrown naming the missing label and listing the available labels

- [ ] **Scenario 4**: `labeledDocuments` is empty or null
    - **Given** `labeledDocuments` is an empty object or null/undefined
    - **When** the activity is invoked
    - **Then** a descriptive non-retryable error is thrown

- [ ] **Scenario 5**: Activity is registered and exported
    - **Given** the activity registry and barrel
    - **When** they are inspected
    - **Then** `document.selectClassifiedPages` resolves to the `selectClassifiedPages` function

## Priority
- [ ] High (Must Have)

## Technical Notes / Assumptions

**File:** `apps/temporal/src/activities/select-classified-pages.ts`

**Input:**
```ts
interface SelectClassifiedPagesInput {
  /** Output of azureClassify.poll — keyed by classifier label. */
  labeledDocuments: Record<string, ClassifiedDocument[]>;
  /** The classifier label to select all page ranges for. */
  targetLabel: string;
}
```

**Output:**
```ts
interface SelectClassifiedPagesOutput {
  /** All detected segments for the target label, sorted by pageRange.start ascending. */
  segments: Array<{
    pageRange: { start: number; end: number };
    confidence: number;
  }>;
}
```

**Behaviour:**
- Looks up `labeledDocuments[targetLabel]`. If missing or empty, throws a non-retryable `ApplicationFailure` naming the label and listing available labels.
- Returns all entries for the label, sorted by `pageRange.start` ascending.
- Import `ClassifiedDocument` from `./azure-classify-poll` (the type is already defined there).

**Typical workflow usage — single segment (index directly):**
```json
{
  "id": "selectInvoicePages",
  "type": "activity",
  "label": "Select Invoice Page Ranges",
  "activityType": "document.selectClassifiedPages",
  "inputs": [
    { "port": "labeledDocuments", "ctxKey": "labeledDocuments" }
  ],
  "outputs": [
    { "port": "segments", "ctxKey": "invoiceSegments" }
  ],
  "parameters": { "targetLabel": "invoice" }
}
```

When only one segment is expected, pass `invoiceSegments` into a `map` node with a single-iteration body, or use `invoiceSegments[0].pageRange` via ctx dot-notation in a subsequent activity's inputs.

**Typical workflow usage — multiple segments (map node):**
```json
{
  "id": "processInvoices",
  "type": "map",
  "label": "Extract Each Invoice Segment",
  "collectionCtxKey": "invoiceSegments",
  "itemCtxKey": "currentInvoice",
  "bodyEntryNodeId": "extractInvoiceBranch",
  "bodyExitNodeId": "extractInvoiceBranch"
}
```

**Registration:**
- Activity type string: `"document.selectClassifiedPages"` — add to `REGISTERED_ACTIVITY_TYPES` in `activity-types.ts`.
- Register in `activity-registry.ts` with `defaultTimeout: "30s"` and `maximumAttempts: 1` (deterministic — no retry benefit).
- Export from `activities.ts`.

**Tests:** Unit tests required. Cover all five scenarios above. Mock `../logger`.
