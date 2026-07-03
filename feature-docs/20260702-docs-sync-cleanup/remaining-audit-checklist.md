# Remaining docs-md audit checklist

Continuation of the 2026-07 docs sync (see [design.md](design.md)). 32 of 88 active docs were audited against code and fixed; the items below still need a code-verified audit pass. Docs marked *(partial)* received some fixes from an interrupted auditor — verify the whole doc anyway.

**How to execute:** work through one folder-batch per session using the `docs-sync` skill's Audit workflow (`.claude/skills/docs-sync/Workflows/Audit.md`): verify every concrete claim (paths, commands, env vars, endpoints, Prisma models, node/activity names, helm values) against code with Grep/Read, fix in place, keep design-reference disclaimers accurate, flag point-in-time docs for archive. After each batch: `bash .claude/skills/docs-sync/scripts/check-doc-links.sh`, and if wiki was touched, `npm run docs:wiki:check`. Check items off here.

## Audit batches (same-folder docs share code context — do each batch in one pass)

- [ ] architecture: `BLOB_STORAGE.md`, `TABLES.md`, `TEMPLATE_MODELS.md` *(partial)*
- [ ] architecture: `HITL_ARCHITECTURE.md` *(partial; large)*
- [ ] auth: `AUTHENTICATION.md` *(partial; 2000+ lines — verify against apps/backend-services/src/auth/ and src/actor/)*
- [ ] auth: `GROUP_RESOURCE_AUTHORIZATION.md` *(partial)*
- [ ] benchmarking: `LOAD_TESTING.md` *(partial)*
- [ ] extraction: `CONFUSION_PROFILES.md` *(partial)*, `OCR_CONFUSION_MATRICES.md`, `OCR_IMPROVEMENT_PIPELINE.md`
- [ ] extraction: `ENRICHMENT.md`, `FIELD_FORMAT_ENGINE.md`, `DOCUMENT_IMAGE_NORMALIZATION.md`
- [ ] frontend: `BC_DESIGN_SYSTEM_MIGRATION.md` *(partial)*, `BC_DS_SCREEN_MIGRATION_STATUS.md` *(partial)*, `REFERENCE_DATA_TABLES_UI.md`
- [ ] groups (UI docs): `BOOTSTRAP_SETUP.md`, `CREATE_WORKFLOW_ACTIVE_GROUP.md`, `GROUPS_PAGE.md`, `GROUP_CONTEXT.md`, `GROUP_DETAIL_PAGE.md` *(all partial)*, `GROUP_SELECTOR.md`, `REQUEST_MEMBERSHIP_PAGE.md`, `SIDEBAR_NAVIGATION.md`
- [ ] monitoring (helm/PLG): `GRAFANA_HELM_CHART.md`, `LOKI_HELM_CHART.md`, `PROMETHEUS_HELM_CHART.md` *(partial)*, `PROMTAIL_SIDECARS.md`, `PLG_DEPLOYMENT_INTEGRATION.md`
- [ ] monitoring (metrics/dashboards): `PROMETHEUS_METRICS.md` *(partial)*, `LOGS_EXPLORER_DASHBOARD.md`, `NODEJS_RUNTIME_DASHBOARD.md`, `ALERTING.md`
- [ ] monitoring (local/logging): `LOCAL_MONITORING_STACK.md` *(partial)*, `LOGGING.md` *(partial — also decide whether stray `docs/LOGGING.md` should merge into it)*
- [ ] operations (env/secrets): `ENVIRONMENT_CONFIGURATION.md`, `local-dev-secrets.md`, `prod-secrets-rotation.md`, `NPM_HARDENING.md` *(all partial)*
- [ ] operations (infra): `MANUAL_LOAD_TEST_INSTANCE.md`, `BACKUP_TO_NETWORK_SHARE.md`, `AZURE_INFRASTRUCTURE.md`
- [ ] workflows: `DAG_WORKFLOW_ENGINE.md` *(large — verify section-by-section against apps/temporal/src/graph-engine/ and packages/graph-workflow/)*
- [ ] workflows: `WORKFLOW_NODE_CATALOG.md` *(large — verify against activity registries)*
- [ ] workflows: `WORKFLOW_BUILDER_GUIDE.md`, `WORKFLOW_DESIGN_BRIEF.md` *(design references — verify status disclaimers, not the target UX)*
- [ ] workflows: `ADDING_GRAPH_NODES_AND_ACTIVITIES.md`, `ADDING_OCR_PROVIDERS.md`, `MISTRAL_OCR.md`
- [ ] workflows: `GRAPH_TYPES.md`, `WORKFLOW_LINEAGE_AND_VERSIONS.md`, `page-extract-blob-path.md`, `workflow-config-overrides.md`, `TEMPORAL_WORKER_CONCURRENCY.md`
- [ ] workflows: `WORKFLOW_NODE_IO_MODEL_DECISION.md` *(decision record — verify disclaimer)*, `templates/README.md` + validate `templates/*.json` still load (they seed via apps/shared/prisma/seed.ts)

## Gap scan (never completed — one area per session)

- [ ] apps/backend-services/src/ — NestJS modules with no docs-md coverage
- [ ] apps/temporal/src/ — workflows/activities/graph-engine coverage
- [ ] apps/frontend/src/ — features/pages/contexts coverage
- [ ] packages/* — workspace package coverage (SHARED_PACKAGES.md covers conventions; per-package behavior may need docs)
- [ ] deployments/, scripts/, tools/ — operational surface coverage
- [ ] .github/workflows/, lefthook.yml, docker-compose.yml, root scripts — CI/tooling coverage

For each confirmed gap: write the doc per `.claude/skills/docs-sync/Workflows/AddDoc.md` (right topic folder, verified behavior only), and wire it into `docs-md/README.md` + wiki sources.

## Code findings to hand off (not docs work)

- [ ] **AI-1296 Dockerfiles**: `apps/backend-services/Dockerfile` and `apps/temporal/Dockerfile` missing COPY/build for `packages/graph-workflow-config` and `packages/temporal-payload-codec` (declared as `file:` deps) — image builds from this branch fail at `npm install`.
- [ ] Frontend `GroupRequest.actorId` dead field (`apps/frontend/src/data/hooks/useGroups.ts`) — backend never returns it.
- [ ] `scripts/lib/instance-name.test.sh` tests 1.4 and 2.7 expect values longer than the 20-char truncation.
