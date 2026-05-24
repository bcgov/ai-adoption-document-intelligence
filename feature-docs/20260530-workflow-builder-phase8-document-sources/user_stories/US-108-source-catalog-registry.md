# US-108: `source-catalog.ts` — `SOURCE_CATALOG` + helpers

**As a** shared-package consumer,
**I want** a runtime registry of source catalog entries with lookup helpers,
**So that** the validator (US-109), the backend run-spec derivation (US-111), and the frontend palette (US-118) all read the same source-subtype directory.

## Acceptance Criteria

- [ ] **Scenario 1**: `SOURCE_CATALOG` exported as a frozen array
    - **Given** `packages/graph-workflow/src/catalog/source-catalog.ts` (new file)
    - **When** the file is read
    - **Then** it exports `export const SOURCE_CATALOG: ReadonlyArray<SourceCatalogEntry> = [] as const`
    - **And** the entries array is empty at this milestone (US-115 + US-116 add the two 8.0 entries)
    - **And** the array is `as const` / `ReadonlyArray` so callers cannot mutate it

- [ ] **Scenario 2**: `getSourceCatalogEntry(sourceType)` lookup
    - **Given** the same file
    - **When** read
    - **Then** it exports `function getSourceCatalogEntry(sourceType: string): SourceCatalogEntry | undefined`
    - **And** the function does an O(n) linear search over `SOURCE_CATALOG` (n ≤ 6 in foreseeable scope; no need for a Map)
    - **And** a unit test asserts unknown sourceType returns undefined

- [ ] **Scenario 3**: `listSourceTypes()` + `createSourceParameterValidator()`
    - **Given** the same file
    - **When** read
    - **Then** it exports `listSourceTypes(): readonly string[]` (returns `SOURCE_CATALOG.map(e => e.type)`)
    - **And** it exports `createSourceParameterValidator(): (sourceType: string, parameters: unknown) => Result<void, ValidationError>` — the result-shaped adapter consumed by the validator
    - **And** the adapter rejects unknown sourceType with a clear error message naming the unknown subtype

- [ ] **Scenario 4**: `deriveSourceOutputSchema(sourceNode)` helper
    - **Given** the same file
    - **When** read
    - **Then** it exports `deriveSourceOutputSchema(sourceNode: SourceNode): JsonSchema7`
    - **And** it resolves the source's catalog entry, then calls `entry.deriveOutputSchema(sourceNode.parameters ?? {})`
    - **And** throws a clear error if the sourceType doesn't resolve (caller is expected to have validated upstream)
    - **And** unit tests cover happy path + unknown sourceType

- [ ] **Scenario 5**: Package barrel re-exports + build green
    - **Given** the package barrel and any catalog sub-barrel
    - **When** read after the change
    - **Then** `SOURCE_CATALOG`, `getSourceCatalogEntry`, `listSourceTypes`, `createSourceParameterValidator`, `deriveSourceOutputSchema` are all re-exported
    - **And** `npm run build` + `npm test` in `packages/graph-workflow/` succeed

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/source-catalog.ts` — new
- `packages/graph-workflow/src/catalog/source-catalog.test.ts` — new (empty-catalog smoke tests + lookup helpers)
- `packages/graph-workflow/src/catalog/index.ts` and/or `src/index.ts` — re-exports

## Technical notes

- Mirror the surface of the activity catalog (`ACTIVITY_CATALOG`, `getActivityCatalogEntry`, `listActivityTypes`, `createCatalogParameterValidator`) — design intent is "same package, parallel registry".
- `Result<void, ValidationError>` — match whatever shape `createCatalogParameterValidator()` already returns. Don't introduce a new error shape.
- These ARE runtime exports — after merging this story, **ask Alex to restart Vite** so the frontend pre-bundle picks up the new exports.
- US-115 + US-116 will register the two 8.0 entries. Until then, the catalog is empty but functional; the validator (US-109) will treat every `SourceNode.sourceType` as unknown until those entries land.
