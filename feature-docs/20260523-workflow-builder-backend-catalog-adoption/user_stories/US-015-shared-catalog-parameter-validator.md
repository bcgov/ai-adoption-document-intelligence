# US-015: Shared catalog-driven `validateActivityParameters` adapter

**As a** workflow-builder maintainer,
**I want to** have one shared adapter in `@ai-di/graph-workflow` that
walks the catalog's Zod parameter schema and pushes results onto the
`GraphValidationError[]` the shared `validateGraphConfig` expects,
**So that** backend, temporal, and frontend stop triplicating the same
adapter and the catalog becomes the single source of truth for static
activity-parameter validation.

## Acceptance Criteria

- [x] **Scenario 1**: Adapter runs catalog Zod schema for the activity type
    - **Given** the `ACTIVITY_CATALOG` has an entry for `"data.transform"` with a Zod parameter schema
    - **When** `createCatalogParameterValidator()` is called and the returned function is invoked with `("data.transform", "n1", { inputFormat: "yaml", outputFormat: "json", fieldMapping: "{}" }, errors)`
    - **Then** `errors` ends with at least one entry whose `path` is `"nodes.n1.parameters.inputFormat"` and `severity` is `"error"`

- [x] **Scenario 2**: Adapter ignores unregistered activity types
    - **Given** the catalog has no entry for `"nonexistent.activity"`
    - **When** the returned function is invoked with `("nonexistent.activity", "n1", { foo: "bar" }, errors)`
    - **Then** no errors are pushed; the activity-type-registered check is the caller's responsibility (it runs before this function)

- [x] **Scenario 3**: Adapter pushes one error per Zod issue with the right path
    - **Given** an activity whose Zod schema requires fields `a`, `b`, `c`
    - **When** the function is invoked with `{}` (none provided)
    - **Then** three errors are pushed at paths `nodes.<id>.parameters.a`, `nodes.<id>.parameters.b`, `nodes.<id>.parameters.c` (order not asserted)

- [x] **Scenario 4**: Nested Zod paths produce dot-joined error paths
    - **Given** an activity whose schema has `z.object({ wrapper: z.object({ inner: z.string() }) })`
    - **When** the function is invoked with `{ wrapper: { inner: 42 } }`
    - **Then** an error is pushed at path `nodes.<id>.parameters.wrapper.inner`

- [x] **Scenario 5**: Array-element issues use indexed paths
    - **Given** an activity whose schema has `z.object({ rules: z.array(z.object({ name: z.string() })) })`
    - **When** the function is invoked with `{ rules: [{ name: "ok" }, { name: 42 }] }`
    - **Then** an error is pushed at path `nodes.<id>.parameters.rules.1.name`

- [x] **Scenario 6**: Custom catalog can be passed for testing
    - **Given** a test-only catalog with a single fake activity entry
    - **When** `createCatalogParameterValidator({ "fake.activity": fakeEntry })` is used
    - **Then** the returned function validates against `fakeEntry.parametersSchema` and does NOT consult the default `ACTIVITY_CATALOG`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- The adapter currently exists in three places: `apps/frontend/src/features/workflow-builder/validation/useGraphValidation.ts:48`, and as the imperative registry pattern in the two `activity-parameter-schema-registry.ts` files. The frontend one already does the catalog-walk dance; lifting it into the package is mostly a move.
- Signature must exactly match `ValidateGraphConfigOptions.validateActivityParameters` in `packages/graph-workflow/src/validator/validator.ts:68` so it drops directly into the existing call site.
- Output `GraphValidationError.severity` is always `"error"` from this adapter — the Zod schemas don't model warnings.
- Don't catch unexpected exceptions: if `safeParse` throws (it shouldn't — that's the whole point of safeParse), let it propagate so the bug surfaces.

## Files modified

- `packages/graph-workflow/src/catalog/create-parameter-validator.ts` — NEW; exports `createCatalogParameterValidator(catalog?: Record<string, ActivityCatalogEntry>)` returning a `validateActivityParameters` function.
- `packages/graph-workflow/src/catalog/create-parameter-validator.test.ts` — NEW; covers the six scenarios above.
- `packages/graph-workflow/src/catalog/index.ts` — re-export `createCatalogParameterValidator`.
- `packages/graph-workflow/src/index.ts` — re-export at package root.
