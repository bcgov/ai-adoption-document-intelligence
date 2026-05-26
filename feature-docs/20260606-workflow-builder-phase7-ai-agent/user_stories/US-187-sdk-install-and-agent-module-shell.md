# US-187: Claude Agent SDK install + `AgentModule` shell + env-var validation

**As a** backend engineer setting up the Phase 7 foundation,
**I want** the `@anthropic-ai/claude-agent-sdk` npm dependency, an `AgentModule` shell that loads env vars at startup, and a fail-fast guard for missing `ANTHROPIC_API_KEY`,
**So that** every subsequent Phase 7 backend story can import the SDK and rely on env defaults being normalised at module boot.

## Acceptance Criteria

- [x] **Scenario 1**: `@anthropic-ai/claude-agent-sdk` added to backend dependencies
    - **Given** `apps/backend-services/package.json`
    - **When** read after the change
    - **Then** `dependencies` includes `@anthropic-ai/claude-agent-sdk` at the latest stable version
    - **And** `npm install` in `apps/backend-services/` completes without conflicts
    - **And** the package's TypeScript types resolve cleanly (e.g. `import { query } from '@anthropic-ai/claude-agent-sdk'` typechecks)

- [x] **Scenario 2**: New `src/agent/agent.module.ts` exports an empty `AgentModule` class
    - **Given** the backend
    - **When** `apps/backend-services/src/agent/agent.module.ts` is read after the change
    - **Then** it exports a `@Module({})`-decorated `AgentModule` class
    - **And** `app.module.ts` imports it in the `imports` array
    - **And** the backend boots without runtime errors after the import

- [x] **Scenario 3**: `AgentModule` reads env vars at startup with defaults
    - **Given** an `AgentEnv` injection token at `src/agent/agent.env.ts`
    - **When** the backend boots
    - **Then** it reads `ANTHROPIC_API_KEY`, `AGENT_MODEL` (default `claude-opus-4-7[1m]`), `AGENT_MAX_TURNS` (default `50`), `AGENT_MAX_OUTPUT_TOKENS` (default `8192`), `AGENT_CONTEXT_COMPRESSION_THRESHOLD` (default `0.75`)
    - **And** the parsed values are available via DI as a typed `AgentEnv` provider

- [x] **Scenario 4**: Missing `ANTHROPIC_API_KEY` throws a clear startup error
    - **Given** an environment without `ANTHROPIC_API_KEY` set
    - **When** the backend tries to boot
    - **Then** the bootstrap throws `Error("ANTHROPIC_API_KEY is required for the Phase 7 AgentModule")`
    - **And** no secret value is logged to stdout / stderr (per `feedback_secret_handling.md`)

- [x] **Scenario 5**: `AgentEnv` provider unit tests pass
    - **Given** the spec file `src/agent/agent.env.spec.ts`
    - **When** run via `npm test`
    - **Then** it covers: defaults applied when env vars missing, custom values respected when set, `ANTHROPIC_API_KEY` absence throws, numeric coercion (`AGENT_MAX_TURNS=10` returns `10` not `"10"`)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/package.json` — new dependency
- `apps/backend-services/package-lock.json` — regenerated
- `apps/backend-services/src/agent/agent.module.ts` — new file
- `apps/backend-services/src/agent/agent.env.ts` — new file
- `apps/backend-services/src/agent/agent.env.spec.ts` — new file
- `apps/backend-services/src/app.module.ts` — import `AgentModule`

## Technical notes

- Per L21 + L25 + L55 in REQUIREMENTS.md.
- This story unblocks every subsequent backend story in Milestones A → C.
- No frontend or Temporal changes in this story — backend-only.
- Don't print `ANTHROPIC_API_KEY` even in error messages (only its absence). Use `Boolean(env.ANTHROPIC_API_KEY)` in error logs, never the value.
- The `[1m]` suffix on the model ID is intentional (1M context preview); pass-through verbatim.
