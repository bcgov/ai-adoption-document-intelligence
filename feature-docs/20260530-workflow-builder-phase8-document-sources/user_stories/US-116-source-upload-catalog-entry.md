# US-116: `source-upload.ts` — `source.upload` catalog entry

**As a** workflow author who wants users to upload a file interactively,
**I want** a registered `source.upload` catalog entry with sensible defaults,
**So that** dropping a source.upload node onto the canvas surfaces a configuration form for MIME / size / ctx-key and produces a typed Document output downstream.

## Acceptance Criteria

- [x] **Scenario 1**: Entry registered in `SOURCE_CATALOG`
    - **Given** `packages/graph-workflow/src/catalog/sources/source-upload.ts` (new) and `source-catalog.ts` (US-108)
    - **When** the package is built
    - **Then** `SOURCE_CATALOG` includes a second entry with `type: "source.upload"`, `category: "source"`, `displayName: "File upload"`, `runtime: "manual"`, `outputKind: "Document"`
    - **And** `iconHint: "file-upload"` and `colorHint: "blue"` per DOCUMENT_SOURCES_DESIGN.md §7.1
    - **And** `getSourceCatalogEntry("source.upload")` returns this entry

- [x] **Scenario 2**: `parametersSchema` shape + defaults
    - **Given** the same file
    - **When** read
    - **Then** the entry's `parametersSchema` is a `z.object({ allowedMimeTypes: z.array(z.string()).optional(), maxFileSizeMB: z.number().int().positive().optional(), ctxKey: z.string().optional() })` Zod v4 schema
    - **And** `.meta({ "x-default": [...] })` annotates defaults: `allowedMimeTypes` default `["application/pdf", "image/*"]`, `maxFileSizeMB` default `50`, `ctxKey` default `"documentUrl"`
    - **And** each field has a `title` + `description` for the JsonSchemaForm rendering

- [x] **Scenario 3**: `deriveOutputSchema(parameters)` returns ctxKey-keyed fixed shape
    - **Given** `parameters: { ctxKey: "myFile" }`
    - **When** `deriveOutputSchema(parameters)` is called
    - **Then** it returns `{ type: "object", properties: { myFile: { type: "string", format: "uri" } }, required: ["myFile"] }`
    - **And** when `ctxKey` is absent in `parameters`, the function reads the default `"documentUrl"` from the schema and returns the `documentUrl`-keyed shape

- [x] **Scenario 4**: `outputKind === "Document"` (typed handle)
    - **Given** the same entry
    - **When** the canvas renderer (US-117) consumes `outputKind`
    - **Then** the source.upload node's output handle gets the Document colour (blue) from the Phase 3 registry palette
    - **And** Phase 3's binding-walk validator (US-110) treats the configured `ctxKey` as a producer of `kind: "Document"`

- [x] **Scenario 5**: Per-entry unit test
    - **Given** `packages/graph-workflow/src/catalog/sources/source-upload.test.ts` (new)
    - **When** the test runs
    - **Then** Scenario 1's registration is asserted
    - **And** Scenario 2's defaults are surfaced when `parameters` is empty (via the Zod schema's `.parse({})` filling in `.default(...)` values)
    - **And** Scenario 3's `deriveOutputSchema` round-trips for 2 representative `parameters` shapes (empty / custom ctxKey)
    - **And** the bulk source-catalog invariant test (introduced in US-115) still passes

## Priority
- [x] High (Must Have)

## Files modified / created

- `packages/graph-workflow/src/catalog/sources/source-upload.ts` — new
- `packages/graph-workflow/src/catalog/sources/source-upload.test.ts` — new
- `packages/graph-workflow/src/catalog/source-catalog.ts` — register the entry in `SOURCE_CATALOG`

## Technical notes

- The `allowedMimeTypes` array supports glob entries (`"image/*"`) per the design. Whether the endpoint (US-114) enforces glob matching is its concern; the catalog entry just stores the strings.
- Use Zod v4's `.default(...)` on each optional field so `parametersSchema.parse({})` fills in the documented defaults — this is how `deriveOutputSchema` and the Run-drawer Dropzone (US-123) read the effective values.
- The Document output kind is the SHARED Phase 3 kind — don't introduce a new kind. The default `documentUrl` ctx key matches the existing OCR pipeline's convention but is not load-bearing (the user can rename it).
- After this story merges, both 8.0 source catalog entries exist. The validator's "unknown sourceType" path stops triggering for legitimate workflows. **Ask Alex to restart Vite** after merging.
