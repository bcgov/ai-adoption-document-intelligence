# File Inventory — apps/backend-services

**Inventory Date**: 2026-04-09
**Target**: `apps/backend-services/src/` (excluding `generated/`)

## Summary by Category

| Category | Count | Security-Relevant |
|----------|-------|-------------------|
| Source code (non-test, non-DTO .ts) | 140 | Yes |
| DTO classes (.ts in dto/) | 91 | Yes (input validation) |
| Test files (.spec.ts) | 99 | No (testing analysis only) |
| Configuration (root-level JSON/YAML/env) | 11 | Yes |
| Build/Deploy (Dockerfile, docker-compose) | 2 | Yes |
| Database schema (Prisma) | 1 (769 lines) | Yes |
| SQL Migrations | 8 (in apps/shared/prisma/migrations/) | Yes |
| Integration tests | 8 | No |
| Scripts | 1 (init-minio.sh) | Yes |
| Test fixtures | 3 (JSON) | Low |
| Data/assets (images, PDFs) | ~30+ | No |
| **Total security-relevant** | **~252** | |

## Architecture Components

### 1. Authentication & Authorization (auth/)
- Source: 17 files
- Key files: auth.controller.ts, auth.service.ts, identity.guard.ts, jwt-auth.guard.ts, api-key-auth.guard.ts, csrf.guard.ts, keycloak-jwt.strategy.ts, cookie-auth.utils.ts
- Tests: 12 spec files
- DTOs: 4 files

### 2. Actor / API Key Management (actor/)
- Source: 5 files
- Key files: api-key.controller.ts, api-key.service.ts, api-key-db.service.ts, user-db.service.ts, user.service.ts
- Tests: 4 spec files
- DTOs: 1 file

### 3. Document Processing (document/)
- Source: 4 files
- Key files: document.controller.ts, document.service.ts, document-db.service.ts
- Tests: 3 spec files
- DTOs: 5 files

### 4. Azure Integration (azure/)
- Source: 6 files
- Key files: azure.controller.ts, azure.service.ts, classifier-db.service.ts, classifier-poller.service.ts, classifier.service.ts
- Tests: 5 spec files
- DTOs: 4 files

### 5. Blob Storage (blob-storage/)
- Source: 4 files
- Key files: azure-blob-provider.service.ts, azure-storage.service.ts, minio-blob-storage.service.ts
- Tests: 3 spec files
- DTOs: 1 interface file

### 6. Benchmarking System (benchmark/)
- Source: 22 files (largest component)
- Key files: benchmark-*.controller.ts, benchmark-*.service.ts, dataset.*, evaluator-registry.*, ground-truth-*, hitl-dataset.*, ocr-improvement-pipeline.*
- Tests: 22 spec files
- DTOs: 35 files

### 7. HITL (Human-in-the-Loop) (hitl/)
- Source: 7 files
- Key files: hitl.controller.ts, hitl.service.ts, review-db.service.ts, analytics.service.ts
- Tests: 5 spec files
- DTOs: 6 files

### 8. Template Model / Labeling (template-model/)
- Source: 8 files
- Key files: template-model.controller.ts, template-model.service.ts, labeling-document-db.service.ts, suggestion.service.ts, format-suggestion.service.ts
- Tests: 7 spec files
- DTOs: 9 files

### 9. Workflow Engine (workflow/)
- Source: 9 files
- Key files: workflow.controller.ts, workflow.service.ts, activity-registry.ts, graph-schema-validator.ts, workflow-validator.ts
- Tests: 5 spec files
- DTOs: 2 files

### 10. Training (training/)
- Source: 5 files
- Key files: training.controller.ts, training.service.ts, training-db.service.ts, training-poller.service.ts
- Tests: 4 spec files
- DTOs: 3 files

### 11. Upload (upload/)
- Source: 2 files
- Key files: upload.controller.ts
- Tests: 1 spec file
- DTOs: 2 files

### 12. Group Management (group/)
- Source: 4 files
- Key files: group.controller.ts, group.service.ts, group-db.service.ts
- Tests: 3 spec files
- DTOs: 8 files

### 13. Queue Service (queue/)
- Source: 2 files
- Key files: queue.service.ts
- Tests: 1 spec file

### 14. OCR Service (ocr/)
- Source: 3 files
- Key files: ocr.controller.ts, ocr.service.ts
- Tests: 2 spec files

### 15. Temporal Integration (temporal/)
- Source: 3 files
- Key files: temporal-client.service.ts, workflow-constants.ts, workflow-types.ts
- Tests: 1 spec file

### 16. Audit System (audit/)
- Source: 4 files
- Key files: audit.service.ts, audit-db.service.ts
- Tests: 2 spec files
- DTOs: 1 types file

### 17. Confusion Profile (confusion-profile/)
- Source: 3 files
- Key files: confusion-profile.controller.ts, confusion-profile.service.ts
- Tests: 1 spec file
- DTOs: 4 files

### 18. Bootstrap (bootstrap/)
- Source: 3 files
- Key files: bootstrap.controller.ts, bootstrap.service.ts
- Tests: 1 spec file
- DTOs: 3 files

### 19. Infrastructure (logging/, metrics/, database/, utils/)
- Source: 10 files
- Key files: app-logger.service.ts, logging.middleware.ts, request-logging.interceptor.ts, metrics.controller.ts, metrics.service.ts, prisma.service.ts, database-url.ts, env-loader.ts
- Tests: 7 spec files

### 20. Application Root
- Source: 2 files (main.ts, app.module.ts)

## Configuration Files (Root Level)

| File | Type | Security-Relevant |
|------|------|-------------------|
| .env | Environment config | YES — secrets |
| .env.sample | Template | YES — patterns |
| Dockerfile | Container build | YES — security |
| docker-compose.yml | Container orchestration | YES — network/ports |
| package.json | Dependencies | YES — versions |
| tsconfig.json | TypeScript config | LOW |
| tsconfig.build.json | Build config | LOW |
| nest-cli.json | NestJS config | LOW |
| biome.json | Linter config | LOW |
| biome.new.backend.json | Linter config | LOW |
| prisma.config.ts | Prisma config | YES — DB connection |

## Dispatch Strategy

**Scale**: Medium (140 source + 91 DTOs = 231 security-relevant source files)
**Strategy**: One subagent per module (10 subagents total, standard dispatch)
