# US-09: Implement document.flattenClassifiedDocuments Activity

**As a** Workflow Designer,
**I want to** convert the `labeledDocuments` map from classifier results into a flat array,
**So that** a `map` node can iterate over every detected document segment regardless of label, passing each one's page range and label to a downstream `document.extractPageRange` node.

## Context

`azureClassify.poll` outputs `labeledDocuments` as `Record<label, ClassifiedDocument[]>`. A graph `map` node requires a flat array in context to iterate over. This activity produces that array, optionally filtered to a subset of labels, so a single `map → extractPageRange → join` pattern can process all detected segments in parallel.

This is the companion to US-08: US-08 handles the single-label single-segment case; this activity handles the multi-label or multi-segment fan-out case.

## Acceptance Criteria

- [ ] **Scenario 1**: All labels flattened into ordered array
    - **Given** `labeledDocuments` with multiple labels and multiple entries per label
    - **When** the activity is invoked with no `filterLabels`
    - **Then** the output `segments` array contains one entry per detected document across all labels, each entry carrying `label`, `pageRange`, and `confidence`; entries are sorted by `pageRange.start` ascending

- [ ] **Scenario 2**: `filterLabels` restricts output to named labels
    - **Given** `labeledDocuments` contains labels `["invoice", "receipt", "cover"]` and `filterLabels` is `["invoice", "receipt"]`
    - **When** the activity is invoked
    - **Then** only entries for `invoice` and `receipt` are in `segments`; `cover` entries are excluded

- [ ] **Scenario 3**: `filterLabels` contains a label not present in `labeledDocuments`
    - **Given** `filterLabels` includes `"missing-label"` but that label does not appear in `labeledDocuments`
    - **When** the activity is invoked
    - **Then** the activity succeeds and the absent label simply contributes no entries (no error thrown)

- [ ] **Scenario 4**: `labeledDocuments` is empty or null
    - **Given** `labeledDocuments` is an empty object or null/undefined
    - **When** the activity is invoked
    - **Then** `segments` is an empty array and no error is thrown

- [ ] **Scenario 5**: Activity is registered and exported
    - **Given** the activity registry and barrel
    - **When** they are inspected
    - **Then** `document.flattenClassifiedDocuments` resolves to the `flattenClassifiedDocuments` function

## Priority
- [ ] High (Must Have)

## Technical Notes / Assumptions

**File:** `apps/temporal/src/activities/flatten-classified-documents.ts`

**Input:**
```ts
interface FlattenClassifiedDocumentsInput {
  /** Output of azureClassify.poll. */
  labeledDocuments: Record<string, ClassifiedDocument[]>;
  /**
   * Optional allow-list of labels to include.
   * When omitted, all labels are included.
   */
  filterLabels?: string[];
}
```

**Output:**
```ts
interface FlattenClassifiedDocumentsOutput {
  /** Flat, page-ordered array of detected document segments. */
  segments: ClassifiedSegment[];
}

interface ClassifiedSegment {
  /** The classifier label assigned to this segment. */
  label: string;
  /** 1-based, inclusive page range. */
  pageRange: { start: number; end: number };
  /** Classifier confidence score. */
  confidence: number;
}
```

**Behaviour:**
- Iterates over `Object.entries(labeledDocuments)`.
- If `filterLabels` is provided, skips labels not in the list.
- Flattens each label's array into the output, tagging each entry with its `label`.
- Sorts the final array by `pageRange.start` ascending.
- Returns `{ segments: [] }` for empty or nullish input without throwing.
- Import `ClassifiedDocument` from `./azure-classify-poll`.

**Typical workflow usage:**
```json
{
  "id": "flattenSegments",
  "type": "activity",
  "label": "Flatten Classifier Results",
  "activityType": "document.flattenClassifiedDocuments",
  "inputs": [
    { "port": "labeledDocuments", "ctxKey": "labeledDocuments" }
  ],
  "outputs": [
    { "port": "segments", "ctxKey": "segments" }
  ],
  "parameters": { "filterLabels": ["invoice", "receipt"] }
},
{
  "id": "processSegments",
  "type": "map",
  "label": "Extract Each Segment",
  "collectionCtxKey": "segments",
  "itemCtxKey": "currentSegment",
  "bodyEntryNodeId": "extractSegmentBranch",
  "bodyExitNodeId": "extractSegmentBranch"
}
```

**Registration:**
- Activity type string: `"document.flattenClassifiedDocuments"` — add to `REGISTERED_ACTIVITY_TYPES` in `activity-types.ts`.
- Register in `activity-registry.ts` with `defaultTimeout: "30s"` and `maximumAttempts: 1` (pure in-memory transform — no retry benefit).
- Export from `activities.ts`.

**Tests:** Unit tests required. Cover all five scenarios above. Mock `../logger`.
