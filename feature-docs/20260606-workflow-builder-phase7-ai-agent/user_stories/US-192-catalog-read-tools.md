# US-192: Catalog read tools — `listActivityCatalog` + `listSourceCatalog` + `listLibraryWorkflows`

**As a** backend engineer wiring the agent's discovery surface,
**I want** three read-only tools that expose the static + dynamic activity catalog, the source catalog, and the group's library workflows,
**So that** the agent always starts a composition pass with the right "what activities exist?" + "what reusable workflows exist?" answers.

## Acceptance Criteria

- [ ] **Scenario 1**: `listActivityCatalog` tool registered
    - **Given** `apps/backend-services/src/agent/tools/catalog.tools.ts`
    - **When** read after the change
    - **Then** it self-registers a `listActivityCatalog` tool with empty `inputSchema: z.object({})`
    - **And** description names what it returns ("merged static + group-scoped dynamic-node entries from `GET /api/activity-catalog`")
    - **And** the handler resolves `ctx.services.activityCatalog.listForGroup(ctx.groupId)` and returns `{ ok: true, data: { items: ActivityCatalogEntry[] } }`

- [ ] **Scenario 2**: `listSourceCatalog` tool registered
    - **Given** the same file
    - **When** read after the change
    - **Then** it registers `listSourceCatalog` with empty input schema
    - **And** the handler returns the static `SOURCE_CATALOG` export from `@ai-di/graph-workflow` as `{ ok: true, data: { items: SourceCatalogEntry[] } }`
    - **And** no DB call — the source catalog is in-package

- [ ] **Scenario 3**: `listLibraryWorkflows` tool registered
    - **Given** the same file
    - **When** read after the change
    - **Then** it registers `listLibraryWorkflows` with empty input schema
    - **And** the handler resolves `ctx.services.workflows.listForGroup({ groupId: ctx.groupId, isLibrary: true })` and returns `{ ok: true, data: { items: LibraryWorkflowSummaryDto[] } }`
    - **And** the response items include enough info for the agent (id, name, description, inputs, outputs, version) — pulled from the existing list endpoint's response shape

- [ ] **Scenario 4**: Tool-self-registration wired into `AgentModule`
    - **Given** `agent.module.ts`
    - **When** read after the change
    - **Then** `OnModuleInit` imports `catalog.tools.ts` (side-effect import) so the three tools land in `ToolRegistry` at startup
    - **And** the registry contains exactly 3 entries after module init

- [ ] **Scenario 5**: Unit tests for handlers
    - **Given** `catalog.tools.spec.ts`
    - **When** run via `npm test`
    - **Then** tests cover: each handler returns the expected service call result, group-scoping is enforced (calling with `groupId: A` does NOT return group B's data), source catalog returns the in-package static array verbatim

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/tools/catalog.tools.ts` — new
- `apps/backend-services/src/agent/tools/catalog.tools.spec.ts` — new
- `apps/backend-services/src/agent/agent.module.ts` — import the tool file in `OnModuleInit`

## Technical notes

- Per L35 in REQUIREMENTS.md.
- Depends on US-190 (registry).
- These three tools fire first on every greenfield composition pass per the system prompt's catalog-first rule (US-191).
- The merged catalog from `ActivityCatalogService.listForGroup` already includes dynamic nodes (Phase 6 Milestone D) — no need to fetch dynamic nodes separately for activity discovery.
