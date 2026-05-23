# US-033: `ConfusionMapEditor` — row-based view of `Record<string, string>`

**As a** workflow author writing a custom OCR character-confusion map,
**I want** a `{ from, to }` row editor that I can stably edit,
**So that** I can add / edit / remove confusion-pair entries without
fighting object-key collisions.

## Acceptance Criteria

- [ ] **Scenario 1**: Object → rows on mount
    - **Given** `value: { "0": "O", "l": "1" }`
    - **When** `ConfusionMapEditor` mounts
    - **Then** two rows render: `{ from: "0", to: "O" }` and `{ from: "l", to: "1" }`
    - **And** the rendered row order is deterministic (object insertion order or alphabetical — pick deterministically and document)

- [ ] **Scenario 2**: Rows → object on change
    - **Given** rows `[{ from: "0", to: "O" }, { from: "l", to: "1" }]`
    - **When** the user edits row 1's `to` value
    - **Then** `onChange` fires with the updated `Record<string, string>` (an object, not the row array)

- [ ] **Scenario 3**: Duplicate `from` keys surface a per-row warning
    - **Given** rows `[{ from: "0", to: "O" }, { from: "0", to: "Q" }]`
    - **When** rendered
    - **Then** row 2's `from` input shows an inline warning ("Duplicate key — only the last value will be saved")
    - **And** `onChange` still fires (validation is surface-only)

- [ ] **Scenario 4**: Empty `from` rows are skipped on `onChange`
    - **Given** a row with `from: ""` and `to: "X"`
    - **When** rendered + value is read for `onChange`
    - **Then** that row is NOT included in the serialised object (empty keys are dropped)

- [ ] **Scenario 5**: Add / remove rows
    - **Given** an editor with one row
    - **When** "Add pair" is clicked
    - **Then** a new row is appended with `from: ""`, `to: ""`
    - **And** clicking the trash on a row removes it and propagates the rebuilt object

## Priority
- [x] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ConfusionMapEditor.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ConfusionMapEditor.test.tsx` — NEW.
- `apps/frontend/src/features/workflow-builder/settings/rich-widgets/index.ts` — re-export.
