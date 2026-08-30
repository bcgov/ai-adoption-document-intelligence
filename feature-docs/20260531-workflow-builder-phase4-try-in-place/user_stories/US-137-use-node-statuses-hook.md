# US-137: Frontend `useNodeStatuses` TanStack hook

**As a** V2 editor canvas with an active Try in progress,
**I want** a TanStack-Query hook that polls the node-statuses endpoint every 1.5s and stops polling once every status is terminal,
**So that** status badges and active-edge animation update in near-real-time without runaway requests.

## Acceptance Criteria

- [x] **Scenario 1**: Hook signature + base behaviour
    - **Given** `apps/frontend/src/features/workflow-builder/run/useNodeStatuses.ts` (new file)
    - **When** read
    - **Then** it exports `function useNodeStatuses(workflowId: string, runId: string | null, opts?: { active?: boolean }): ReturnType<typeof useQuery<Record<string, NodeRunStatus>, ApiError>>`
    - **And** uses `queryKey: ["node-statuses", workflowId, runId]`
    - **And** the query is `enabled: !!runId && opts?.active !== false`

- [x] **Scenario 2**: 1.5s polling cadence with background pause
    - **Given** the hook
    - **When** active
    - **Then** `refetchInterval: 1500` AND `refetchIntervalInBackground: false`
    - **And** when the browser tab is backgrounded, polling pauses; on tab refocus an immediate refetch fires and the interval resumes

- [x] **Scenario 3**: Polling stops at terminal
    - **Given** the hook with `opts.active = true`
    - **When** every status in the returned map is in `{ "succeeded", "failed", "skipped", "cancelled" }`
    - **Then** the hook's internal interval is disabled (a computed `enabled` check OR a refetchInterval that returns `false` when terminal)
    - **And** subsequent renders do not re-fire the query

- [x] **Scenario 4**: `opts.active = false` mode for replay
    - **Given** the hook called with `opts.active = false` (the replay flow — US-154)
    - **When** rendered
    - **Then** the query fires once and never polls
    - **And** the returned data is the historical status map

- [x] **Scenario 5**: 404 and 410 surface as data states, not errors
    - **Given** the backend endpoint returns 404 (run not found) or 410 (retention-cleaned)
    - **When** the hook receives the response
    - **Then** TanStack's `error` field is populated with an `ApiError` carrying the status code
    - **And** the consumer (canvas) treats 410 as "show the cache-row's endedAt as freeze point" (handled by US-138 / US-141)

- [x] **Scenario 6**: Unit tests with mocked fetch
    - **Given** `apps/frontend/src/features/workflow-builder/run/useNodeStatuses.test.tsx`
    - **When** tests run via `npm test` in `apps/frontend`
    - **Then** at least 4 cases pass: (a) polls on active+runId set, (b) does not poll when runId is null, (c) stops polling at terminal, (d) `opts.active = false` fires once and stops

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/run/useNodeStatuses.ts` — implementation
- `apps/frontend/src/features/workflow-builder/run/useNodeStatuses.test.tsx` — tests
- `apps/frontend/src/data/services/api.service.ts` (or equivalent shared API client) — new method `getNodeStatuses(workflowId, runId): Promise<Record<string, NodeRunStatus>>` if not already inferable

## Technical notes

- `NodeRunStatus` type imported from a shared location — either via the backend's `NodeStatusesResponseDto` (autogen-types path) or a small local TS mirror. Phase 4 uses the local-mirror pattern (`apps/frontend/src/features/workflow-builder/run/node-status.types.ts`) for consistency with other Phase 2 hooks.
- The "stop on terminal" logic: compute `const isTerminal = data && Object.values(data).every(s => ["succeeded", "failed", "skipped", "cancelled"].includes(s.status))`, then pass `refetchInterval: isTerminal ? false : 1500` to `useQuery`.
- Hook is consumed by `WorkflowEditorV2Page.tsx` and `RunHistoryDrawer.tsx` (replay flow). Two call sites; same hook.
- After landing: no Vite restart (frontend-only).
