# US-162: `DynamicNode` + `DynamicNodeVersion` Prisma models + migration

**As a** backend engineer wiring Phase 6 persistence,
**I want** two Prisma models — `DynamicNode` (lineage) + `DynamicNodeVersion` (immutable snapshot) — group-scoped and mirroring Phase 2 Track 3's lineage/version pattern,
**So that** the publish endpoints (US-165/US-166) have a single source of truth + the worker can resolve `(slug, versionId)` to an immutable script row without race conditions.

## Acceptance Criteria

- [x] **Scenario 1**: `DynamicNode` model declared per the requirements
    - **Given** `apps/backend-services/prisma/schema.prisma`
    - **When** the file is read after the change
    - **Then** it declares a `DynamicNode` model with columns `id String @id @default(cuid())`, `groupId String @map("group_id")`, `slug String`, `description String?`, `ownerUserId String? @map("owner_user_id")`, `headVersionId String? @unique @map("head_version_id")`, `deletedAt DateTime? @map("deleted_at")`, `createdAt DateTime @default(now()) @map("created_at")`, `updatedAt DateTime @updatedAt @map("updated_at")`
    - **And** carries `@@unique([groupId, slug])`, `@@index([groupId, deletedAt])`, `@@map("dynamic_node")`

- [x] **Scenario 2**: `DynamicNodeVersion` model declared per the requirements
    - **Given** the same file
    - **When** read
    - **Then** it declares a `DynamicNodeVersion` model with columns `id String @id @default(cuid())`, `dynamicNodeId String @map("dynamic_node_id")`, `versionNumber Int @map("version_number")`, `script String @db.Text`, `signature Json`, `allowNet String[] @map("allow_net")`, `deterministic Boolean @default(false)`, `publishedByUserId String? @map("published_by_user_id")`, `publishedAt DateTime @default(now()) @map("published_at")`
    - **And** carries `@@unique([dynamicNodeId, versionNumber])`, `@@map("dynamic_node_version")`

- [x] **Scenario 3**: Bidirectional relations declared between the two models
    - **Given** both model declarations
    - **When** read
    - **Then** `DynamicNode.headVersion` is `DynamicNodeVersion? @relation("HeadVersion", fields: [headVersionId], references: [id])`
    - **And** `DynamicNode.versions` is `DynamicNodeVersion[] @relation("Versions")`
    - **And** `DynamicNodeVersion.dynamicNode` is `DynamicNode @relation("Versions", fields: [dynamicNodeId], references: [id], onDelete: Cascade)`
    - **And** `DynamicNodeVersion.headOf` is `DynamicNode? @relation("HeadVersion")`

- [x] **Scenario 4**: Migration generated + applied via `npm run db:generate`
    - **Given** the schema change
    - **When** the developer runs `npm run db:generate` from `apps/backend-services` (per CLAUDE.md)
    - **Then** a new migration `<timestamp>_add_dynamic_nodes/` is created with `migration.sql` creating both tables, the unique constraints, the indexes, and the foreign keys
    - **And** the Prisma client is regenerated for both `apps/backend-services/src/` and `apps/temporal/src/`
    - **And** the migration applies cleanly against the dev DB

- [x] **Scenario 5**: Backend `npx tsc --noEmit` + `npm test` green after migration
    - **Given** the regenerated Prisma client
    - **When** `npx tsc --noEmit` runs in `apps/backend-services` and `apps/temporal`
    - **Then** both pass (Prisma types regenerate correctly for both runtimes)
    - **And** existing backend `npm test` passes unchanged

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/prisma/schema.prisma` — add `DynamicNode` + `DynamicNodeVersion`
- `apps/backend-services/prisma/migrations/<timestamp>_add_dynamic_nodes/migration.sql` — generated

## Technical notes

- Per CLAUDE.md, never run `npx prisma generate` directly — always use `npm run db:generate`.
- Group-scoping uses `groupId String` (matching how `Workflow` is scoped in the existing schema). NOT `orgId`. Confirm via inspection of the current `Workflow` model before declaring `groupId` to be sure of the column type + foreign-key conventions used elsewhere.
- `signature Json` stores the parser's derived `entry`-shaped object (`DynamicNodeSignature`-typed at the application layer).
- `onDelete: Cascade` on the version's `dynamicNode` relation only fires on hard-delete; soft-delete sets `deletedAt` and never triggers cascade in 6.0.
- This story is schema-only. US-163 wires the repository on top of the models.
- After landing: no Vite restart (backend-only).
