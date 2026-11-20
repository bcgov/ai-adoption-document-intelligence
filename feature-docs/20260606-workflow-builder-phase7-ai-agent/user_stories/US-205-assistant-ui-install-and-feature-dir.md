# US-205: `@assistant-ui/react` install + feature directory shell

**As a** frontend engineer setting up the Phase 7 chat UI,
**I want** the `@assistant-ui/react` npm dependency installed AND a new `features/workflow-builder/agent-chat/` directory with an index barrel,
**So that** every subsequent Milestone D / E / F frontend story has a stable place to put files + a working package import.

## Acceptance Criteria

- [x] **Scenario 1**: `@assistant-ui/react` added to frontend dependencies
    - **Given** `apps/frontend/package.json`
    - **When** read after the change
    - **Then** `dependencies` includes `@assistant-ui/react` at the latest stable version
    - **And** `npm install` in `apps/frontend/` completes without conflicts
    - **And** `import { Thread, Composer } from '@assistant-ui/react'` typechecks at the call site
    - **And** NO style packs (e.g. `@assistant-ui/styles`) are installed — primitives stay unstyled per L22

- [x] **Scenario 2**: New `features/workflow-builder/agent-chat/` directory scaffolded
    - **Given** `apps/frontend/src/features/workflow-builder/`
    - **When** read after the change
    - **Then** there's a new `agent-chat/` subdirectory with `index.ts` (barrel — empty exports for now), `runtime/`, `messages/`, `composer/`, `header/` subdirectories
    - **And** the `index.ts` exports the public surface (initially empty; later stories populate it)

- [x] **Scenario 3**: Vite + TS path resolution validates the new directory
    - **Given** a temporary placeholder `agent-chat/placeholder.ts` exporting a const
    - **When** another file imports `import { placeholder } from '@/features/workflow-builder/agent-chat'`
    - **Then** the import resolves and Vite serves the dev bundle without errors
    - **And** TypeScript compiles cleanly (`tsc --noEmit`)
    - **And** the placeholder is deleted at the end of this story (no leftover dead code)

- [x] **Scenario 4**: Vite restart required + documented
    - **Given** the new npm dep
    - **When** `npm install` lands
    - **Then** `apps/frontend/` Vite needs a restart so `optimizeDeps` picks up `@assistant-ui/react`
    - **And** the story closeout notes "Vite restart required after this story" so the orchestrator pings Alex per cadence

- [x] **Scenario 5**: Frontend test suite still green
    - **Given** the test runner in `apps/frontend`
    - **When** `npm test` runs after the change
    - **Then** all existing tests pass (no regressions)
    - **And** no new test fixtures or mocks are required by this story (the package isn't used yet)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/package.json` — new dependency
- `apps/frontend/package-lock.json` — regenerated
- `apps/frontend/src/features/workflow-builder/agent-chat/index.ts` — empty barrel
- `apps/frontend/src/features/workflow-builder/agent-chat/runtime/.gitkeep` — placeholder dir
- `apps/frontend/src/features/workflow-builder/agent-chat/messages/.gitkeep`
- `apps/frontend/src/features/workflow-builder/agent-chat/composer/.gitkeep`
- `apps/frontend/src/features/workflow-builder/agent-chat/header/.gitkeep`

## Technical notes

- Per L22 in REQUIREMENTS.md.
- This is a pure-scaffolding story — no UI yet. The first real component (the runtime adapter) lands in US-206.
- assistant-ui's runtime API is the integration surface; we'll use a CUSTOM runtime (not the built-in `useEdgeRuntime` etc.) because our backend protocol is SSE not AI SDK data-stream format.
