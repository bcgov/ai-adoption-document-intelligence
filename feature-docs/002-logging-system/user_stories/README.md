# Logging System — User Stories

Requirements document: [../REQUIREMENTS.md](../REQUIREMENTS.md).

User story files are in `feature-docs/002-logging-system/user_stories/`. Implement in the order below; check off when done.

## Foundation (US-001 to US-002) — HIGH priority

| File | Title |
|------|--------|
| `US-001-log-format-schema-and-types.md` | Define log format schema and shared TypeScript types |
| `US-002-shared-logging-module.md` | Implement shared logging module (NDJSON, LOG_LEVEL default info, API, redaction, failure fallback to stderr) |

## Backend and Worker Integration (US-003 to US-005) — HIGH priority

| File | Title |
|------|--------|
| `US-003-backend-shared-logger-request-id.md` | Backend use shared logger with request-scoped requestId; route Prisma/third-party through shared logger |
| `US-004-temporal-worker-shared-logger.md` | Temporal worker use shared logger with workflow/activity context |
| `US-005-correlation-ids-backend-to-temporal.md` | Propagate requestId from backend to Temporal workflow |

## Documentation (US-006) — HIGH priority

| File | Title |
|------|--------|
| `US-006-logging-documentation.md` | Logging system documentation (docs/LOGGING.md; stdout only, LOG_LEVEL default info) |

## Suggested Implementation Order (by dependency)

### Phase 1 — Schema and shared module
- [ ] **US-001** — Log format schema and types (shared types used by US-002)
- [ ] **US-002** — Shared logging module (used by US-003, US-004)

### Phase 2 — Backend and worker
- [ ] **US-003** — Backend shared logger and requestId
- [ ] **US-004** — Temporal worker shared logger
- [ ] **US-005** — Correlation IDs (requestId in workflow input; depends on US-003 and US-004)

### Phase 3 — Documentation
- [ ] **US-006** — Logging documentation (can be done in parallel or after Phase 2)
