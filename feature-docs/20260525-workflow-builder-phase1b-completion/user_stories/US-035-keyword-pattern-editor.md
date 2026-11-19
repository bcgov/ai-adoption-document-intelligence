# US-035: `KeywordPatternEditor` — pattern (regex-validated) + segmentType rows

**As a** workflow author writing the pattern list for
`document.splitAndClassify`,
**I want** a row editor for `{ pattern, segmentType }`,
**So that** I can author the page-classifying regex rules without
writing JSON.

## Acceptance Criteria

- [x] **Scenario 1**: Renders one row per pattern
    - **Given** `value: [{ pattern: "(?i)pay\\s*stub", segmentType: "pay-stub" }]`
    - **When** the editor mounts
    - **Then** one row renders with the pattern + segmentType filled in

- [x] **Scenario 2**: Invalid regex surfaces an inline error per row
    - **Given** the user types `(unclosed` into a `pattern` input
    - **When** the input loses focus
    - **Then** `new RegExp(pattern)` is attempted in a try/catch
    - **And** if it throws, the row shows an inline error with the JS error message; `onChange` still propagates the (invalid) value

- [x] **Scenario 3**: `segmentType` is a free-form string
    - **Given** a row with `segmentType: ""`
    - **When** rendered
    - **Then** a plain `TextInput` is shown with `withAsterisk` per the schema (segmentType is required)

- [x] **Scenario 4**: Add / remove rows
    - **Given** an editor with one row
    - **When** "Add pattern" is clicked
    - **Then** a new row is appended with `pattern: ""`, `segmentType: ""`
    - **And** the trash icon on the last remaining row is disabled (Zod `min(1)`)

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/KeywordPatternEditor.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/KeywordPatternEditor.test.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/index.ts` — re-export.
