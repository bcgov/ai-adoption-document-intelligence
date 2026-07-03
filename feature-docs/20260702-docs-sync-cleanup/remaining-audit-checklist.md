# Remaining docs-md audit checklist

Continuation of the 2026-07 docs sync (see [design.md](design.md)). 32 of 88 active docs were audited against code and fixed; the items below still need a code-verified audit pass. Docs marked *(partial)* received some fixes from an interrupted auditor — verify the whole doc anyway.

**How to execute:** work through one folder-batch per session using the `docs-sync` skill's Audit workflow (`.claude/skills/docs-sync/Workflows/Audit.md`): verify every concrete claim (paths, commands, env vars, endpoints, Prisma models, node/activity names, helm values) against code with Grep/Read, fix in place, keep design-reference disclaimers accurate, flag point-in-time docs for archive. After each batch: `bash .claude/skills/docs-sync/scripts/check-doc-links.sh`, and if wiki was touched, `npm run docs:wiki:check`. Check items off here.

## Audit batches (same-folder docs share code context — do each batch in one pass)

- [x] architecture: `BLOB_STORAGE.md` (major fixes: group-scoped key scheme `{groupId}/{category}/...`, no `classification` container, training container naming), `TABLES.md` (year-month column type), `TEMPLATE_MODELS.md` (TRAINING_MIN_DOCUMENTS)
- [x] architecture: `HITL_ARCHITECTURE.md` — verified accurate (models, all 14 endpoints, lock TTL/heartbeat/idle timings, reopen window, frontend paths)
- [x] auth: `AUTHENTICATION.md` — fixed identity-resolution query description (single findUserWithGroups), API-key guard flow (request.apiKey), stale IDOR open issue (resolved via group scoping), test example
- [x] auth: `GROUP_RESOURCE_AUTHORIZATION.md` — verified accurate (helpers, routes, DTOs, audit events spot-checked)
- [x] benchmarking: `LOAD_TESTING.md` — verified accurate (all 14 load-test npm scripts, referenced files/manifests)
- [x] extraction: `CONFUSION_PROFILES.md` (accurate), `OCR_CONFUSION_MATRICES.md` (stale "no API" status — profiles module implements derivation), `OCR_IMPROVEMENT_PIPELINE.md` (nonexistent confusion-matrix/derive endpoint, dead OCR-TASK.md ref)
- [x] extraction: `ENRICHMENT.md` (removed legacy step-based config; graph node params), `FIELD_FORMAT_ENGINE.md` (benchmark mismatch data IS integrated; suggestFromRun), `DOCUMENT_IMAGE_NORMALIZATION.md` (group-scoped blob prefixes)
- [x] frontend: `BC_DESIGN_SYSTEM_MIGRATION.md` (all referenced paths/components verified), `BC_DS_SCREEN_MIGRATION_STATUS.md` (accurate incl. DocumentsPage exception), `REFERENCE_DATA_TABLES_UI.md` (TablesListPage name)
- [x] groups (UI docs): all verified; `SIDEBAR_NAVIGATION.md` rewritten (createBrowserRouter routing, RootLayout, no placeholder), `GROUP_SELECTOR.md` header location (RootLayout.tsx)
- [x] monitoring (helm/PLG): verified against chart; `PROMETHEUS_HELM_CHART.md` fixed stale "no Alertmanager" note
- [x] monitoring (metrics/dashboards): verified (metric names match @ai-di/monitoring, dashboards JSON exist, alert-rules generation, CHES env)
- [x] monitoring (local/logging): verified; stray `docs/LOGGING.md` archived as `docs-md/archive/LOGGING_CATEGORIES_2026-03.md`
- [x] operations (env/secrets): verified — all 58 documented env vars exist in code/manifests/deploy scripts; npm hardening and rotation script claims check out
- [x] operations (infra): verified — scripts/manifests/terraform paths resolve (oc-deploy.sh mention is explicitly historical)
- [x] workflows: `DAG_WORKFLOW_ENGINE.md` — all paths/activity IDs verified; historical Appendix A (migration file list) replaced with a note
- [x] workflows: `WORKFLOW_NODE_CATALOG.md` — diffed against activity registry; added missing utility activities section (blob.read, tables.lookup, document.* helpers) and 2 benchmark rows
- [x] workflows: `WORKFLOW_BUILDER_GUIDE.md` (disclaimer verified: visualization still read-only, nodesDraggable=false), `WORKFLOW_DESIGN_BRIEF.md` (design-brief framing intact)
- [x] workflows: `ADDING_GRAPH_NODES_AND_ACTIVITIES.md`, `ADDING_OCR_PROVIDERS.md`, `MISTRAL_OCR.md` — verified (paths, mistralOcr.process, env vars)
- [x] workflows: `GRAPH_TYPES.md`, `WORKFLOW_LINEAGE_AND_VERSIONS.md`, `page-extract-blob-path.md`, `workflow-config-overrides.md`, `TEMPORAL_WORKER_CONCURRENCY.md` — verified (node types, revert-head, override safety, concurrency env)
- [x] workflows: `WORKFLOW_NODE_IO_MODEL_DECISION.md` (decision-record disclaimer intact; links fixed earlier), `templates/README.md` (all 8 templates present; seed paths updated in Phase 1)

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
