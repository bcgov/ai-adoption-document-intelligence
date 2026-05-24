# US-109: `SourceNode` structural validation + `source.api` ⇄ `isInput` warning

**As a** workflow author,
**I want** the save-time validator to surface clear errors when a source node is malformed or when the workflow has conflicting intake configuration,
**So that** invalid graphs never reach the runtime and the dual-source-of-truth case (source.api + legacy isInput) is unambiguous.

## Acceptance Criteria

- [ ] **Scenario 1**: SourceNode with non-empty `inputs[]` rejected
    - **Given** `packages/graph-workflow/src/validator/validator.ts`
    - **When** a `validateGraphConfig` call processes a config containing a `SourceNode` whose `inputs[]` array is non-empty
    - **Then** the validator emits a `GraphValidationError` (severity `"error"`) anchored to the source node id with message `"Source node \`<id>\` cannot have inputs[]; sources have no upstream"`
    - **And** an empty/absent `inputs` field passes (default behaviour)

- [ ] **Scenario 2**: Unknown `sourceType` rejected
    - **Given** the same validator
    - **When** a config contains a `SourceNode` whose `sourceType` is not in `SOURCE_CATALOG`
    - **Then** the validator emits an error anchored to the source node id with message `"Source node \`<id>\` references unknown source type \`<sourceType>\`"`

- [ ] **Scenario 3**: `parameters` failing the entry's `parametersSchema` rejected
    - **Given** the same validator and a registered source subtype (synthetic catalog entry used in tests until US-115/116 land)
    - **When** a `SourceNode.parameters` fails the entry's Zod validation
    - **Then** the validator emits a `GraphValidationError` anchored to the source node id with the Zod error path + message (mirroring the existing `createCatalogParameterValidator` pattern for activity parameters)

- [ ] **Scenario 4**: Multi-`source.api` + multi-`source.upload` rejected (Phase 8.0 restriction)
    - **Given** the same validator
    - **When** a config contains 2+ `SourceNode`s of subtype `source.api` (or 2+ of `source.upload`)
    - **Then** the validator emits a `GraphValidationError` (anchored to one of the source nodes; consumer-port semantics don't apply here) with message `"Phase 8.0 supports at most one source of subtype \`<subtype>\` per workflow — multi-source.<subtype> is deferred to Phase 8.x"`
    - **And** one of each subtype (one `source.api` + one `source.upload`) coexisting is accepted

- [ ] **Scenario 5**: Soft warning when both `source.api` and `isInput`-flagged ctx present
    - **Given** the same validator
    - **When** a config has BOTH a `source.api` node AND one or more `CtxDeclaration` entries flagged `isInput: true`
    - **Then** the validator emits a `GraphValidationError` with `severity: "warning"` (NOT `"error"`) and message `"Workflow has a source.api node — isInput flags on ctx declarations are ignored. Remove isInput flags or remove the source.api to clarify intent."`
    - **And** the save proceeds (warnings do not block save)

- [ ] **Scenario 6**: Existing validator tests still green
    - **Given** the existing validator test suite in `packages/graph-workflow/src/validator/`
    - **When** the new SourceNode rules ship
    - **Then** all pre-existing validator tests continue to pass
    - **And** new tests cover Scenarios 1–5 with synthetic source catalog entries

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/validator/validator.ts` — extend with the 5 new rules
- `packages/graph-workflow/src/validator/validator.test.ts` (or a new `validator-source-nodes.test.ts`) — new test cases for Scenarios 1–5

## Technical notes

- Tests use **synthetic catalog entries** registered via a test-only helper (mirrors how Phase 3's binding-walk validator tests work before catalog fan-out lands). Until US-115/116 ship, real source catalog entries don't exist — so test fixtures fabricate `SourceCatalogEntry` instances.
- Error anchoring: per the existing `GraphValidationError` shape, `nodeId` is the source node id; `port` is undefined for source-node errors (no consumer port semantics).
- Multi-source check is a separate pass that groups `SourceNode`s by `sourceType` and asserts each group's size ≤ 1.
- The `isInput`-warning check is a separate pass that runs only when at least one `SourceNode` of subtype `source.api` is present.
- **No runtime impact** — these rules fire at save-time inside `validateGraphConfig`.
