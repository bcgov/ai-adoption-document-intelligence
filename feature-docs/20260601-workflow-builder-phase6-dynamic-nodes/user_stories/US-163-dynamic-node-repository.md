# US-163: `DynamicNodeRepository`

**As a** backend engineer building the publish-time service layer,
**I want** a Prisma-backed repository that wraps the five lifecycle operations (create-with-first-version, publish-new-version, find-by-slug, list, soft-delete),
**So that** the service layer (US-164) and the controller (US-165 → US-167) have a single tested boundary for all dynamic-node persistence access with no inline Prisma calls.

## Acceptance Criteria

- [ ] **Scenario 1**: `DynamicNodeRepository` class declared with the five methods
    - **Given** `apps/backend-services/src/dynamic-nodes/dynamic-node.repository.ts`
    - **When** the file is read
    - **Then** it exports a `DynamicNodeRepository` class with methods: `createWithFirstVersion`, `publishNewVersion`, `findBySlugForGroup`, `listForGroup`, `softDelete`
    - **And** the class is `@Injectable()` for NestJS DI

- [ ] **Scenario 2**: `createWithFirstVersion` atomically creates lineage + v1
    - **Given** an input `{ groupId, slug, script, signature, allowNet, deterministic, ownerUserId? }`
    - **When** the method is called
    - **Then** a single Prisma `$transaction` creates the `DynamicNode` row + a `DynamicNodeVersion` row (versionNumber=1) + sets `headVersionId` to the new version's id
    - **And** the method returns `{ dynamicNode, headVersion }`
    - **And** a duplicate `(groupId, slug)` causes the underlying unique-constraint violation to propagate as a typed error (`PrismaClientKnownRequestError P2002`) the service can map to HTTP 409

- [ ] **Scenario 3**: `publishNewVersion` atomically appends + moves head
    - **Given** a lineage exists and an input `{ groupId, slug, script, signature, allowNet, deterministic, publishedByUserId? }`
    - **When** the method is called
    - **Then** a single `$transaction` reads the current max `versionNumber` for the lineage, creates a new `DynamicNodeVersion` with `versionNumber + 1`, and moves the lineage's `headVersionId`
    - **And** the method returns `{ dynamicNode, headVersion }`
    - **And** the lineage being soft-deleted (`deletedAt != null`) causes a typed `DynamicNodeDeletedError` (or repository-level equivalent) so the service can map to 404

- [ ] **Scenario 4**: `findBySlugForGroup` + `listForGroup` honor soft-delete
    - **Given** a lineage with `deletedAt` set
    - **When** `findBySlugForGroup(groupId, slug)` is called
    - **Then** it returns `null` (not the soft-deleted row)
    - **And** `listForGroup(groupId)` with `includeDeleted: false` (default) excludes the row
    - **And** `listForGroup(groupId, { includeDeleted: true })` includes it (for admin / debugging; not exposed via the API in 6.0)

- [ ] **Scenario 5**: `softDelete` sets `deletedAt` idempotently
    - **Given** a non-deleted lineage
    - **When** `softDelete(groupId, slug)` is called
    - **Then** the row's `deletedAt` is set to `now()` and the updated row is returned
    - **And** calling `softDelete` a second time on the same row leaves the existing `deletedAt` unchanged (idempotent)
    - **And** calling on an unknown slug throws a typed `NotFoundError` the service can map to 404

- [ ] **Scenario 6**: Unit tests run against a real Prisma client (per CLAUDE.md)
    - **Given** `dynamic-node.repository.spec.ts` in the same directory
    - **When** the test suite runs
    - **Then** tests pass against the dev DB (no mocks) covering each method's happy path + edge cases (duplicate slug, missing lineage, soft-deleted lineage, version sequencing across two consecutive publishes)
    - **And** each test cleans up its own rows so re-runs are deterministic

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/dynamic-nodes/dynamic-node.repository.ts` — new file
- `apps/backend-services/src/dynamic-nodes/dynamic-node.repository.spec.ts` — new file
- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.module.ts` — new file (NestJS module registers the repo)

## Technical notes

- Per CLAUDE.md, tests use the real DB. Use the existing `PrismaService` + `cleanupTestData` patterns from other repos (e.g. `workflow.repository.spec.ts`).
- Map Prisma's `P2002` (unique constraint) to a thrown `DuplicateSlugError`; the service layer (US-164) catches and re-throws as the NestJS `ConflictException`.
- `signature Json` round-trips as `DynamicNodeSignature` (cast at the boundary); the repo doesn't enforce shape — that's the parser + service layer's job.
- After landing: no Vite restart (backend-only).
