# US-161: `ActivityCatalogEntry` Phase-6 extension fields + final shared-package barrel

**As a** backend + frontend engineer wiring the catalog-merge layer,
**I want** the existing `ActivityCatalogEntry` type to optionally carry `dynamicNodeSlug`, `dynamicNodeVersion`, and `allowNet` fields,
**So that** the merged catalog endpoint, the canvas's "DYN" pill renderer, and the worker's version-resolution layer can all detect + read Phase-6-specific metadata uniformly without a parallel type hierarchy.

## Acceptance Criteria

- [ ] **Scenario 1**: `ActivityCatalogEntry` type extended with three optional fields
    - **Given** `packages/graph-workflow/src/catalog/types.ts`
    - **When** read after the change
    - **Then** the `ActivityCatalogEntry` interface carries three new optional fields: `dynamicNodeSlug?: string`, `dynamicNodeVersion?: number`, `allowNet?: string[]`
    - **And** none of the 41 existing static catalog entries set these fields (TS structural-typing keeps them unchanged at the type level)

- [ ] **Scenario 2**: Bulk catalog invariant test untouched by the extension
    - **Given** the existing bulk catalog invariant test (`packages/graph-workflow/src/catalog/catalog.test.ts`)
    - **When** the suite runs after the type change
    - **Then** every existing entry validates cleanly (`dynamicNodeSlug` absent is correct for static entries)
    - **And** a new sanity assertion confirms: if an entry sets `dynamicNodeSlug`, it must also set `dynamicNodeVersion` and `colorHint === "dyn"`

- [ ] **Scenario 3**: Shared-package barrel exports parser + types + kinds together
    - **Given** `packages/graph-workflow/src/index.ts`
    - **When** read after the change
    - **Then** the file re-exports: `parseDynamicNodeSignature` from `./dynamic-nodes/parse-signature`, `DynamicNodeSignature` / `DynamicNodeVersionRecord` / `ParseError` / `DynamicNodePort` from `./dynamic-nodes/types`, and the extended `ActivityCatalogEntry` from `./catalog/types`
    - **And** the subpath `@ai-di/graph-workflow/kinds` continues to resolve independently (per US-160's exports map entry)

- [ ] **Scenario 4**: Package `npm test` + `npm run build` both green
    - **Given** the package after Milestone A's stories all land
    - **When** `npm test` and `npm run build` run in `packages/graph-workflow`
    - **Then** both succeed with zero failures
    - **And** the package's published `.d.ts` declares the new types

- [ ] **Scenario 5**: Integration smoke — parser output assignable to catalog-entry type
    - **Given** a TS file that imports both `parseDynamicNodeSignature` and `ActivityCatalogEntry` and writes `const e: ActivityCatalogEntry | null = parseDynamicNodeSignature(script).entry`
    - **When** TypeScript checks the file
    - **Then** the assignment compiles cleanly (the parser's `entry` shape is assignable to the extended `ActivityCatalogEntry` type)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/types.ts` — extend `ActivityCatalogEntry`
- `packages/graph-workflow/src/catalog/catalog.test.ts` — extend bulk invariant assertion
- `packages/graph-workflow/src/index.ts` — close out the barrel

## Technical notes

- This story closes Milestone A. After landing all of US-157 → US-161, the shared package ships the full Phase 6 contract that the backend (Milestone B) and frontend (Milestone E) both consume.
- The bulk invariant addition is small but enforces the invariant the catalog-merge endpoint relies on (US-173 trusts that dynamic-flavored entries always carry `colorHint: "dyn"`).
- **After landing: ask Alex to restart Vite** — `packages/graph-workflow` introduces new runtime exports (parser + types + kinds subpath); Vite's pre-bundle goes stale otherwise.
