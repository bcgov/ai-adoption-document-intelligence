# Canonical Source Registry

This registry names the places the wiki should route readers to before summarizing behavior. When a wiki topic exists, read it for cross-source orientation before opening the canonical paths below.

## Wiki Topic Routing

| Canonical area | Wiki topic |
| --- | --- |
| Platform shape and app boundaries | [System overview](system-overview.md) |
| `docs-md/workflows/` | [Graph workflows](graph-workflows.md) |
| `docs-md/extraction/` | [Extraction](extraction.md) |
| `docs-md/workflows/` | [Workflow builder](workflow-builder.md) |
| `docs-md/architecture/TABLES.md`, `docs-md/architecture/PATTERNS_NODE_AND_UI.md` | [Tables and extensions](tables-and-extensions.md) |
| `docs-md/architecture/BLOB_STORAGE.md` | [Blob storage](blob-storage.md) |
| `docs-md/architecture/HITL_ARCHITECTURE.md` | [HITL](hitl.md) |
| `docs-md/auth/AUTHENTICATION.md`, `docs-md/auth/GROUP_RESOURCE_AUTHORIZATION.md`, `docs-md/groups/` | [Auth and groups](auth-and-groups.md) |
| `docs-md/operations/`, load testing, monitoring, CI workflows | [Deployment and ops](deployment-and-ops.md) |

Maintenance and registry pages: [Sources](sources.md), [Open questions](open-questions.md), [Log](log.md).

## Repo Orientation

- `README.md`: high-level platform overview, setup, and feature list.
- `apps/README.md`: app-level architecture and development workflow.
- `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`: contributor and agent rules.
- `docs-md/`: stable Markdown documentation for implementation and operations.
- `docs-md/archive/README.md`: index of historical docs and stale patterns to avoid.
- `feature-docs/`: historical feature requirements, design context, user stories, and implementation notes — see `docs-md/archive/README.md`.
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

- Graph workflows: `docs-md/workflows/` — wiki: [Graph workflows](graph-workflows.md)
- Extraction: `docs-md/extraction/` — wiki: [Extraction](extraction.md)
- Workflow builder: `docs-md/workflows/` — wiki: [Workflow builder](workflow-builder.md)
- HITL: `docs-md/architecture/HITL_ARCHITECTURE.md` — wiki: [HITL](hitl.md)
- Authentication: `docs-md/auth/AUTHENTICATION.md` — wiki: [Auth and groups](auth-and-groups.md)
- Group authorization: `docs-md/auth/GROUP_RESOURCE_AUTHORIZATION.md` — wiki: [Auth and groups](auth-and-groups.md)
- Blob storage: `docs-md/architecture/BLOB_STORAGE.md` — wiki: [Blob storage](blob-storage.md)
- Tables and extension pattern: `docs-md/architecture/TABLES.md`, `docs-md/architecture/PATTERNS_NODE_AND_UI.md` — wiki: [Tables and extensions](tables-and-extensions.md)
- Load testing: `docs-md/benchmarking/LOAD_TESTING.md` — wiki: [Deployment and ops](deployment-and-ops.md)
- Monitoring and alerting: `docs-md/monitoring/LOCAL_MONITORING_STACK.md`, `docs-md/monitoring/ALERTING.md` — wiki: [Deployment and ops](deployment-and-ops.md)
- OpenShift deployment: `docs-md/operations/` — wiki: [Deployment and ops](deployment-and-ops.md)

## Code-Adjacent Sources

- Graph workflow package: `packages/graph-workflow/` (graph types/validator + config hashing and override helpers)
- Temporal payload codec: `packages/temporal-payload-codec/` (gzip payload codec for worker and clients)
- Graph workflow backend validation: `apps/backend-services/src/workflow/`
- OCR workflow start path: `apps/backend-services/src/ocr/`
- Temporal graph runner: `apps/temporal/src/graph-engine/`
- HITL backend: `apps/backend-services/src/hitl/`
- Group backend: `apps/backend-services/src/group/`
- Auth backend: `apps/backend-services/src/auth/`
- Frontend feature areas: `apps/frontend/src/features/`, `apps/frontend/src/pages/`
