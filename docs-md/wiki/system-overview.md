---
status: active
updated: 2026-06-17
canonical_sources:
  - README.md
  - apps/README.md
  - apps/backend-services/src/
  - apps/frontend/src/
  - apps/temporal/src/
  - apps/image-service/
  - apps/shared/prisma/schema.prisma
do_not_duplicate:
  - Full setup instructions
  - Complete feature lists
  - Database schema details
  - API endpoint details
---

# System Overview

The platform is a document intelligence monorepo with a React frontend, NestJS backend, Temporal worker, Python image service, shared Prisma schema, and supporting packages. The wiki should use this page as a routing layer, not as a replacement for the top-level READMEs.

## Primary Boundaries

- Backend services own REST APIs, document metadata, OCR orchestration, workflow configuration, training, HITL, auth, groups, and operational API behavior.
- The frontend owns the user workflow for document upload, labeling, workflow visualization, review, group context, and feature-specific administration.
- The Temporal worker owns durable DAG workflow execution and activity dispatch.
- The image service owns optional preprocessing behavior such as denoising, deskewing, orientation, and resizing.
- Shared packages and the shared Prisma schema hold cross-app types, validation, and persistence contracts.

## Related Topics

- [Graph workflows](graph-workflows.md): durable execution and activity boundaries.
- [Blob storage](blob-storage.md): document bytes and artifact storage across services.
- [Auth and groups](auth-and-groups.md): authentication and group scoping model.
- [Deployment and ops](deployment-and-ops.md): running the platform locally and in OpenShift.

## Read First

- Use `README.md` for platform overview, prerequisites, and root commands.
- Use `apps/README.md` for app-level responsibilities and development commands.
- Use `docs-md/SHARED_PACKAGES.md` before extracting cross-app TypeScript code.
- Use `apps/shared/prisma/schema.prisma` as the source of truth for persisted models.

## Common Drift Risks

- Top-level READMEs can drift from actual app boundaries as features move between backend, frontend, Temporal, and packages.
- Generated code under `apps/backend-services/src/generated/` and `apps/temporal/src/generated/` should not be hand-documented as stable source.
- `feature-docs/` may describe intended behavior that has since changed in implementation.
