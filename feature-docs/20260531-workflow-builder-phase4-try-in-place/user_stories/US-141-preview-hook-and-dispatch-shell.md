# US-141: `useActivityOutputPreview` hook + `PreviewWidget` dispatch shell

**As a** node renderer on the V2 canvas,
**I want** a TanStack hook that fetches the preview cache row + a dispatch component that picks the right widget based on `outputKind`,
**So that** any node automatically gets the right preview pane below it without per-renderer wiring.

## Acceptance Criteria

- [x] **Scenario 1**: `useActivityOutputPreview` hook signature
    - **Given** `apps/frontend/src/features/workflow-builder/preview/useActivityOutputPreview.ts` (new file)
    - **When** read
    - **Then** it exports `function useActivityOutputPreview(workflowId: string, nodeId: string, runId?: string): { data: ActivityOutputPreview | null, isLoading: boolean, error: ApiError | null }`
    - **And** uses `queryKey: ["preview-cache", workflowId, nodeId, runId ?? "latest"]`
    - **And** TanStack caches results — re-renders of the same triple don't refetch

- [x] **Scenario 2**: Debounced re-fetch on status transition
    - **Given** the hook consumed by a node renderer
    - **When** the node's status transitions from "running" to "succeeded"/"skipped"/"failed"
    - **Then** the hook re-fetches once (status transition triggers an `invalidateQueries` on the preview-cache key, debounced by 250ms to coalesce rapid transitions)
    - **And** the canvas-side coordinator (a small effect inside `RunStateContext`'s consumer) fires this invalidation

- [x] **Scenario 3**: 404 maps to `data: null`, not error
    - **Given** the backend returns 404
    - **When** the hook receives the response
    - **Then** `data` is `null` AND `error` is `null` (the hook normalises 404 as "no preview yet")
    - **And** the widget consumer treats `data === null` as "render the cache-evicted-or-not-yet-run state" (US-155 owns the evicted-specific Alert; pre-execution is no-render)

- [x] **Scenario 4**: `PreviewWidget` dispatch shell
    - **Given** `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx`
    - **When** read
    - **Then** it exports `function PreviewWidget({ workflowId, nodeId, runId? }: { workflowId: string; nodeId: string; runId?: string })`
    - **And** it consumes `useActivityOutputPreview` internally and dispatches based on `data.outputKind`:
        - `"Document" | "MultiPageDocument" | "SinglePageDocument"` → `<DocumentPreview value={...} />`
        - `"Segment[]"` → `<SegmentArrayPreview value={...} />`
        - `"OcrResult" | "OcrFields"` → `<OcrResultPreview value={...} />`
        - `"Classification"` → `<ClassificationPreview value={...} />`
        - any other → `null` (no preview pane — keeps canvas uncluttered)

- [x] **Scenario 5**: Loading + error states
    - **Given** the dispatch shell
    - **When** `isLoading` is true → render `<Skeleton h={120} radius="sm" />`
    - **When** `error` is set → render a small `<Alert color="red" variant="light">Preview unavailable</Alert>`
    - **When** `data === null` AND `runId` was passed → render the cache-evicted state (delegated to US-155's component)
    - **When** `data === null` AND no `runId` → render `null` (silent — node hasn't run yet)

- [x] **Scenario 6**: Every node renderer mounts `<PreviewWidget>`
    - **Given** the existing node renderers (Activity, Source, Switch, Map, Join, ChildWorkflow, PollUntil, HumanGate)
    - **When** they're read after the change
    - **Then** each renderer mounts `<PreviewWidget workflowId={...} nodeId={node.id} runId={activeRunId} />` below the node's main body (inside the renderer's `<div>` but below the title + handles)
    - **And** the renderer reads `workflowId` and `activeRunId` from `RunStateContext` (US-138)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/preview/useActivityOutputPreview.ts` — hook
- `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx` — dispatch shell
- `apps/frontend/src/features/workflow-builder/preview/useActivityOutputPreview.test.tsx` — hook tests
- `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.test.tsx` — dispatch tests
- Each node renderer — mount `<PreviewWidget>`

## Technical notes

- The four widget components (`DocumentPreview`, `SegmentArrayPreview`, `OcrResultPreview`, `ClassificationPreview`) land in US-142 → US-145. Until they exist, the dispatch shell imports them as stubs (each returning `null`) — Milestone D's stories ship together; the order within the milestone is parallel-merge-friendly.
- Sizing: the preview pane is constrained to `maxH={200}` to keep the canvas readable. The widgets handle their own internal scroll/pagination.
- The `RunStateContext` (US-138) is the source of truth for `activeRunId` — renderers don't manage it. Replay mode just sets `activeRunId` to a historical runId; the same `<PreviewWidget>` paths work.
- After landing: no Vite restart (frontend-only).
