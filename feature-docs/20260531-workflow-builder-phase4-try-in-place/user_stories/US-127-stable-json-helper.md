# US-127: `stable-json.ts` canonical JSON helper

**As a** consumer of cache-key hashing (worker decorator + backend preview-cache endpoint),
**I want** a pure `stableJson(value)` function that produces canonical JSON with sorted keys + deterministic array ordering,
**So that** two identical inputs reliably produce the same SHA-256 hash regardless of object-key insertion order.

## Acceptance Criteria

- [ ] **Scenario 1**: Sorted-key serialisation for objects
    - **Given** `packages/graph-workflow/src/cache/stable-json.ts`
    - **When** the new file is read
    - **Then** it exports `function stableJson(value: unknown): string`
    - **And** `stableJson({ b: 2, a: 1 })` returns `'{"a":1,"b":2}'` regardless of insertion order
    - **And** nested objects sort recursively — `stableJson({ outer: { z: 1, a: 2 } })` returns `'{"outer":{"a":2,"z":1}}'`

- [ ] **Scenario 2**: Arrays preserve order (not sorted)
    - **Given** the helper
    - **When** called with an array
    - **Then** array element order is preserved verbatim — `stableJson([3, 1, 2])` returns `'[3,1,2]'`
    - **And** array elements are themselves canonicalised — `stableJson([{ b: 1, a: 2 }])` returns `'[{"a":2,"b":1}]'`

- [ ] **Scenario 3**: Primitives + null + undefined
    - **Given** the helper
    - **When** called with primitives
    - **Then** strings, numbers, booleans, and null serialise verbatim
    - **And** `undefined` at the top level returns `'null'` (matches `JSON.stringify` behaviour for parity)
    - **And** `undefined` as an object property is omitted (parity with `JSON.stringify`)

- [ ] **Scenario 4**: No insignificant whitespace
    - **Given** the helper
    - **When** called with any value
    - **Then** output contains no extra whitespace (no spaces after `:` or `,`, no newlines)

- [ ] **Scenario 5**: Unit tests cover the contract
    - **Given** `packages/graph-workflow/src/cache/stable-json.test.ts`
    - **When** tests run via `npm test` in `packages/graph-workflow`
    - **Then** at least 8 cases pass covering: nested objects, mixed arrays/objects, deep nesting (≥3 levels), unicode keys, numeric keys (stringified), empty object, empty array, sentinel value (Symbol → omitted)

- [ ] **Scenario 6**: Re-exported from package barrel
    - **Given** `packages/graph-workflow/src/index.ts`
    - **When** read after the change
    - **Then** `stableJson` is exported from the barrel
    - **And** `npm run build` succeeds; the dist file includes the export

## Priority
- [ ] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/cache/stable-json.ts` — implementation
- `packages/graph-workflow/src/cache/stable-json.test.ts` — vitest unit tests
- `packages/graph-workflow/src/index.ts` — barrel re-export

## Technical notes

- This is a pure function — no I/O, no closures, no module-level state.
- Implementation tip: recursive descent. For objects, `Object.keys(obj).sort()`, then recursively `stableJson` each value, join with `","`, wrap in `{}`. For arrays, map each element through `stableJson` in order. For primitives, fall through to `JSON.stringify`.
- Consumed by both the worker decorator (US-132) for cache writes and the backend (US-140) for cache lookups. Both paths must produce identical hash inputs given identical logical inputs.
- This helper is the foundation for L12 (`configHash`) and L13 (`inputHash`). Bugs here cause cache misses or false hits silently.
- After landing: **ask Alex to restart Vite** (new runtime export from `@ai-di/graph-workflow`).
