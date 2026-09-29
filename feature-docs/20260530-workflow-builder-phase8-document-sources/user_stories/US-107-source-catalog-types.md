# US-107: `source-types.ts` — `SourceCatalogEntry` / `SourceRuntimePattern` / `FieldDescriptor`

**As a** shared-package author,
**I want** typed scaffolding for source catalog entries,
**So that** every source subtype (8.0's `source.api` / `source.upload` and 8.x's pull-pattern sources) declares its shape against a single contract.

## Acceptance Criteria

- [x] **Scenario 1**: `SourceRuntimePattern` union
    - **Given** `packages/graph-workflow/src/catalog/source-types.ts` (new file)
    - **When** the file is read
    - **Then** it exports `type SourceRuntimePattern = "push" | "pull" | "manual"`
    - **And** a top-level JSDoc explains the mapping: push = webhook/API (8.0: source.api); pull = polling/cron (8.x: source.cron, source.sharepoint, …); manual = canvas-side test affordance (8.0: source.upload)

- [x] **Scenario 2**: `SourceCatalogEntry` interface
    - **Given** the same file
    - **When** read
    - **Then** it exports `interface SourceCatalogEntry` with fields per DOCUMENT_SOURCES_DESIGN.md §2: `type: string`, `category: "source"`, `displayName: string`, `description: string`, `iconHint?: string`, `colorHint?: string`, `parametersSchema: ZodSchema`, `runtime: SourceRuntimePattern`, `deriveOutputSchema: (parameters: Record<string, unknown>) => JsonSchema7`, `outputKind: KindRef`
    - **And** JSDoc on `deriveOutputSchema` notes it MUST be pure (no I/O)

- [x] **Scenario 3**: `FieldDescriptor` interface for source.api fields
    - **Given** the same file
    - **When** read
    - **Then** it exports `interface FieldDescriptor` with: `name: string`, `type: "string" | "number" | "boolean" | "object" | "array"`, `kind?: KindRef`, `required: boolean`, `description?: string`, `defaultValue?: unknown`
    - **And** JSDoc cross-references the `CtxDeclaration` shape (intentionally mirrors it minus optional `isInput`)

- [x] **Scenario 4**: Package barrel re-export + build green
    - **Given** the package barrel
    - **When** read after the change
    - **Then** all three new types (`SourceCatalogEntry`, `SourceRuntimePattern`, `FieldDescriptor`) are re-exported
    - **And** `npm run build` in `packages/graph-workflow/` succeeds

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/source-types.ts` — new
- `packages/graph-workflow/src/catalog/index.ts` (or the package's `src/index.ts`) — re-export

## Technical notes

- `KindRef` is the Phase 3 type from `src/types/artifacts.ts` (already exported). Reuse, don't duplicate.
- `JsonSchema7` — match whatever `deriveInputSchema()` already consumes/returns in `apps/backend-services/src/workflow/build-run-spec.ts` (Phase 2 Track 2 already deals in JSON Schema 7 subset shapes).
- `ZodSchema` import: `import type { ZodSchema } from "zod/v4"` per the package's Zod v4 convention.
- These are types-only — no runtime impact. The first runtime artifact is `SOURCE_CATALOG` in US-108.
