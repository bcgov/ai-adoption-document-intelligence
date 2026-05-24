# US-080: `childWorkflow` node executor honors `workflowRef.library.version` at runtime

**As a** parent workflow execution running a `childWorkflow` node
pinned to library v3,
**I want** the engine to load v3's config (not head's) for the child
execution,
**So that** my pinned references actually take effect at runtime
instead of silently following head.

## Acceptance Criteria

- [ ] **Scenario 1**: When `version` is set, the executor resolves it to a `WorkflowVersion.id` and passes that to the loader
    - **Given** a `childWorkflow` node with `workflowRef: { type: "library", workflowId: "<lineageId>", version: 3 }`
    - **When** the engine executes the node
    - **Then** `getWorkflowGraphConfig` is called with `{ workflowId: <the resolved v3 WorkflowVersion.id> }` (NOT the lineage id)
    - **And** the returned `graph` is v3's config

- [ ] **Scenario 2**: When `version` is undefined, behaviour is unchanged
    - **Given** a `childWorkflow` node with `workflowRef: { type: "library", workflowId: "<lineageId>" }` (no `version`)
    - **When** the engine executes the node
    - **Then** `getWorkflowGraphConfig` is called with `{ workflowId: <lineageId> }` (existing behaviour — resolver falls through to head)

- [ ] **Scenario 3**: Pinned version no longer exists → executor surfaces a clear error
    - **Given** `version: 99` on a lineage that has only 3 versions
    - **When** the engine executes the node
    - **Then** the executor raises an error mentioning the lineage id + pinned version number (not a cryptic Prisma null deref)
    - **And** the child workflow is not started

- [ ] **Scenario 4**: Vitest coverage for the executor
    - **Given** the `node-executors.ts` test suite with a mock activity proxy
    - **When** `npm test` runs in `apps/temporal/`
    - **Then** Scenarios 1, 2, and 3 each have a corresponding test case

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/temporal/src/graph-engine/node-executors.ts` — in the `childWorkflow` executor, resolve `version` to a `WorkflowVersion.id` (via a new helper activity OR by querying within the existing activity — see Notes) before calling `getWorkflowGraphConfig`
- `apps/temporal/src/activities/get-workflow-graph-config.ts` OR a new activity `resolve-library-version.ts` — add the lineage-id + version-number → version-id lookup. Prefer extending `getWorkflowGraphConfig` to optionally take `{ workflowId, version?: number }` so the existing single-activity callsite stays single.
- `apps/temporal/src/graph-engine/node-executors.test.ts` (or the equivalent existing test file) — Scenarios 1, 2, and 3

## Notes

- Cleanest implementation: extend `getWorkflowGraphConfig` to take `{ workflowId, version?: number }`. When `version` is set, query `prisma.workflowVersion.findFirst({ where: { lineage_id: workflowId, version_number: version } })`. When unset, keep today's three-step resolution (versionId → lineageId(head) → lineageName(head)).
- This keeps the executor call site simple: it just forwards the full `workflowRef.library` shape to the activity.
- Verify the Prisma column name (`version_number`?) before writing the query; the migration history may use a different casing.
