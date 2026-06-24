# Canonical Source Registry

This registry names the places the wiki should route readers to before summarizing behavior. When a wiki topic exists, read it for cross-source orientation before opening the canonical paths below.

## Wiki Topic Routing

| Canonical area | Wiki topic |
| --- | --- |
| Platform shape and app boundaries | [System overview](system-overview.md) |
| `docs-md/graph-workflows/` | [Graph workflows](graph-workflows.md) |
| `docs-md/workflow-builder/` | [Workflow builder](workflow-builder.md) |
| `docs-md/TABLES.md`, `docs-md/PATTERNS_NODE_AND_UI.md` | [Tables and extensions](tables-and-extensions.md) |
| `docs-md/BLOB_STORAGE.md` | [Blob storage](blob-storage.md) |
| `docs-md/HITL_ARCHITECTURE.md` | [HITL](hitl.md) |
| `docs-md/AUTHENTICATION.md`, `docs-md/GROUP_RESOURCE_AUTHORIZATION.md`, `docs-md/group/` | [Auth and groups](auth-and-groups.md) |
| `docs-md/openshift-deployment/`, load testing, monitoring, CI workflows | [Deployment and ops](deployment-and-ops.md) |

Maintenance and registry pages: [Sources](sources.md), [Open questions](open-questions.md), [Log](log.md).

## Repo Orientation

- `README.md`: high-level platform overview, setup, and feature list.
- `apps/README.md`: app-level architecture and development workflow.
- `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`: contributor and agent rules.
- `docs-md/`: stable Markdown documentation for implementation and operations.
- `docs-md/ARCHIVE.md`: index of historical docs and stale patterns to avoid.
- `feature-docs/`: historical feature requirements, design context, user stories, and implementation notes — see `docs-md/ARCHIVE.md`.
- `docs/`: generated/static documentation site; wiki HTML is built at deploy time, not committed.

## System Areas

- Backend API: `apps/backend-services/src/`
- Frontend SPA: `apps/frontend/src/`
- Temporal worker: `apps/temporal/src/`
- Shared Prisma schema: `apps/shared/prisma/schema.prisma`
- Shared packages: `packages/`
- Deployment manifests: `deployments/`
- Operational scripts: `scripts/`

## Stable Docs

- Graph workflows: `docs-md/graph-workflows/` — wiki: [Graph workflows](graph-workflows.md)
- Workflow builder: `docs-md/workflow-builder/` — wiki: [Workflow builder](workflow-builder.md)
- HITL: `docs-md/HITL_ARCHITECTURE.md` — wiki: [HITL](hitl.md)
- Authentication: `docs-md/AUTHENTICATION.md` — wiki: [Auth and groups](auth-and-groups.md)
- Group authorization: `docs-md/GROUP_RESOURCE_AUTHORIZATION.md` — wiki: [Auth and groups](auth-and-groups.md)
- Blob storage: `docs-md/BLOB_STORAGE.md` — wiki: [Blob storage](blob-storage.md)
- Tables and extension pattern: `docs-md/TABLES.md`, `docs-md/PATTERNS_NODE_AND_UI.md` — wiki: [Tables and extensions](tables-and-extensions.md)
- Load testing: `docs-md/LOAD_TESTING.md` — wiki: [Deployment and ops](deployment-and-ops.md)
- Monitoring and alerting: `docs-md/LOCAL_MONITORING_STACK.md`, `docs-md/ALERTING.md` — wiki: [Deployment and ops](deployment-and-ops.md)
- OpenShift deployment: `docs-md/openshift-deployment/` — wiki: [Deployment and ops](deployment-and-ops.md)

## Code-Adjacent Sources

- Graph workflow package: `packages/graph-workflow/`
- Graph workflow backend validation: `apps/backend-services/src/workflow/`
- OCR workflow start path: `apps/backend-services/src/ocr/`
- Temporal graph runner: `apps/temporal/src/graph-engine/`
- HITL backend: `apps/backend-services/src/hitl/`
- Group backend: `apps/backend-services/src/group/`
- Auth backend: `apps/backend-services/src/auth/`
- Frontend feature areas: `apps/frontend/src/features/`, `apps/frontend/src/pages/`
