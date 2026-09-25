# US-068: Input-schema derivation — library `metadata.inputs[]` vs regular ctx `isInput: true`

**As a** developer implementing the `run-spec` endpoint,
**I want** a pure function `deriveInputSchema(config)` that returns a
JSON Schema describing the workflow's expected input payload,
**So that** the `run-spec` controller stays thin and the schema logic
is exhaustively unit-testable in isolation.

## Acceptance Criteria

- [x] **Scenario 1**: Library workflow → schema derived from `metadata.inputs[]`
    - **Given** a `GraphWorkflowConfig` with `metadata.kind === "library"` and `metadata.inputs = [{ label: "Foo", path: "foo", type: "string" }, { label: "Bar", path: "bar", type: "number" }]`
    - **When** `deriveInputSchema(config)` is called
    - **Then** the returned JSON Schema has `type: "object"`, `properties: { foo: { type: "string", title: "Foo" }, bar: { type: "number", title: "Bar" } }`
    - **And** `required: ["foo", "bar"]` (library inputs default to required since `LibraryPortDescriptor` has no `defaultValue`)

- [x] **Scenario 2**: Regular workflow → schema derived from ctx with `isInput: true`
    - **Given** a config with `ctx: { customerId: { type: "string", isInput: true, description: "Customer to process" }, internalCounter: { type: "number" }, optionalFlag: { type: "boolean", isInput: true, defaultValue: false } }`
    - **When** `deriveInputSchema(config)` is called
    - **Then** the returned JSON Schema has exactly two properties: `customerId` and `optionalFlag`
    - **And** `customerId` has `type: "string"`, `description: "Customer to process"`
    - **And** `optionalFlag` has `type: "boolean"`, `default: false`
    - **And** `required: ["customerId"]` (only the entry with no `defaultValue`)
    - **And** `internalCounter` is absent (not flagged as input)

- [x] **Scenario 3**: Empty input set
    - **Given** a workflow with no library inputs and no ctx entries marked `isInput`
    - **When** the function runs
    - **Then** the schema is `{ type: "object", properties: {}, required: [] }`

- [x] **Scenario 4**: `type: "array"` and `type: "object"` map without restriction
    - **Given** a ctx input declared `{ type: "object", isInput: true }`
    - **When** the function runs
    - **Then** the schema entry is `{ type: "object" }` (no `properties` constraint — Track 2 doesn't enforce deep shapes)
    - **And** the same holds for `type: "array"` → `{ type: "array" }` (no `items`)

- [x] **Scenario 5**: Function lives in the workflow service module and is pure
    - **Given** the function's location
    - **When** the file is read
    - **Then** the function is exported from a dedicated module (e.g. `apps/backend-services/src/workflow/derive-input-schema.ts`) — not buried in the service class
    - **And** the function has no Nest dependencies (no `@Injectable`, no DB access) — it takes a `GraphWorkflowConfig` and returns a `JsonSchema7Object` shape
    - **And** the unit tests live next to it (`derive-input-schema.test.ts` / `.spec.ts`) and cover all four scenarios above

- [x] **Scenario 6**: Library + ctx-isInput both present → library wins
    - **Given** a config with both `metadata.kind === "library"` AND ctx entries marked `isInput: true`
    - **When** the function runs
    - **Then** only `metadata.inputs[]` are reflected (library's declared signature is the source of truth; mixing both is an authoring smell but not a hard error)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/backend-services/src/workflow/derive-input-schema.ts` — the pure helper
- `apps/backend-services/src/workflow/derive-input-schema.spec.ts` — unit tests
- The controller / service from US-067 imports and calls this helper

## Notes

- The shape returned should match a generic JSON Schema 7 object subset (`{ type: "object", properties: Record<string, ...>, required: string[] }`). Don't import a heavy JSON Schema library — a small local TypeScript type is fine.
- TDD this story: write the spec first, then the implementation.
