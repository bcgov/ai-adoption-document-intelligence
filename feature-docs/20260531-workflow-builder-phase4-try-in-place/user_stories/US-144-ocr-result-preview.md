# US-144: `OcrResultPreview` widget

**As a** user iterating on an OCR workflow with `azureOcr.extract` / `mistralOcr.process` / `ocr.normalizeFields` nodes,
**I want** the preview pane below an `OcrResult` / `OcrFields`-producing node to show a structured key-value table of the extracted fields,
**So that** I can verify the OCR extraction looks right without opening Temporal UI.

## Acceptance Criteria

- [x] **Scenario 1**: Component signature + base render
    - **Given** `apps/frontend/src/features/workflow-builder/preview/OcrResultPreview.tsx` (new file)
    - **When** read
    - **Then** it exports `function OcrResultPreview({ value }: { value: unknown })`
    - **And** when `value` is an object (typically `{ pages: [{ fields: { ... } }] }` OR a flat `{ field1: val1, ... }`), it renders the K/V table
    - **And** when `value` is `null` / undefined / non-object, it renders "No OCR data"

- [x] **Scenario 2**: Top-level keys render as table rows
    - **Given** an `OcrFields` value `{ invoiceNumber: "INV-001", date: "2026-05-24", total: 142.50, vendor: { name: "Acme", id: "v-7" } }`
    - **When** rendered
    - **Then** a Mantine `<Table verticalSpacing="xs" striped>` shows 4 rows: invoiceNumber / "INV-001", date / "2026-05-24", total / "142.50", vendor / "{...}"
    - **And** primitives (strings, numbers, booleans) render verbatim; nested objects show as `{...}` with a "View raw" link

- [x] **Scenario 3**: One-level nesting expands inline
    - **Given** a nested value like `vendor: { name: "Acme", id: "v-7" }`
    - **When** rendered
    - **Then** the row's value cell shows `name: Acme · id: v-7` as a compact inline summary (when the nested object has ≤ 4 keys and all values are primitives)
    - **And** if the nested object has > 4 keys OR contains another nested object, it collapses to `{...}` with the "View raw" link

- [x] **Scenario 4**: "View raw" modal
    - **Given** a value cell collapsed to `{...}`
    - **When** the "View raw" link is clicked
    - **Then** a Mantine `<Modal size="md">` opens with a `<JsonInput readOnly autosize maxRows={30}>` showing the full nested JSON
    - **And** the modal title reflects the parent key (e.g., "vendor — full content")

- [x] **Scenario 5**: Long string values truncate with a tooltip
    - **Given** a string value longer than 60 characters
    - **When** rendered
    - **Then** the value cell shows the first 60 chars + ellipsis
    - **And** a Mantine `<Tooltip multiline w={400}>` on hover shows the full value
    - **And** a small "Copy" button next to the truncated value copies the full string to clipboard

- [x] **Scenario 6**: Component test
    - **Given** `apps/frontend/src/features/workflow-builder/preview/OcrResultPreview.test.tsx`
    - **When** tests run
    - **Then** at least 5 cases pass: flat K/V renders rows verbatim, primitives format correctly (number, boolean), one-level nesting inlines, deep nesting collapses to {...}, long string truncates with tooltip

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/preview/OcrResultPreview.tsx` — implementation
- `apps/frontend/src/features/workflow-builder/preview/OcrResultPreview.test.tsx` — tests

## Technical notes

- This widget handles BOTH `OcrResult` (Phase 3 superkind) AND `OcrFields` (subkind for K/V extraction). The dispatch shell (US-141) routes both kinds here.
- For `OcrResult` containing nested `pages[].fields`, this widget renders the FIRST page's fields by default. A small page-selector chip lets the user switch pages if `pages.length > 1`.
- The "View raw" modal pattern is intentionally simple — `<JsonInput readOnly>` from Mantine — no syntax-highlighting library needed (Phase 4 doesn't justify the bundle cost).
- After landing: no Vite restart (frontend-only).
