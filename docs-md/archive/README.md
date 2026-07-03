# Archived and Historical Documentation

Everything in this folder is a **point-in-time artifact** — reports, audits, one-off analyses, and completed plans. It is **not canonical** for current behavior. For implementation truth, follow the topic folders in [docs-md/](../README.md), code, and [wiki/index.md](../wiki/index.md).

## Archival policy

A doc moves here (with `git mv`, preserving history) when it stops describing current behavior:

- Reports and one-off analyses (load test reports, assessments, PR reviews)
- Completed migration/refactor plans and their status trackers
- Superseded requirements documents (canonical requirements live in `feature-docs/`)

Delete instead of archiving only when a doc has no historical value at all.

## Contents

| Path | What it was | Canonical alternative |
| --- | --- | --- |
| `temp/` | Feb 2026 OAuth refactor plan and auth security audits | [auth/AUTHENTICATION.md](../auth/AUTHENTICATION.md), `apps/backend-services/src/auth/`, `apps/backend-services/src/actor/` |
| `DATABASE_ROLES.md` | Removed Role/UserRole table schema (RolesGuard/@Roles) | [auth/AUTHENTICATION.md](../auth/AUTHENTICATION.md) — current model: `User.is_system_admin` + `GroupRole` on UserGroup via `@Identity()`/IdentityGuard; [auth/GROUP_RESOURCE_AUTHORIZATION.md](../auth/GROUP_RESOURCE_AUTHORIZATION.md) |
| `rapid-assessment-2026-04-09/` | Rapid security/architecture assessment of backend-services | Current ops/security docs in topic folders |
| `pr-88-review.md` | April 2026 deep review of PR #88 | Merged code |
| `LOAD_TEST_REPORT_2026-05.md` | May 2026 load test results | [benchmarking/LOAD_TESTING.md](../benchmarking/LOAD_TESTING.md) for the current runbook |
| `benchmarking-fixes-checklist.md` | March 2026 benchmarking UI bug checklist | Fixed in code |
| `benchmarking-temporal-history-bloat-fix.md` | May 2026 incident/fix note | [TEMPORAL_DATA_FOOTPRINT_REDUCTION_PLAN.md](TEMPORAL_DATA_FOOTPRINT_REDUCTION_PLAN.md) context; shipped behavior in code |
| `TEMPORAL_DATA_FOOTPRINT_REDUCTION_PLAN.md` + `TEMPORAL_FOOTPRINT_IMPLEMENTATION_STATUS.md` | Temporal history footprint reduction plan and status | Shipped behavior: [workflows/page-extract-blob-path.md](../workflows/page-extract-blob-path.md), [workflows/DAG_WORKFLOW_ENGINE.md](../workflows/DAG_WORKFLOW_ENGINE.md) |
| `OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md` | Feature 008 requirements source | `feature-docs/008-ocr-correction-agentic-sdlc/`; shipped behavior in [extraction/OCR_IMPROVEMENT_PIPELINE.md](../extraction/OCR_IMPROVEMENT_PIPELINE.md) |
| `LOGGING_CATEGORIES_2026-03.md` | March 2026 logging-system doc (categories/format), formerly `docs/LOGGING.md` | [monitoring/LOGGING.md](../monitoring/LOGGING.md); `feature-docs/007-logging-system/` |

## Historical locations outside this folder

| Path | Purpose | Canonical alternative |
| --- | --- | --- |
| `docs/superpowers/` | Pre-implementation plans and specs | Shipped behavior in `docs-md/` and code |
| `feature-docs/` | Requirements, user stories, design for delivered features | Stable docs in `docs-md/` topic folders; wiki routes by topic |

## Known stale patterns in historical docs

Do not copy these into new documentation:

- `apps/backend-services/docker-compose.yml` or `apps/temporal/docker-compose.yaml` — use repo-root `docker-compose.yml`
- `deployments/local/docker-compose.monitoring.yml` — use `docker compose --profile monitoring`
- `apps/backend-services/src/api-key/` — use `src/actor/` (management) and `src/auth/api-key-auth.guard.ts` (validation)
- `docs-md/<TOPIC>.md` flat paths — docs now live in topic folders (see [docs-md/README.md](../README.md))
