# Document Intelligence Platform — Applications

Microservices monorepo: backend API, frontend SPA, Temporal worker, optional Python image service, shared Prisma schema.

**Setup and commands:** [README.md](../README.md)  
**Doc routing (agents):** [docs-md/wiki/index.md](../docs-md/wiki/index.md)

## Applications

| App | Role |
| --- | --- |
| [backend-services/](./backend-services/) | NestJS REST API — documents, OCR, workflows, labeling, training, HITL, auth |
| [frontend/](./frontend/) | React/Vite UI — upload, labeling, workflow JSON editor, review |
| [temporal/](./temporal/) | Temporal worker — graph workflow execution |
| [image-service/](./image-service/) | Python/OpenCV preprocessing (optional) |
| [shared/](./shared/) | Shared Prisma schema and client generation |

Local infrastructure (PostgreSQL, MinIO, Temporal, monitoring) is defined in the repo-root [`docker-compose.yml`](../docker-compose.yml) using compose profiles (`infra`, `temporal`, `monitoring`, etc.).

## Project Structure

```
apps/
├── backend-services/          # NestJS REST API
│   ├── src/
│   │   ├── actor/            # API key management
│   │   ├── auth/             # SSO/JWT and API key auth guard
│   │   ├── blob-storage/     # MinIO / Azure blob abstraction
│   │   ├── workflow/         # Workflow configuration
│   │   └── …                 # document, ocr, hitl, training, etc.
│   └── integration-tests/
├── frontend/                  # React SPA
├── temporal/                  # Temporal worker (graph-engine, activities)
├── image-service/             # Python preprocessing
└── shared/prisma/             # schema.prisma + migrations
```

See [backend-services/README.md](./backend-services/README.md) for module-level API documentation.

## Documentation

- [Graph workflows](../docs-md/graph-workflows/)
- [Workflow builder (design reference)](../docs-md/workflow-builder/)
- [HITL architecture](../docs-md/HITL_ARCHITECTURE.md)
- [Authentication](../docs-md/AUTHENTICATION.md)

Contributor rules: [CLAUDE.md](../CLAUDE.md), [AGENTS.md](../AGENTS.md)
