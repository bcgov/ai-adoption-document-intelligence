# US-158: `parseDynamicNodeSignature` — JSDoc-parse stage

**As a** backend engineer building the publish-time validation pipeline,
**I want** a pure function in the shared package that reads a TS script's JSDoc header and emits a raw signature object,
**So that** the publish endpoint (US-164) and the frontend signature-preview pane (US-177) both extract the same structured signature from the same script text with no network round-trip.

## Acceptance Criteria

- [ ] **Scenario 1**: New `parse-signature.ts` file with `parseDynamicNodeSignature` export
    - **Given** `packages/graph-workflow/src/dynamic-nodes/`
    - **When** the file is read after the change
    - **Then** it exports `parseDynamicNodeSignature(script: string): { entry: ActivityCatalogEntry | null; errors: ParseError[] }`
    - **And** the function is pure (no I/O, no side effects)

- [ ] **Scenario 2**: Recognizes the `@workflow-node` marker tag
    - **Given** a script whose top-of-file JSDoc block contains `@workflow-node`
    - **When** parsed
    - **Then** the parser proceeds to extract subsequent tags
    - **And** a script whose JSDoc block does NOT contain `@workflow-node` returns `errors: [{ stage: "jsdoc-parse", message: "Missing @workflow-node marker", line: 1 }]`

- [ ] **Scenario 3**: Extracts every recognized tag with line numbers
    - **Given** a script with `@name`, `@description`, `@category`, `@deterministic`, `@inputs`, `@outputs`, `@parameters`, `@allowNet`, `@timeoutMs`, `@maxMemoryMB`
    - **When** parsed
    - **Then** the parser returns an internal record `{ name, description, category, deterministic, inputs, outputs, parameters, allowNet, timeoutMs, maxMemoryMB }` with raw JSON-ish values and line numbers preserved
    - **And** missing required tags (`@name`, `@description`, `@inputs`, `@outputs`) each produce one `ParseError` with `stage: "jsdoc-parse"` + `tag` + `line`

- [ ] **Scenario 4**: JSON-ish object values are parsed with JSON5-equivalent tolerance
    - **Given** an `@inputs` value like `{ document: { kind: "Document", required: true } }`
    - **When** parsed
    - **Then** it deserialises to a JavaScript object with the documented shape
    - **And** malformed JSON-ish (e.g. unterminated string, missing closing brace) produces `{ stage: "jsdoc-parse", line, column, message, tag: "@inputs" }`

- [ ] **Scenario 5**: Unit tests cover every error path + happy path
    - **Given** `parse-signature.test.ts` in the same directory
    - **When** the test suite runs
    - **Then** tests pass for: missing `@workflow-node`, missing each required tag, malformed `@inputs`, valid full signature, signature with all optional tags omitted (defaults applied), comment style variations (`/** ... */` vs `// ...`)

- [ ] **Scenario 6**: Function is exported from the package barrel
    - **Given** `packages/graph-workflow/src/index.ts`
    - **When** read
    - **Then** `parseDynamicNodeSignature` is re-exported

## Priority
- [ ] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/dynamic-nodes/parse-signature.ts` — new file
- `packages/graph-workflow/src/dynamic-nodes/parse-signature.test.ts` — new file
- `packages/graph-workflow/src/index.ts` — barrel re-export

## Technical notes

- Use a small hand-rolled JSDoc tokenizer rather than a full TS Compiler API parse — the parser must run client-side in the editor without bundling the TS compiler. JSON5 + line tracking is sufficient.
- This story only covers the `jsdoc-parse` STAGE — semantics validation (kind/slug/parameters checks) lands in US-159. The function returns `entry: null` until US-159 wires the semantics + entry assembly.
- Stage tag on every emitted error in this story is `"jsdoc-parse"`.
- After landing: no Vite restart needed yet (US-161 closes the package with the catalog-entry extension + final barrel — restart there).
