# US-098: `WorkflowSettingsDrawer` ctx-row "Kind" Select column

**As a** workflow author declaring entry-point inputs (or named intermediate variables),
**I want** to annotate each ctx variable with an `ArtifactKind`,
**So that** the first hop into the typed graph (`isInput: true` variables) isn't gray-on-gray and downstream typed handles get something meaningful to filter against.

## Acceptance Criteria

- [ ] **Scenario 1**: New "Kind" column renders between Description and Default
    - **Given** the workflow settings drawer is open with one or more ctx variables declared
    - **When** the drawer renders
    - **Then** each ctx row shows columns in the order: Key, Type, Description, **Kind**, Default, (existing trailing actions)
    - **And** the Kind column header reads `"Kind"`
    - **And** the column width fits the longest registry display name without horizontal scroll

- [ ] **Scenario 2**: Kind Select options come from the artifact registry + a blank wildcard
    - **Given** a ctx row's Kind Select is opened
    - **When** the options render
    - **Then** the first option is `"—"` (em dash) with a description "No kind / Artifact wildcard"
    - **And** the remaining options are every entry in `ARTIFACT_REGISTRY` rendered as `<display name> (<kind literal>)` (e.g. "Multi-page document (MultiPageDocument)", "Segment (Table) (Segment<Table>)")
    - **And** each option is grouped by base-kind family (Document family, Segment family, OCR family, Classification/Validation, Reference) for findability — use Mantine `<Select>` groups

- [ ] **Scenario 3**: Picking "Document" persists `kind: "Document"` on save/load round-trip
    - **Given** a row whose Kind is set to "Document"
    - **When** the workflow is saved + reloaded
    - **Then** the persisted JSON shows `metadata.ctx.<key>.kind === "Document"`
    - **And** the drawer re-renders the row with "Document" still selected

- [ ] **Scenario 4**: Picking "—" persists no `kind` field at all
    - **Given** a row whose Kind is set to "—"
    - **When** saved + reloaded
    - **Then** the persisted JSON has no `kind` key on `metadata.ctx.<key>` (the field is omitted entirely, not stored as `null` or `""`)
    - **And** the drawer re-renders the row with "—" selected
    - **And** legacy variables that pre-date Phase 3 (no `kind` field) also render "—" by default

- [ ] **Scenario 5**: Array-kind options render correctly
    - **Given** the Kind Select is opened
    - **When** the options render
    - **Then** array variants (`"Document[]"`, `"Segment[]"`, etc.) appear as their own options below the base entries, labelled `"<display name> (array)"` (e.g. "Multi-page document (array) (MultiPageDocument[])")
    - **And** picking an array option persists the array kind string literally (`"Document[]"`)

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/settings/WorkflowSettingsDrawer.tsx` — add the new column
- `apps/frontend/src/features/workflow-builder/settings/kind-select-options.ts` — pure helper: `buildKindSelectOptions(registry): SelectGroup[]` returning the grouped + array-expanded Select shape
- `apps/frontend/src/features/workflow-builder/settings/WorkflowSettingsDrawer.test.tsx` — covers scenarios 1-5

## Technical notes

- Reuse `ARTIFACT_REGISTRY` from `@ai-di/graph-workflow` (US-090). Don't duplicate the kind list in the frontend.
- Array-expansion happens at render time — the registry has one entry per base kind; the Select doubles each into "T" + "T[]" pairs.
- The "Kind" column placement (after Description, before Default) was locked in REQUIREMENTS.md §3.2 D13.
- Saving "—" must omit the field, not write `kind: null` — the validator's `kind?: KindRef` is optional, not nullable. The save serializer should strip `undefined`/empty keys.
