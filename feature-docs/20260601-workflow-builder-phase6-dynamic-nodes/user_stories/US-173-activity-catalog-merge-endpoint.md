# US-173: `GET /api/activity-catalog` extension — merge static + group dynamic nodes

**As a** frontend palette + binding-walk validator consumer,
**I want** the existing `GET /api/activity-catalog` endpoint to return static catalog entries plus the calling group's non-deleted dynamic nodes in one merged list,
**So that** every UI surface that consumes the catalog (palette, settings panel, canvas renderer, validator) sees dynamic nodes uniformly with zero new fetch coordination.

## Acceptance Criteria

- [x] **Scenario 1**: Endpoint extended to load + merge group dynamic nodes
    - **Given** the existing `ActivityCatalogController` (or wherever `GET /api/activity-catalog` lives today)
    - **When** a request is made by a group with two non-deleted dynamic-node lineages
    - **Then** the response's `entries` array contains the 41 static entries followed by 2 entries with `dynamicNodeSlug` + `dynamicNodeVersion` + `colorHint: "dyn"` set
    - **And** static entries are first; dynamic entries follow, sorted by `signature.name` ascending

- [x] **Scenario 2**: Soft-deleted lineages are excluded
    - **Given** a group with one soft-deleted lineage and one non-deleted lineage
    - **When** the request is made
    - **Then** only the non-deleted lineage appears in the response

- [x] **Scenario 3**: Cross-group isolation
    - **Given** group A has two dynamic-node lineages, group B has zero
    - **When** a key scoped to group B requests the catalog
    - **Then** the response contains only static entries — no dynamic entries leak from group A

- [x] **Scenario 4**: Server-side 30 s cache per group
    - **Given** a fresh server start
    - **When** the same group makes 100 catalog requests in 1 s
    - **Then** the DB is queried at most once for dynamic nodes during that burst (LRU-keyed by groupId)
    - **And** after a `POST` / `PUT` / `DELETE` to `/api/dynamic-nodes` for this group, the cache entry for the group is invalidated immediately (so the next read sees the latest)

- [x] **Scenario 5**: Response carries the existing shape — no breaking change
    - **Given** an existing frontend consumer that reads `entries[i].type` + `entries[i].inputs` + `entries[i].outputs` + `entries[i].paramsSchema`
    - **When** the new merged response is received
    - **Then** every static entry's shape is identical to before
    - **And** dynamic entries also expose `inputs`, `outputs`, `paramsSchema`, etc. — just with the three new optional fields populated

- [x] **Scenario 6**: Tests cover merge + isolation + cache invalidation
    - **Given** the controller test suite
    - **When** the suite runs
    - **Then** tests pass for: merged response contains static + dynamic, soft-deleted lineages excluded, cross-group isolation, 30 s cache hit, cache busted on publish + delete

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/<existing-activity-catalog-module>/<controller>.ts` — extend the existing endpoint
- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.service.ts` — add `getMergedCatalogForGroup(groupId)` method
- `apps/backend-services/src/dynamic-nodes/dynamic-nodes.module.ts` — export the service for cross-module use
- New cache helper (small LRU map with 30 s TTL) — co-locate with the service

## Technical notes

- The catalog endpoint already exists from Phase 1B catalog adoption. This story extends it; it doesn't create a new endpoint.
- Cache invalidation: the publish/PUT/DELETE handlers from US-165/US-166/US-167 each call `dynamicNodesService.invalidateGroupCatalogCache(groupId)` after the DB write commits.
- The merge does NOT modify the static catalog at runtime — it composes a per-request list by reading the immutable static catalog + the group's dynamic nodes.
- After landing: no Vite restart (backend-only). The frontend hook upgrade lands in US-175.
