# US-191: System prompt at `prompts/workflow-builder.md` + `.claude/agents/` pointer

**As a** backend engineer + agent author,
**I want** the canonical system prompt for the workflow-builder agent persisted in the repo with a one-line pointer at `.claude/agents/workflow-builder.md`,
**So that** the agent runs with consistent instructions across restarts and external Claude Code clients can locate the canonical version.

## Acceptance Criteria

- [ ] **Scenario 1**: Canonical system prompt file created
    - **Given** `apps/backend-services/src/agent/prompts/workflow-builder.md`
    - **When** read after the change
    - **Then** it contains the 7-section prompt body specified in REQUIREMENTS.md L40 (catalog-first, library-first, explain-before-write, iterate-via-try, dynamic-node-last-resort, failure-handling-read-body-first, stopping-condition)
    - **And** every section names the specific tool calls the rule applies to (e.g. "always call `listActivityCatalog` + `listSourceCatalog` before composing")
    - **And** the file ends with a one-line "When in doubt, ask before writing" closing rule

- [ ] **Scenario 2**: `.claude/agents/workflow-builder.md` pointer file created
    - **Given** the repo root
    - **When** `.claude/agents/workflow-builder.md` is read after the change
    - **Then** it contains one line: `Canonical system prompt: see apps/backend-services/src/agent/prompts/workflow-builder.md`
    - **And** a short title comment line above (`# Workflow Builder Agent`)
    - **And** nothing else (no duplicate prompt content — single source of truth)

- [ ] **Scenario 3**: Prompt loader function
    - **Given** `apps/backend-services/src/agent/prompts/load.ts`
    - **When** read after the change
    - **Then** it exports `loadWorkflowBuilderPrompt(): string` that reads the file synchronously at first-call time + caches the result
    - **And** the path resolution uses `__dirname` (not relative to cwd) so it works in dev + bundled + Docker

- [ ] **Scenario 4**: Loader unit tests
    - **Given** `apps/backend-services/src/agent/prompts/load.spec.ts`
    - **When** run via `npm test`
    - **Then** tests cover: loader returns non-empty string, contains the rule keyword "catalog-first" (or similar verifiable substring), result cached on second call (file read only once)

- [ ] **Scenario 5**: Prompt content includes the dynamic-node escape-hatch rule explicitly
    - **Given** the prompt file
    - **When** grep'd for the substring "dynamic node"
    - **Then** at least one match exists AND the surrounding text instructs the agent to write a dynamic node ONLY when the merged catalog has no fit AND to pitch the script to the user before publishing
    - **And** at least one match instructs the agent to revise at the exact line/column from `ParseError[]` on publish failure

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/prompts/workflow-builder.md` — new (canonical content)
- `apps/backend-services/src/agent/prompts/load.ts` — new
- `apps/backend-services/src/agent/prompts/load.spec.ts` — new
- `.claude/agents/workflow-builder.md` — new (one-line pointer)

## Technical notes

- Per L40 + L56 in REQUIREMENTS.md.
- The pointer file is intentionally one line — duplicating prompt content would cause drift. Phase 7.x standalone MCP server export will read the canonical path.
- Prompt edits require backend restart to take effect (cached at first read). No hot-reload in 7.0.
- Closes Milestone A.
