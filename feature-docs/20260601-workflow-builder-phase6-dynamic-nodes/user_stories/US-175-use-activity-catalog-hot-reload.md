# US-175: `useActivityCatalog` hook hot-reload + invalidation on publish

**As a** frontend developer wiring dynamic nodes into the canvas + palette,
**I want** the existing `useActivityCatalog` TanStack hook to see merged entries automatically and refetch on every publish / update / delete,
**So that** the palette + canvas + settings panel + binding-walk validator update without a page reload, Vite restart, or worker bounce after any dynamic-node lifecycle event.

## Acceptance Criteria

- [ ] **Scenario 1**: Hook sees `dyn.*` entries with zero hook signature change
    - **Given** the existing `useActivityCatalog` hook (Phase 1B closeout)
    - **When** the merged endpoint from US-173 returns `entries: [...static, ...dynamic]`
    - **Then** the hook's return value contains the merged list — no new hook signature, no new return field
    - **And** consumers (`ActivityPalette`, `NodeSettingsPanel`, canvas's `getEntry` lookup) see `dyn.*` entries automatically

- [ ] **Scenario 2**: Invalidation on `POST /api/dynamic-nodes` success
    - **Given** `useDynamicNodePublish` mutation (defined in US-176)
    - **When** a publish succeeds via `POST`
    - **Then** the mutation's `onSuccess` calls `queryClient.invalidateQueries(['activity-catalog'])` (using the existing query key the hook subscribes to)
    - **And** the hook refetches automatically; consumers re-render with the new dynamic entry

- [ ] **Scenario 3**: Invalidation on `PUT /api/dynamic-nodes/:slug` success
    - **Given** the same mutation in update mode
    - **When** a publish succeeds via `PUT`
    - **Then** the catalog hook is invalidated
    - **And** the canvas's dynamic-node settings panel re-renders with the new signature (port kinds may have changed; the canvas DYN pill stays unchanged but ports may rewire visually)

- [ ] **Scenario 4**: Invalidation on `DELETE /api/dynamic-nodes/:slug` success
    - **Given** `useDynamicNodeDelete` mutation
    - **When** a soft-delete succeeds
    - **Then** the catalog hook is invalidated
    - **And** the palette's "Custom" section removes the entry
    - **And** any canvas instances of `dyn.<deleted-slug>` now resolve to "missing from catalog" → US-183's "Deleted" badge path

- [ ] **Scenario 5**: No new query keys; no parallel fetch
    - **Given** the hook ecosystem
    - **When** the page loads
    - **Then** there is exactly ONE `/api/activity-catalog` fetch per page load (the merged endpoint replaces any parallel `/api/dynamic-nodes` fetch the catalog would otherwise need)
    - **And** the existing query key `['activity-catalog']` is reused

- [ ] **Scenario 6**: Hook tests + integration test
    - **Given** the frontend test suite
    - **When** `useActivityCatalog.spec.tsx` runs (or its existing equivalent)
    - **Then** tests pass for: hook returns merged entries; mutation success invalidates the hook; subsequent refetch surfaces updated entries; cross-group isolation (the catalog hook scopes to the calling key automatically — no per-group query key needed)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/<catalog-hook-location>/useActivityCatalog.ts` — confirm the hook needs no changes; if there's a Phase-6-specific filter to add, do it minimally
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/useDynamicNodePublish.ts` — set up the mutation hooks here (their full bodies land in US-176; this story just confirms the invalidation path)
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/useDynamicNodeDelete.ts` — same
- `apps/frontend/src/features/workflow-builder/dynamic-nodes/useActivityCatalog.spec.tsx` — extend tests

## Technical notes

- The hook ALREADY exists from Phase 1B catalog adoption. This story is mostly a "confirm + test" pass — verifying no changes break the existing surface and the invalidation path works.
- The mutations themselves are properly defined in US-176 (Milestone E foundation). This story sets up the invalidation calls so the hot-reload promise from the design doc is honored.
- This story closes Milestone D. After landing US-173 → US-175, the catalog merge + binding-walk + hot-reload are all wired; Milestone E starts the frontend editor work.
- After landing: no Vite restart (frontend-only consumes existing exports).
