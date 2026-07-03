# Temporal footprint reduction — status

> Plan: [TEMPORAL_DATA_FOOTPRINT_REDUCTION_PLAN.md](./TEMPORAL_DATA_FOOTPRINT_REDUCTION_PLAN.md)

## Verified

| Item | Date |
|------|------|
| G.1 unit tests (temporal suite, migrator, config-hash, ref activities) | 2026-05-28 |
| G.2 local `test:int:workflow` (`WORKFLOW_SLUG=standard-ocr`) | 2026-05-26 (re-run pass) |
| E.8 workflow docs (`DAG_WORKFLOW_ENGINE`, builder guides, node catalog) | 2026-05-27 |
| D.6 OCR blob prefix delete on document delete | 2026-05-27 |
| §5.5 gate (local): `workflow:migrate-ocr-refs` dry-run — 0 legacy keys | 2026-05-28 |
| `workflowConfigOverrides` tests (graph, benchmark, OCR/ground-truth starters) | 2026-05-26 |

## Done in code

Refs + gzip codec, `graphWorkflow` versionId/hash load, benchmark slim starts, map/library child workflows, repo templates `*Ref`, migrator CLI, D.6/D.7, load-time `workflowConfigOverrides` (benchmark, ground truth, OCR), shared `@ai-di/graph-workflow-config` (hash + overrides), benchmark `groupId` threaded from dataset materialize → sample → `graphWorkflow`.

## Cutover checklist

**Order:** block traffic → deploy → migrator → gate → Temporal wipe → resume.

### Pre-cutover

- [x] Re-run `npm run test:int:workflow` (stack up: docker-compose, worker, backend)
- [ ] `npm run workflow:migrate-ocr-refs:apply` on staging/prod (local already clean)
- [ ] **G.3** Staging: 100-sample benchmark + OCR cache replay
- [ ] **G.4** Staging: spot-check history payload on new `graph-{documentId}`

### Cutover (§7)

- [ ] Staging cutover, then prod (same atomic steps)
- [ ] Temporal DB wipe + 24h retention
- [ ] SQL: clear `workflow_execution_id` on all documents
- [ ] §5.5 gate before resuming traffic

### Post-cutover

- [ ] **F.3** `upsertSearchAttributes` on terminal graph status
- [ ] **F.4** Alerts: temporal-pg disk, history limits, queue depth

## Override test coverage

| Scenario | Test location |
|----------|----------------|
| Merged hash + ctx default | `apps/temporal/src/graph-workflow.test.ts` |
| `CONFIG_HASH_MISMATCH` (base hash + overrides) | same |
| Node `parameters` override at runtime | same |
| Benchmark sample → `graphWorkflow` | `apps/temporal/src/benchmark-sample-workflow.test.ts` |
| `startGraphWorkflow` / benchmark Temporal start | `temporal-client.service.spec.ts`, `benchmark-temporal.service.spec.ts`, `benchmark-run.service.spec.ts` |
| Ground truth `requestOcr(..., overrides)` | `ground-truth-generation.service.spec.ts` |
