# US-190: `ToolRegistry` singleton + `ToolDefinition` shape

**As a** backend engineer wiring agent tools,
**I want** a typed `ToolRegistry` singleton with `register()` / `getAll()` and a strict `ToolDefinition` shape,
**So that** every subsequent tool-file (catalog, workflow, dynamic-node, source, run) registers through one seam that the MCP server factory consumes.

## Acceptance Criteria

- [x] **Scenario 1**: `ToolDefinition` type declared
    - **Given** `apps/backend-services/src/agent/tool-registry.ts`
    - **When** read after the change
    - **Then** it exports a `ToolDefinition<TInput = unknown>` interface with `{ name: string, description: string, inputSchema: ZodObject<...>, handler: (input: TInput, ctx: McpContext) => Promise<ToolResult> }`
    - **And** it exports `type ToolResult = { ok: true, data: unknown } | { ok: false, error: { code: string, message: string, body?: unknown } }`
    - **And** it exports `interface McpContext { groupId: string, userId: string, workflowId?: string, prisma: PrismaClient, services: { workflows: WorkflowsService, dynamicNodes: DynamicNodesService, activityCatalog: ActivityCatalogService, runs: RunsService, sourceUpload: SourceUploadService } }`

- [x] **Scenario 2**: `ToolRegistry` class with `register()` + `getAll()` + `clear()` for tests
    - **Given** the same file
    - **When** read after the change
    - **Then** it exports `ToolRegistry` (Injectable singleton) with `register(def: ToolDefinition): void`, `getAll(): ToolDefinition[]`, and `clear(): void` (test-only)
    - **And** `register()` throws if a tool with the same name is already registered (prevents accidental double-register)
    - **And** `getAll()` returns the registry's tools in insertion order

- [x] **Scenario 3**: Registry is registered as a Nest provider in `AgentModule`
    - **Given** `agent.module.ts`
    - **When** read after the change
    - **Then** `ToolRegistry` is in `providers` AND `exports`
    - **And** `AgentModule` implements `OnModuleInit` (empty body for now — tool-self-register hooks land in subsequent stories)

- [x] **Scenario 4**: Unit tests for `ToolRegistry`
    - **Given** `tool-registry.spec.ts`
    - **When** run via `npm test`
    - **Then** tests cover: register one tool + getAll returns it, register two tools with the same name throws, clear empties the registry, getAll returns insertion order

- [x] **Scenario 5**: No tools registered yet
    - **Given** the backend after this story
    - **When** the backend boots
    - **Then** `ToolRegistry.getAll().length === 0`
    - **And** no compilation errors (the registry shape doesn't require any tools to be wired yet)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/tool-registry.ts` — new
- `apps/backend-services/src/agent/tool-registry.spec.ts` — new
- `apps/backend-services/src/agent/agent.module.ts` — register provider + add `OnModuleInit` hook

## Technical notes

- Per L33 in REQUIREMENTS.md.
- This story unblocks every tool file in Milestones B + C (catalog/workflow/dynamic-node/source/run tools).
- Service references in `McpContext` are typed but not constructed here — the registry stays empty until tool files self-register in their respective modules.
- Tools self-register through their tool files (e.g. `catalog.tools.ts`) which `AgentModule.onModuleInit` imports + invokes — the registration mechanism per file is decided in each tool story.
