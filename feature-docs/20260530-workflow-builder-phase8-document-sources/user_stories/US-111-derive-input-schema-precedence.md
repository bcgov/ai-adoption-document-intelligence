# US-111: `deriveInputSchema()` precedence — source.api > library > isInput > empty

**As a** workflow author whose workflow has a `source.api` node,
**I want** the backend's run-spec derivation to read the source.api's `fields[]` as the authoritative input schema,
**So that** /run-spec and /runs validate against the source-node-declared shape (not the legacy `isInput`-flagged ctx).

## Acceptance Criteria

- [x] **Scenario 1**: `source.api` wins over `isInput`-flagged ctx
    - **Given** `apps/backend-services/src/workflow/build-run-spec.ts` (the existing Phase 2 Track 2 helper)
    - **When** `deriveInputSchema(config)` is called on a config that has BOTH a `source.api` node and `isInput`-flagged ctx declarations
    - **Then** the returned JSON Schema comes from `deriveSourceOutputSchema(<source.api>)` — the `isInput`-flagged ctx is ignored
    - **And** a unit test asserts this precedence verbatim

- [x] **Scenario 2**: library `metadata.inputs[]` wins when no `source.api`
    - **Given** the same helper
    - **When** `deriveInputSchema(config)` is called on a library workflow (no source.api) with `metadata.inputs[]` populated
    - **Then** the existing Track-1 library derivation runs unchanged
    - **And** the existing test for this path still passes

- [x] **Scenario 3**: `isInput`-flagged ctx wins when no source.api + no library
    - **Given** the same helper
    - **When** called on a legacy workflow (no source.api, no library) with at least one `CtxDeclaration` flagged `isInput: true`
    - **Then** the existing Track-2 derivation runs unchanged
    - **And** the existing tests still pass

- [x] **Scenario 4**: empty schema fallback when none of the above
    - **Given** the same helper
    - **When** called on a workflow with no source.api, no library inputs, and no isInput-flagged ctx
    - **Then** it returns the existing empty-schema shape (`{ type: "object", properties: {}, required: [] }` or equivalent — match the existing empty-fallback shape)

- [x] **Scenario 5**: `source.api` with empty `fields[]` → empty-object schema
    - **Given** the helper called on a workflow whose source.api's `parameters.fields[]` is `[]`
    - **When** the helper runs
    - **Then** it returns an empty-object schema (no required fields, no properties) — caller can POST `{}` and pass validation

- [x] **Scenario 6**: full unit-test coverage at `build-run-spec.test.ts`
    - **Given** the existing test file
    - **When** the new precedence-order tests are added
    - **Then** all 5 precedence cases (4 priorities + source.api-empty-fields) have explicit assertions
    - **And** the full backend test suite remains green

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflow/build-run-spec.ts` — extend `deriveInputSchema(config)` with the L12 precedence
- `apps/backend-services/src/workflow/build-run-spec.test.ts` — add Scenarios 1, 4, 5 tests; verify Scenarios 2, 3 tests still pass

## Technical notes

- The helper is a **pure function** — no I/O, no DB. Tests stay synchronous.
- Use `getSourceCatalogEntry(sourceNode.sourceType)` from `@ai-di/graph-workflow` to resolve the source's `deriveOutputSchema`. Until US-115 lands, tests can pass `config` shapes with synthetic source catalog entries registered via a test helper.
- DO NOT introduce a new helper for "find source.api in config" — inline the `config.nodes` filter (`Object.values(config.nodes).find(n => n.type === "source" && n.sourceType === "source.api")`).
- Per DOCUMENT_SOURCES_DESIGN.md §4.1, this precedence is symmetric across `/run-spec` (US-112) and `/runs` (US-113). Land the helper change in this story; the controllers consume it in subsequent stories.
