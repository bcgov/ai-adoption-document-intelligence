# Project Wiki Index

This wiki is a compact map of the Document Intelligence Platform. Use it to find the right canonical source before editing docs or code.

## Start Here

- [System overview](system-overview.md): service boundaries, platform shape, and major source paths.
- [Graph workflows](graph-workflows.md): DAG workflow engine, activity registration, and execution semantics.
- [Workflow builder](workflow-builder.md): frontend authoring UI, node palette, and workflow JSON editing.
- [Tables and extensions](tables-and-extensions.md): reference data tables and the preferred workflow extension pattern.
- [Blob storage](blob-storage.md): unified MinIO/Azure storage abstraction across backend and Temporal.
- [HITL](hitl.md): review sessions, locking, queue behavior, and correction tracking.
- [Auth and groups](auth-and-groups.md): Keycloak/API key auth, group scoping, and authorization docs.
- [Deployment and ops](deployment-and-ops.md): local/dev/OpenShift deployment, monitoring, load testing, and operational runbooks.

## Maintenance Pages

- [Sources](sources.md): canonical source registry.
- [Open questions](open-questions.md): known drift candidates and unresolved ownership.
- [Log](log.md): append-only wiki maintenance history.

## Reading Pattern

1. Read the relevant wiki topic for orientation.
2. Follow `canonical_sources` to the detailed docs or code.
3. Update the canonical source first.
4. Update the wiki only when navigation, synthesis, or drift context changes.

## Boundary

The wiki should not become a second implementation spec. If a page starts carrying detailed behavior, move that detail to the right `docs-md` document or code-adjacent README and link to it from here.
