# Canonical Source Registry

This registry names the places the wiki should route readers to before summarizing behavior.

## Repo Orientation

- `README.md`: high-level platform overview, setup, and feature list.
- `apps/README.md`: app-level architecture and development workflow.
- `CLAUDE.md`: contributor and agent rules.
- `docs-md/`: stable Markdown documentation for implementation and operations.
- `feature-docs/`: historical feature requirements, design context, user stories, and implementation notes.
- `docs/`: generated/static documentation site; not the wiki source in v1.

## System Areas

- Backend API: `apps/backend-services/src/`
- Frontend SPA: `apps/frontend/src/`
- Temporal worker: `apps/temporal/src/`
- Shared Prisma schema: `apps/shared/prisma/schema.prisma`
- Shared packages: `packages/`
- Deployment manifests: `deployments/`
- Operational scripts: `scripts/`

## Stable Docs

- Graph workflows: `docs-md/graph-workflows/`
- Workflow builder: `docs-md/workflow-builder/`
- HITL: `docs-md/HITL_ARCHITECTURE.md`
- Authentication: `docs-md/AUTHENTICATION.md`
- Group authorization: `docs-md/GROUP_RESOURCE_AUTHORIZATION.md`
- Blob storage: `docs-md/BLOB_STORAGE.md`
- Tables and extension pattern: `docs-md/TABLES.md`, `docs-md/PATTERNS_NODE_AND_UI.md`
- Load testing: `docs-md/LOAD_TESTING.md`
- Monitoring and alerting: `docs-md/LOCAL_MONITORING_STACK.md`, `docs-md/ALERTING.md`
- OpenShift deployment: `docs-md/openshift-deployment/`

## Code-Adjacent Sources

- Graph workflow package: `packages/graph-workflow/`
- Graph workflow backend validation: `apps/backend-services/src/workflow/`
- OCR workflow start path: `apps/backend-services/src/ocr/`
- Temporal graph runner: `apps/temporal/src/graph-engine/`
- HITL backend: `apps/backend-services/src/hitl/`
- Group backend: `apps/backend-services/src/group/`
- Auth backend: `apps/backend-services/src/auth/`
- Frontend feature areas: `apps/frontend/src/features/`, `apps/frontend/src/pages/`
