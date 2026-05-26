# US-201: Dynamic-node write tools — `publishDynamicNode` + `updateDynamicNode` + `deleteDynamicNode`

**As a** backend engineer giving the agent the dynamic-node escape hatch,
**I want** three write tools that wrap Phase 6's publish-create / publish-new-version / soft-delete endpoints,
**So that** the agent can author custom TypeScript activities when the static catalog runs out and revise on `ParseError[]` failures at exact line/column.

## Acceptance Criteria

- [ ] **Scenario 1**: `publishDynamicNode` tool registered
    - **Given** `apps/backend-services/src/agent/tools/dynamic-node.tools.ts`
    - **When** read after the change
    - **Then** it registers `publishDynamicNode` with `inputSchema: z.object({ script: z.string().min(1) })` (slug is derived from the JSDoc `@name` tag inside the script per Phase 6)
    - **And** the handler calls `ctx.services.dynamicNodes.create({ groupId: ctx.groupId, script: input.script, publishedByUserId: ctx.userId })`
    - **And** on 400 from Phase 6's validation pipeline, returns `{ ok: false, error: { code: 'dynamic-node-publish', message: 'Publish failed', body: { errors: ParseError[] } } }`
    - **And** on 409 (duplicate slug), returns `{ ok: false, error: { code: 'duplicate-slug', message: '...' } }`

- [ ] **Scenario 2**: `updateDynamicNode` tool registered
    - **Given** the same file
    - **When** read after the change
    - **Then** it registers `updateDynamicNode` with `inputSchema: z.object({ slug: z.string(), script: z.string().min(1) })`
    - **And** the handler calls `ctx.services.dynamicNodes.publishNewVersion({ groupId: ctx.groupId, slug, script, publishedByUserId: ctx.userId })`
    - **And** on 404 (lineage unknown), returns `{ ok: false, error: { code: 'not-found' } }`
    - **And** on 409 (script's @name differs from path slug), returns `{ ok: false, error: { code: 'slug-mismatch' } }`

- [ ] **Scenario 3**: `deleteDynamicNode` tool registered
    - **Given** the same file
    - **When** read after the change
    - **Then** it registers `deleteDynamicNode` with `inputSchema: z.object({ slug: z.string() })`
    - **And** the handler calls `ctx.services.dynamicNodes.softDelete({ groupId: ctx.groupId, slug })`
    - **And** returns `{ ok: true, data: { slug, deletedAt } }`
    - **And** is idempotent (re-deleting returns 200 with existing `deletedAt`)

- [ ] **Scenario 4**: `ParseError[]` round-trips with line + column intact
    - **Given** a deliberately-broken script (e.g. `const x: number = "string";` triggering a `ts-check` error)
    - **When** `publishDynamicNode` is called with that script
    - **Then** the tool result is `{ ok: false, error: { code: 'dynamic-node-publish', body: { errors: [{ stage: 'ts-check', line: <N>, column: <M>, message: ... }] } } }`
    - **And** the test asserts the `line` + `column` fields are numbers (not strings or missing)

- [ ] **Scenario 5**: Unit tests cover all three tools + the escape-hatch revision path
    - **Given** `dynamic-node.tools.spec.ts` extended
    - **When** run via `npm test`
    - **Then** tests cover: publish happy path, publish with ts-check error returns structured body with line/column, publish duplicate slug, update happy path bumps versionNumber, update slug-mismatch, delete happy path, delete idempotency, "publish broken script → revise → re-publish" sequence end-to-end (mocked agent path)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/agent/tools/dynamic-node.tools.ts` — extend with three write tools
- `apps/backend-services/src/agent/tools/dynamic-node.tools.spec.ts` — extend

## Technical notes

- Per L18 + L36 in REQUIREMENTS.md.
- This is the load-bearing tool set for the iteration loop's escape hatch — Phase 6's structured `ParseError[]` was designed specifically for this consumer.
- The agent's prompt (US-191) instructs it to read `error.body.errors[0].line` + `column` and revise at exactly that location.
