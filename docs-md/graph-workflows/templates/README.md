# Graph Workflow Templates

This folder holds example [graph workflow](../DAG_WORKFLOW_ENGINE.md) configuration files. Each JSON file is a valid `GraphWorkflowConfig` that can be used as a starting point or reference.

| File | Description |
|------|-------------|
| `standard-ocr-workflow.json` | Standard OCR processing: file prepare → Azure OCR submit/poll → result cleaning and confidence checks. Equivalent to the legacy single-document OCR workflow. |
| `multi-page-report-workflow.json` | Multi-page report: initial full-document OCR, keyword-based split/classify, type-specific child workflows per segment, and field validation. Demonstrates map/join and switch patterns. |
| `azure-classifier-extraction-workflow.json` | Azure classifier-based page extraction: submit a document to Azure Document Intelligence for classification, poll for labeled page ranges, then extract a single segment. Starting point for classifier-driven split workflows. |

These templates are validated by the graph schema validator tests in `apps/backend-services`.

---

## Azure Classifier Extraction — Multi-Segment Pattern

`azure-classifier-extraction-workflow.json` demonstrates the linear single-segment path. When a document contains **multiple detected segments** (e.g. one invoice and two receipts), extend the workflow as follows:

### Data shape from `azureClassify.poll`

```json
{
  "labeledDocuments": {
    "invoice": [{ "confidence": 0.97, "pageRange": { "start": 1, "end": 3 } }],
    "receipt": [
      { "confidence": 0.94, "pageRange": { "start": 4, "end": 5 } },
      { "confidence": 0.91, "pageRange": { "start": 6, "end": 7 } }
    ]
  }
}
```

### Multi-segment approach

1. **Flatten `labeledDocuments` into an array** before the `map` node. Because `labeledDocuments` is a `Record<label, ClassifiedDocument[]>`, add an intermediate activity (or inline helper) that produces a flat `segments` array like:

   ```json
   [
     { "label": "invoice", "pageRange": { "start": 1, "end": 3 } },
     { "label": "receipt", "pageRange": { "start": 4, "end": 5 } },
     { "label": "receipt", "pageRange": { "start": 6, "end": 7 } }
   ]
   ```

2. **Replace `extractSegment`** with a `map` node over `ctx.segments`:

   ```json
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

3. **Branch node** calls `document.extractPageRange` using `currentSegment.pageRange` and `currentSegment.label`:

   ```json
   {
     "id": "extractSegmentBranch",
     "type": "activity",
     "activityType": "document.extractPageRange",
     "inputs": [
       { "port": "blobKey", "ctxKey": "blobKey" },
       { "port": "groupId", "ctxKey": "groupId" },
       { "port": "pageRange", "ctxKey": "currentSegment.pageRange" }
     ],
     "outputs": [
       { "port": "segmentBlobKey", "ctxKey": "currentSegment.segmentBlobKey" }
     ]
   }
   ```

4. **Join** the results with a `join` node and pass them to downstream processing (OCR, enrichment, etc.).
