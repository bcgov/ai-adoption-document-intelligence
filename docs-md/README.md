# docs-md — Developer Reference Documentation

Canonical markdown documentation for the Document Intelligence platform, organized by topic. Start with the [repo wiki](wiki/index.md) for a routing map of the whole system, then drill into the topic folders below.

## Folders

| Folder | Contents |
| --- | --- |
| [architecture/](architecture/) | System-level design: HITL architecture, database services, transaction/audit compliance, blob storage, document content hash, ephemeral document cleanup, reference data tables, template models, shared packages, audit table, high availability, the workflow-node + configuration-UI extension pattern |
| [auth/](auth/) | Authentication (OAuth/Keycloak, API keys) and group-based resource authorization |
| [groups/](groups/) | Group management: APIs, membership requests, frontend pages and context |
| [workflows/](workflows/) | DAG workflow engine, graph types, adding nodes/activities/OCR providers (incl. Mistral OCR), workflow builder guide and design brief, node catalog, lineage/versions, config overrides, Temporal worker concurrency, Temporal payload footprint (gzip codec + OCR payload refs), [templates/](workflows/templates/) example configs |
| [extraction/](extraction/) | OCR and extraction: Azure AI models, classifiers, enrichment, field formatting, image normalization, confusion profiles/matrices, OCR improvement pipeline, OCR failure handling, OCR result views, ground truth and HITL datasets, HITL demo reset/seed |
| [operations/](operations/) | OpenShift deployment, CI workflows overview, environment configuration, backups, Azure infrastructure, secrets management, npm hardening |
| [monitoring/](monitoring/) | PLG stack (Prometheus, Loki, Grafana), Helm charts, Promtail sidecars, dashboards, metrics, alerting, logging |
| [benchmarking/](benchmarking/) | Benchmarking system, load testing runbooks and stress run sheets |
| [frontend/](frontend/) | BC Design System migration, reference data tables UI, confirmation-modal and sentence-case standardization, header/upload UI |
| [archive/](archive/) | Point-in-time artifacts (reports, audits, completed plans) — historical only, see [archive/README.md](archive/README.md) |
| [wiki/](wiki/) | Repo wiki: routing map for humans and LLM agents — see [wiki/README.md](wiki/README.md) for rules |

## Conventions

- Docs describe **current shipped behavior**. Requirements, user stories, and pre-implementation designs live in `feature-docs/` and `docs/superpowers/` (historical).
- New docs go into the matching topic folder; create a new folder only when a topic outgrows the existing taxonomy.
- Point-in-time artifacts (reports, one-off analyses, completed migration plans) go to [archive/](archive/) once they stop describing current behavior.
- The wiki is a compression/routing layer — keep implementation detail here and link it from the wiki (see `AGENTS.md`, Repo Wiki section).
- When code changes make a doc inaccurate, update the doc in the same PR (see `CLAUDE.md`).
