# US-115: `source-api.ts` — `source.api` catalog entry

**As a** workflow author,
**I want** a registered `source.api` catalog entry exposing the push-pattern configuration shape,
**So that** dropping a source.api node onto the canvas surfaces the right settings form and the runtime knows how to derive its input schema from user-authored fields.

## Acceptance Criteria

- [x] **Scenario 1**: Entry registered in `SOURCE_CATALOG`
    - **Given** `packages/graph-workflow/src/catalog/sources/source-api.ts` (new) and `source-catalog.ts` (US-108)
    - **When** the package is built
    - **Then** `SOURCE_CATALOG` includes one entry with `type: "source.api"`, `category: "source"`, `displayName: "API endpoint"`, `runtime: "push"`, `outputKind: "Artifact"`
    - **And** `iconHint: "cloud-upload"` and `colorHint: "indigo"` per DOCUMENT_SOURCES_DESIGN.md §7.1
    - **And** `getSourceCatalogEntry("source.api")` returns this entry

- [x] **Scenario 2**: `parametersSchema` includes `fields[]` of `FieldDescriptor` shape
    - **Given** the same file
    - **When** read
    - **Then** the entry's `parametersSchema` is a `z.object({ fields: z.array(...).meta({ "x-widget": "field-list-editor", title: "Fields", description: "..." }), authNotes: z.string().optional() })` Zod v4 schema
    - **And** each `fields[]` element validates a `FieldDescriptor`: `{ name: string (URL-safe identifier), type: enum, kind?: enum from registry, required: boolean, description?: string, defaultValue?: unknown }`
    - **And** `authNotes` is optional (overrides the default auth-notes string in the Run drawer)

- [x] **Scenario 3**: `deriveOutputSchema(parameters)` walks `fields[]`
    - **Given** `parameters: { fields: [{ name: "documentUrl", type: "string", required: true }, { name: "priority", type: "number", required: false, defaultValue: 1 }] }`
    - **When** `deriveOutputSchema(parameters)` is called
    - **Then** it returns `{ type: "object", properties: { documentUrl: { type: "string" }, priority: { type: "number", default: 1 } }, required: ["documentUrl"] }`
    - **And** when `fields[]` is empty or absent, returns `{ type: "object", properties: {}, required: [] }`
    - **And** per-field `description` / `defaultValue` round-trip into the JSON Schema

- [x] **Scenario 4**: Per-entry unit test
    - **Given** `packages/graph-workflow/src/catalog/sources/source-api.test.ts` (new)
    - **When** the test runs
    - **Then** Scenario 1's registration is asserted (lookup via `getSourceCatalogEntry`)
    - **And** Scenario 2's `parametersSchema` accepts the documented happy-path shape and rejects (a) duplicate field names within `fields[]` (b) non-URL-safe `name` values
    - **And** Scenario 3's `deriveOutputSchema` round-trips for 3 representative `parameters` shapes (empty fields, single required field, multi-field with mixed required/optional/defaultValue)

- [x] **Scenario 5**: Catalog invariant test passes
    - **Given** the bulk source-catalog invariant test in `packages/graph-workflow/src/catalog/source-catalog.test.ts`
    - **When** the test runs after this story
    - **Then** the test asserts every `SOURCE_CATALOG` entry has: non-empty `type`/`displayName`/`description`, valid `runtime` enum value, valid `outputKind` resolving via the Phase 3 registry, callable `deriveOutputSchema` (smoke test with `{}` parameters)

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/sources/source-api.ts` — new
- `packages/graph-workflow/src/catalog/sources/source-api.test.ts` — new
- `packages/graph-workflow/src/catalog/source-catalog.ts` — register the entry in `SOURCE_CATALOG`
- `packages/graph-workflow/src/catalog/source-catalog.test.ts` — extend with the bulk invariant check (or add a new bulk test file alongside, matching activity catalog's pattern)

## Technical notes

- Zod v4 + `.meta({ "x-widget": "field-list-editor" })` matches the existing pattern used by other rich widgets (`validation-rule-editor`, `keyword-pattern-editor`, etc.) — see `packages/graph-workflow/src/catalog/activities/document-classify.ts` for the convention.
- Field `name` URL-safety: regex `/^[a-zA-Z_][a-zA-Z0-9_]*$/` — identifier shape. Reject reserved words? Out of scope; keep it permissive.
- The `kind?` field in `FieldDescriptor` accepts any `KindRef` (Phase 3 union). The Zod schema enumerates via `z.enum([...listAllKindRefs()])` or accepts `z.string()` with a refine — pick whichever the FieldListEditor x-widget (US-120) consumes most naturally.
- This story is the FIRST entry to land in `SOURCE_CATALOG`. After merging, the validator's "unknown sourceType" path (US-109 Scenario 2) starts accepting `source.api` nodes.
- After this story merges, **ask Alex to restart Vite** — the new catalog entry IS a runtime export.
