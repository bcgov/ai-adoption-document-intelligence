---
status: active
updated: 2026-06-17
canonical_sources:
  - docs-md/BLOB_STORAGE.md
  - apps/backend-services/src/blob-storage/
  - apps/temporal/src/blob-storage/
  - apps/temporal/src/activities/blob-read.ts
do_not_duplicate:
  - Provider configuration runbooks
  - Environment variable inventories
  - SAS token generation details
  - Storage path conventions
---

# Blob Storage

Document bytes, training artifacts, and workflow I/O flow through a unified blob storage abstraction with interchangeable MinIO (local) and Azure Blob (cloud) providers. Azure Document Intelligence training still uses Azure storage directly when SAS URLs are required.

## Source Map

- Architecture and provider selection live in `docs-md/BLOB_STORAGE.md`.
- NestJS provider implementations live in `apps/backend-services/src/blob-storage/`.
- Temporal worker access uses the parallel client under `apps/temporal/src/blob-storage/`.
- Workflow blob read activity lives in `apps/temporal/src/activities/blob-read.ts`.

## Design Notes

- `BLOB_STORAGE_PROVIDER` selects the active backend at runtime; backend and Temporal must agree on provider configuration.
- Prefer the shared interface over provider-specific APIs in application code.
- Training and OCR paths may touch both the unified abstraction and Azure-only services; check which layer a feature uses before changing storage behavior.

## Related Topics

- [System overview](system-overview.md): platform boundaries and where storage sits in the architecture.
- [Graph workflows](graph-workflows.md): blob I/O nodes and workflow activity paths.
- [Deployment and ops](deployment-and-ops.md): environment-specific storage setup and operational runbooks.

## Common Drift Risks

- Backend and Temporal provider configuration can diverge across local, CI, and OpenShift environments.
- README feature lists may mention storage capabilities without matching current provider support.
- Deployment topology changes should trigger a review of blob backup and restore guidance.
