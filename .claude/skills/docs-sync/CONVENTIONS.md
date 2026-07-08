# Docs Conventions

## Topic taxonomy (docs-md/)

| Folder | Scope |
| --- | --- |
| `architecture/` | System-level design: HITL architecture, database services/roles, transaction/audit compliance, blob storage, document content hash, ephemeral document cleanup, reference data tables, template models, shared packages, audit table, HA |
| `auth/` | Authentication (OAuth/Keycloak, API keys) and group resource authorization |
| `groups/` | Group management APIs, membership requests, group frontend pages/context |
| `workflows/` | DAG workflow engine, graph types, node/activity/OCR-provider guides, workflow builder, node catalog, lineage, config overrides, Temporal worker concurrency, Temporal payload footprint (gzip codec + OCR payload refs), `templates/` example configs |
| `extraction/` | OCR/extraction: Azure AI models, classifiers, enrichment, field formatting, image normalization, confusion profiles/matrices, OCR improvement pipeline, OCR failure handling, OCR result views, ground truth, HITL datasets |
| `operations/` | OpenShift deployment, environment configuration, backups, Azure infrastructure, secrets, npm hardening |
| `monitoring/` | PLG stack, Helm charts, Promtail, dashboards, metrics, alerting, logging |
| `benchmarking/` | Benchmarking system, load testing runbooks |
| `frontend/` | Frontend-wide concerns: BC Design System migration, confirmation-modal and sentence-case standardization, header/upload UI, UI patterns not tied to one feature |
| `archive/` | Historical/point-in-time artifacts only — see `archive/README.md` |
| `wiki/` | Routing layer — rules in `wiki/README.md`, canonical agent rules in `AGENTS.md` (Repo Wiki section) |

- New docs go in the matching folder. Create a new folder only when several related docs don't fit anywhere above; add it to `docs-md/README.md` and this table in the same PR.
- Filenames: `SCREAMING_SNAKE.md` for reference docs (matches the majority convention).

## Content rules

- Current shipped behavior only. Requirements/user stories → `feature-docs/`; pre-implementation designs → historical once shipped.
- No placeholders, no "future work" sections, no stubs. If describing target/planned UX is genuinely needed (e.g. design reference), open with an explicit status disclaimer stating what is and isn't implemented.
- Reference code by repo-relative path. Prefer stable anchors (file paths, exported names) over line numbers.
- Relative markdown links between docs; they must resolve from the doc's own folder.
- The system is generic — no document-type-specific implementation guidance.
- When code changes make a doc inaccurate, the doc is updated in the same PR (CLAUDE.md rule).

## Archive policy

A doc is archived (not deleted) when it stops describing current behavior: reports, one-off analyses, completed plans/status trackers, superseded requirements. Process is in [Workflows/Archive.md](Workflows/Archive.md). Delete only docs with no historical value.

## Wiki boundary (summary — full rules in docs-md/wiki/README.md)

- Wiki topic pages: short synthesis + `canonical_sources` links. 180-line soft limit. No runbooks, schemas, endpoint lists, or implementation guides.
- Every wiki change: append a grep-friendly `log.md` entry (`## [YYYY-MM-DD] operation | Title`), update `sources.md` if canonical areas changed, record contradictions in `open-questions.md`, run `npm run docs:wiki:check`.
