# US-092: Extend `PortDescriptor` + `CtxDeclaration` + `LibraryPortDescriptor` with `kind?: KindRef`

**As a** schema author / catalog author / library publisher,
**I want** one consistent optional field for typed-artifact annotation across all three port-declaring shapes,
**So that** the validator + picker + handle renderer can resolve a port's kind through a single lookup regardless of where the port came from.

## Acceptance Criteria

- [ ] **Scenario 1**: `PortDescriptor` grows optional `kind?: KindRef`
    - **Given** `packages/graph-workflow/src/catalog/types.ts`
    - **When** read
    - **Then** `interface PortDescriptor` declares `kind?: KindRef` (template-literal union from US-089)
    - **And** an inline JSDoc explains "Optional. When omitted, the port is treated as `Artifact` (wildcard)."
    - **And** existing pre-Phase-3 catalog entries (without `kind`) still satisfy the interface

- [ ] **Scenario 2**: `CtxDeclaration` grows optional `kind?: KindRef`
    - **Given** `packages/graph-workflow/src/types.ts`
    - **When** read
    - **Then** `interface CtxDeclaration` declares `kind?: KindRef` alongside the existing `type` / `description` / `defaultValue` / `isInput` fields
    - **And** a JSDoc explains "Artifact-layer annotation. Coexists with `type` — `type` is runtime-shape; `kind` is the typed-I/O kind. Omitted = `Artifact` wildcard."
    - **And** validator still accepts existing ctx declarations without `kind`

- [ ] **Scenario 3**: `LibraryPortDescriptor` grows optional `kind?: KindRef`
    - **Given** `packages/graph-workflow/src/types.ts`
    - **When** read
    - **Then** `interface LibraryPortDescriptor` declares `kind?: KindRef` alongside `label` / `path` / `type`
    - **And** existing library workflows (without `kind`) validate cleanly
    - **And** a library that declares `kind: "Document"` on an input survives a save → load round-trip via the existing `WorkflowResponseDto`

- [ ] **Scenario 4**: Package builds + validator tests stay green
    - **Given** the three extensions
    - **When** `npm run build` and `npm test` run in `packages/graph-workflow/`
    - **Then** both succeed
    - **And** the existing validator-test count grows by exactly 3 new assertions (one per shape) confirming "shape-with-`kind` validates same as shape-without-`kind`"

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/types.ts` — extend `PortDescriptor`
- `packages/graph-workflow/src/types.ts` — extend `CtxDeclaration` + `LibraryPortDescriptor`
- `packages/graph-workflow/src/validator/validator.test.ts` — three new test cases (one per shape) asserting the new field is accepted

## Technical notes

- All three extensions are additive + optional. No migration. No breaking change.
- `KindRef` lives in `src/types/artifacts.ts` (US-089). Import it via the package barrel — don't re-declare the union here.
- The validator does NOT yet consume the new field; that's US-093 (binding-walk validator pass).
