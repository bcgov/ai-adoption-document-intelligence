# US-091: `subtype-check.ts` — `isAssignable(from, to)` walking the registry's `baseKind` chain

**As a** validator + picker consumer,
**I want** one function that answers "is producer kind X assignable to consumer kind Y?",
**So that** picker dimming and save-time error checks both share identical subtype semantics.

## Acceptance Criteria

- [ ] **Scenario 1**: Identity returns true
    - **Given** `isAssignable(from, to)`
    - **When** called with any `from === to`
    - **Then** returns `true`
    - **And** this holds for both base kinds (`"Document"` → `"Document"`) and arrays (`"Segment[]"` → `"Segment[]"`)

- [ ] **Scenario 2**: Subtype-to-supertype works, reverse rejected
    - **Given** the registry chain `SinglePageDocument → Document → Artifact`
    - **When** `isAssignable("SinglePageDocument", "Document")` is called
    - **Then** returns `true`
    - **And** `isAssignable("Document", "SinglePageDocument")` returns `false`
    - **And** `isAssignable("SinglePageDocument", "Artifact")` returns `true` (transitive walk)
    - **And** `isAssignable("Segment<Table>", "Segment")` returns `true`
    - **And** `isAssignable("Segment", "Segment<Table>")` returns `false`

- [ ] **Scenario 3**: Array cardinality is strict
    - **Given** `isAssignable("Document", "Document[]")` is called
    - **When** evaluated
    - **Then** returns `false` (no auto-wrap)
    - **And** `isAssignable("Document[]", "Document")` returns `false` (no auto-unwrap)
    - **And** `isAssignable("SinglePageDocument[]", "Document[]")` returns `true` (element subtype works across cardinality)
    - **And** `isAssignable("Document[]", "Artifact[]")` returns `true`

- [ ] **Scenario 4**: Unknown kinds default to wildcard `Artifact`
    - **Given** a `kind` value not in the registry (legacy or typo)
    - **When** `isAssignable("UnknownKind", "Document")` is called
    - **Then** returns `true` (treated as `Artifact`, compatible with anything)
    - **And** `isAssignable("Document", "UnknownKind")` returns `true` (Document → Artifact)

- [ ] **Scenario 5**: `Artifact` is the universal target
    - **Given** any kind `K` in or out of the registry
    - **When** `isAssignable(K, "Artifact")` is called
    - **Then** returns `true`
    - **And** `isAssignable("Artifact", K)` returns `false` when `K !== "Artifact"` (upcast rejected)
    - **And** `isAssignable("Artifact[]", "Artifact[]")` returns `true` (identity still wins)

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/types/subtype-check.ts` — new (exports `isAssignable(from: string \| undefined, to: string \| undefined): boolean`; both undefined parameters → `true` since both default to `Artifact`)
- `packages/graph-workflow/src/types/subtype-check.test.ts` — covers all five scenarios + a parametric matrix asserting transitivity for the full v1 registry
- `packages/graph-workflow/src/types/index.ts` — re-export `isAssignable`
- `packages/graph-workflow/src/index.ts` — re-export through package barrel

## Technical notes

- Implementation: split `"T[]"` into `{ elementKind: "T", isArray: true }`; both sides must agree on `isArray`; element kind check walks the `baseKind` chain via the registry.
- Performance is irrelevant — the picker walks a few dozen variables, the validator walks a few dozen ports. Don't memoize; correctness first.
- `isAssignable(undefined, "Document")` and `isAssignable("Document", undefined)` should both return `true` — undefined means "no kind declared," which collapses to `Artifact` wildcard. Saves callers from null-coalescing at every call site.
