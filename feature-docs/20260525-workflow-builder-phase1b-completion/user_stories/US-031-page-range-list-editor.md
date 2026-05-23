# US-031: `PageRangeListEditor` widget — row editor + per-row validation

**As a** workflow author authoring a `document.split` node with
`strategy: "custom-ranges"`,
**I want** a row-based editor for `{ start, end }` page ranges,
**So that** I can build custom segmentations without writing JSON.

## Acceptance Criteria

- [ ] **Scenario 1**: Renders one row per existing range
    - **Given** `value: [{ start: 1, end: 4 }, { start: 5, end: 10 }]`
    - **When** `PageRangeListEditor` mounts
    - **Then** two rows render, each with two `NumberInput`s pre-filled with the range bounds

- [ ] **Scenario 2**: Add / remove row controls
    - **Given** an editor with one row
    - **When** "Add range" is clicked
    - **Then** `onChange` fires with `[..., { start: 1, end: 1 }]` (or schema-default seed)
    - **And** clicking the trash on the last remaining row is disabled (Zod requires `min(1)` on `customRanges`)

- [ ] **Scenario 3**: `start <= end` per-row validation
    - **Given** a row with `start: 5`
    - **When** the user types `end: 3`
    - **Then** an inline error "End must be greater than or equal to start" is shown on that row
    - **And** the value is still propagated through `onChange` (validation is surface-only; Zod will reject on save)

- [ ] **Scenario 4**: `start` and `end` are 1-based positive integers
    - **Given** the catalog schema requires `start >= 1, end >= 1`
    - **When** the user types `0` into `start`
    - **Then** Mantine's `NumberInput min={1}` prevents the value from being committed below 1

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/PageRangeListEditor.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/PageRangeListEditor.test.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/index.ts` — re-export.
