# US-087: `ChildWorkflowNodeSettings` signature summary shows pinned version badge + "Change version" button

**As a** workflow author looking at a `childWorkflow` node's settings,
**I want** to see whether the library reference is pinned to a
specific version or floating on head, and to change it,
**So that** I can audit and update pinning without re-walking the
entire library picker flow.

## Acceptance Criteria

- [ ] **Scenario 1**: Pinned-to-head badge
    - **Given** a selected `childWorkflow` node with `workflowRef: { type: "library", workflowId: "lib-1" }` (no `version`)
    - **When** the right-rail settings panel renders
    - **Then** the signature summary shows the library name + slug + a `<Badge color="gray">head</Badge>` next to it

- [ ] **Scenario 2**: Pinned-to-version badge
    - **Given** the node has `workflowRef: { type: "library", workflowId: "lib-1", version: 3 }`
    - **When** the panel renders
    - **Then** the summary shows a `<Badge color="blue">v3</Badge>` next to the library name

- [ ] **Scenario 3**: "Change version" button re-opens the picker pre-seeded
    - **Given** a pinned childWorkflow node
    - **When** the user clicks the "Change version" button next to the badge
    - **Then** the `LibraryPickerModal` opens with the currently selected library row pre-highlighted and the Version Select pre-set to the currently pinned version (or "head" if unpinned)
    - **And** confirming with a new version updates `workflowRef.library.version` on the in-flight config

- [ ] **Scenario 4**: Vitest coverage
    - **Given** the updated settings panel
    - **When** `npm test` runs
    - **Then** tests cover: head badge vs v{n} badge rendering, change-version button opens the modal with the correct pre-seed

## Priority
- [ ] High (Must Have)

## Files modified

- `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx` — render the badge + add the "Change version" button + thread pre-seed props into the modal
- `apps/frontend/src/features/workflow-builder/library/LibraryPickerModal.tsx` — accept `initialWorkflowId?: string` + `initialVersion?: number | "head"` props for the pre-seed flow (idempotent: existing call sites don't pass them and continue to default to empty selection)
- `apps/frontend/src/features/workflow-builder/settings/control-flow/__tests__/ChildWorkflowNodeSettings.test.tsx` — scenarios 1–3

## Notes

- The badge colour choice (`gray` for head, `blue` for pinned) is a small UX tell that "head" is the floating reference and `v{n}` is a deliberate freeze. Mantine theme colours; pick a different pair if the existing palette already uses these for something semantically conflicting.
