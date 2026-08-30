# US-100: Library picker + child-workflow signature summaries surface `kind`

**As a** workflow author picking or inspecting a library reference,
**I want** the library's typed signature visible in both the picker preview and the `childWorkflow` node settings,
**So that** I can pick the right library by signature, not by name guessing.

## Acceptance Criteria

- [x] **Scenario 1**: `LibraryPickerModal` signature summary surfaces `kind` per port
    - **Given** `LibraryPickerModal` open and a library workflow with declared `inputs: [{ label: "Doc", path: "ctx.docUrl", type: "string", kind: "Document" }]` and `outputs: [{ label: "Classification", path: "...", type: "object", kind: "Classification" }]`
    - **When** the user clicks/hovers the library row to see its signature preview
    - **Then** each input/output row shows `<label> (<type>, <kind literal>)` — e.g. `"Doc (string, Document)"`, `"Classification (object, Classification)"`
    - **And** rows where `kind` is undefined render as `<label> (<type>)` (no parenthesised kind segment — clean fallback)

- [x] **Scenario 2**: `ChildWorkflowNodeSettings` signature summary surfaces `kind` next to each port
    - **Given** a `childWorkflow` node whose `workflowRef.library` references a library with the same typed ports from Scenario 1
    - **When** the settings panel renders
    - **Then** the signature summary shows each input + output row labelled `"<label>: <kind>"` (or `"<label>"` when no kind)
    - **And** the existing v{N}/head badge from Track 3 still renders adjacent to the library name (kind annotations coexist with the version badge)
    - **And** colour styling on each row matches the kind palette (Document → blue dot, etc.) — small dot prefix for accessibility

- [x] **Scenario 3**: Untyped library ports render without kind text
    - **Given** a library whose `metadata.inputs[].kind` is undefined on every port (legacy or user opted out via "—")
    - **When** either summary surface renders
    - **Then** no kind text or coloured dot appears on those rows
    - **And** the existing Phase 2 Track 1 summary rendering is regression-safe (Track 1 + Track 3 tests stay green)

- [x] **Scenario 4**: The picker can be FILTERED to libraries whose signature matches an upstream producer (forward-looking)
    - **Given** a `childWorkflow` node whose upstream producer writes `kind: "Document"` to the ctx key that the library's first input reads
    - **When** the user opens `LibraryPickerModal`
    - **Then** libraries whose first input's `kind` is assignable from "Document" (Document family) appear in a "Compatible" group at the top
    - **And** other libraries appear below a `"Other libraries"` divider, dimmed at ~50% opacity
    - **And** clicking an "Other" library still works (no hard rejection, mirrors picker UX from US-097)
    - **And** legacy libraries with no typed signatures render in the "Other libraries" group (treated as Artifact, but the surface is honest: their compat is unverifiable)

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/library/LibraryPickerModal.tsx` — extend the signature preview + add the compat-filtering group/dividers
- `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx` — extend the signature summary with kind text + coloured dot
- `apps/frontend/src/features/workflow-builder/library/LibraryPickerModal.test.tsx` — covers scenarios 1 + 4
- `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.test.tsx` — covers scenarios 2 + 3

## Technical notes

- Coloured-dot prefix uses `ARTIFACT_REGISTRY[kind].color`. Reuse the same handle-colour helper from US-095 where possible — or extract a tiny `<KindDot kind={...} />` component.
- Scenario 4's compat-filtering is the LIBRARY analog of US-097's variable-picker dim+sort behaviour. Same UX vocabulary — divider label is `"Other libraries"` rather than `"Incompatible with this port"`, since libraries aren't strictly incompatible (a parent can bind their unused outputs).
- Picker filtering uses `isAssignable` from `@ai-di/graph-workflow` (US-091). Library is "compatible" if EVERY required input's kind is assignable from the upstream producer's kind (i.e. all required inputs can be satisfied). Optional inputs don't gate compat.
- Track 3's `v{N}` / `head` badge is unchanged — it sits alongside, not inside, the signature summary.
