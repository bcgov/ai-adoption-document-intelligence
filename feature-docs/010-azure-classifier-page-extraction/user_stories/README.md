# User Stories: Azure Classifier Page Extraction Activity

Feature folder: `feature-docs/010-azure-classifier-page-extraction`

---

## Phase 1 — Backend Infrastructure

These stories establish the foundational pieces that the Temporal activities depend on.

- [x] [US-01: Extend BlobStorageClient with SAS URL Generation](./US-01-extend-blob-storage-sas-url.md)
- [x] [US-02: Register azureClassify Activity Types](./US-02-register-activity-types.md)

---

## Phase 2 — Temporal Activities

Core activity implementations. US-03 and US-04 depend on Phase 1 being complete. US-04 depends on US-03's output types.

- [x] [US-03: Implement azureClassify.submit Activity](./US-03-implement-submit-activity.md)
- [x] [US-04: Implement azureClassify.poll Activity](./US-04-implement-poll-activity.md)
- [x] [US-07: Implement document.extractPageRange Activity](./US-07-implement-extract-page-range-activity.md)

---

## Phase 3 — Frontend

Frontend stories are independent of Phase 2 but logically follow once the activity types are defined (US-02).

- [x] [US-05: Create AzureClassifySubmitForm Frontend Component](./US-05-create-frontend-form-component.md)
- [x] [US-06: Integrate AzureClassifySubmitForm into Workflow Builder](./US-06-integrate-form-into-workflow-builder.md)

---

## Phase 4 — Classifier Result Navigation

These activities bridge the gap between `azureClassify.poll` output and downstream page extraction. Without them, workflow designers have no way to route a specific label's page range to `document.extractPageRange` — the `labeledDocuments` structure is a keyed map that cannot be traversed by static port bindings alone.

- US-08 covers the **single-label, single-segment** case (pick the best-matching page range for one label).
- US-09 covers the **multi-segment fan-out** case (flatten all results into an array for a `map` node).

- [x] [US-08: Implement document.selectClassifiedPages Activity](./US-08-implement-select-classified-pages-activity.md)
- [x] [US-09: Implement document.flattenClassifiedDocuments Activity](./US-09-implement-flatten-classified-documents-activity.md)
