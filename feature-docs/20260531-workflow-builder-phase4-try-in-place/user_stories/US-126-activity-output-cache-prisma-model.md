# US-126: `ActivityOutputCache` Prisma model + migration

**As a** backend engineer wiring the Phase 4 cache layer,
**I want** a Postgres table that stores per-(workflow-lineage, node, configHash, inputHash) activity outputs,
**So that** the worker decorator (US-132) and preview-cache endpoint (US-140) have a single content-addressable storage surface for cached outputs.

## Acceptance Criteria

- [x] **Scenario 1**: New Prisma model with the required columns
    - **Given** `apps/backend-services/prisma/schema.prisma`
    - **When** the file is read after the change
    - **Then** it declares a new `ActivityOutputCache` model with columns: `id String @id @default(cuid())`, `workflowLineageId String`, `nodeId String`, `configHash String`, `inputHash String`, `outputCtx Json`, `outputKind String?`, `createdAt DateTime @default(now())`, `expiresAt DateTime`
    - **And** a `@@unique([workflowLineageId, nodeId, configHash, inputHash])` constraint guards key uniqueness

- [x] **Scenario 2**: Required indexes for read paths + GC
    - **Given** the same model
    - **When** read
    - **Then** it carries three additional indexes: `@@index([workflowLineageId, nodeId])` (preview-cache reads), `@@index([expiresAt])` (GC sweep), `@@index([workflowLineageId, createdAt])` (run-history replay range queries)

- [x] **Scenario 3**: Migration generated and applied via `npm run db:generate`
    - **Given** the schema change
    - **When** the developer runs `npm run db:generate` from `apps/backend-services`
    - **Then** a new Prisma migration is generated under `apps/backend-services/prisma/migrations/<timestamp>_add_activity_output_cache/` with `migration.sql` creating the table + indexes
    - **And** the Prisma client is regenerated for both `apps/backend-services/src/` and `apps/temporal/src/` (per `npm run db:generate`'s convention from CLAUDE.md)
    - **And** the migration applies cleanly against the dev DB

- [x] **Scenario 4**: Default TTL constant in shared package
    - **Given** `packages/graph-workflow/src/cache/`
    - **When** the new `constants.ts` is read
    - **Then** it exports `DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000` (24 hours)
    - **And** the value is re-exported from the package barrel

- [x] **Scenario 5**: Backend builds + tests green after migration
    - **Given** the new model + migration
    - **When** `npm test` runs in `apps/backend-services`
    - **Then** existing tests pass unchanged (no regressions from schema change)
    - **And** `npx tsc --noEmit` in `apps/backend-services` passes (Prisma types regenerate correctly)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/prisma/schema.prisma` — add `ActivityOutputCache` model
- `apps/backend-services/prisma/migrations/<timestamp>_add_activity_output_cache/migration.sql` — generated
- `packages/graph-workflow/src/cache/constants.ts` — new file exporting `DEFAULT_CACHE_TTL_MS`
- `packages/graph-workflow/src/index.ts` — barrel re-export

## Technical notes

- Per CLAUDE.md, `npm run db:generate` is the project's wrapper that runs `prisma generate` AND writes the Prisma client into both `apps/backend-services/src/` and `apps/temporal/src/`. Don't run `npx prisma generate` directly.
- `outputCtx` is `Json` (not `Jsonb`) — Prisma's `Json` maps to Postgres `JSONB` already; no need to specify `@db.JsonB` explicitly.
- This story is schema-only; the repository (US-130) and worker decorator (US-132) consume the model.
- After landing: **ask Alex to restart Vite** if any package change shipped alongside; this story alone is backend-only.
