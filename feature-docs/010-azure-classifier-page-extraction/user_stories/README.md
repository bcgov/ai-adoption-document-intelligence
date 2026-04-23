# User Stories: Azure Classifier Page Extraction Activity

Feature folder: `feature-docs/010-azure-classifier-page-extraction`

---

## Phase 1 — Backend Infrastructure

These stories establish the foundational pieces that the Temporal activities depend on.

- [ ] [US-01: Extend BlobStorageClient with SAS URL Generation](./US-01-extend-blob-storage-sas-url.md)
- [ ] [US-02: Register azureClassify Activity Types](./US-02-register-activity-types.md)

---

## Phase 2 — Temporal Activities

Core activity implementations. US-03 and US-04 depend on Phase 1 being complete. US-04 depends on US-03's output types.

- [ ] [US-03: Implement azureClassify.submit Activity](./US-03-implement-submit-activity.md)
- [ ] [US-04: Implement azureClassify.poll Activity](./US-04-implement-poll-activity.md)

---

## Phase 3 — Frontend

Frontend stories are independent of Phase 2 but logically follow once the activity types are defined (US-02).

- [ ] [US-05: Create AzureClassifySubmitForm Frontend Component](./US-05-create-frontend-form-component.md)
- [ ] [US-06: Integrate AzureClassifySubmitForm into Workflow Builder](./US-06-integrate-form-into-workflow-builder.md)
