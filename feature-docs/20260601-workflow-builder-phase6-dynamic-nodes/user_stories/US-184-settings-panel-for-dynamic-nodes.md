# US-184: `NodeSettingsPanel` dispatch + `DynamicNodeSettings` body for `dyn.*` nodes

**As a** workflow author tweaking a dynamic-node instance,
**I want** the right-rail settings panel to render the dynamic-node-specific affordances (DYN pill + slug + description + version pin + Edit script + JsonSchemaForm + deleted-Alert),
**So that** I pin a specific version, open the in-situ editor, edit parameters, and see the signature inline — all from the canvas without page navigation.

## Acceptance Criteria

- [x] **Scenario 1**: Settings panel dispatches to `DynamicNodeSettings` for `dyn.*` nodes
    - **Given** `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx`
    - **When** a `dyn.*` node is selected
    - **Then** the panel renders `<DynamicNodeSettings node={selectedNode} />` body (new in this story)
    - **And** non-`dyn.*` nodes go through the existing per-type dispatch unchanged

- [x] **Scenario 2**: Header — slug + description + DYN pill
    - **Given** `DynamicNodeSettings` rendering for a `dyn.my-node` selection
    - **When** the panel renders
    - **Then** the header shows the slug, the description from the catalog entry's signature, and the grape DYN pill
    - **And** if the catalog entry is missing (deleted lineage), the header instead shows the slug + a red "Deleted dynamic node" Alert with copy "Restore from the management page to use this node, or delete the node from this workflow." Try is disabled.

- [x] **Scenario 3**: Version-pin UI (mirrors Phase 2 Track 3 library pattern)
    - **Given** the node has `dynamicNodeVersion: 3`
    - **When** the panel renders
    - **Then** it shows a blue `<Badge>v3</Badge>` next to a "Change version" `<Button variant="subtle">` (matches Phase 2 Track 3's library version pin)
    - **And** if `dynamicNodeVersion` is undefined, the badge shows a gray "head" instead
    - **And** clicking "Change version" opens a small Mantine `<Select>` of available versions (sourced from `useDynamicNode(slug).versions`) + on selection updates the workflow config

- [x] **Scenario 4**: "Edit script" button opens the in-situ modal
    - **Given** the panel
    - **When** rendered (non-deleted lineage)
    - **Then** an "Edit script" button is visible next to the version pin
    - **And** clicking it opens the same `<DynamicNodeEditor layout="modal">` from US-183 — they're the same affordance, two entry points

- [x] **Scenario 5**: Parameters body uses `JsonSchemaForm` against `signature.paramsSchema`
    - **Given** the selected version's signature
    - **When** the panel renders the parameters body
    - **Then** `<JsonSchemaForm schema={signature.paramsSchema} value={node.parameters} onChange={...} />` renders — same as static activities
    - **And** changing a parameter updates the workflow config + invalidates Phase 4 cache for this node naturally (via the existing configHash chain)

- [x] **Scenario 6**: Tests cover dispatch + version pin + Edit script + parameters + deleted state
    - **Given** `DynamicNodeSettings.spec.tsx`
    - **When** the suite runs
    - **Then** tests pass for: panel dispatches correctly on `dyn.*`; version badge tracks `dynamicNodeVersion`; Change version updates the node config; Edit script opens the modal; JsonSchemaForm round-trips parameter changes; deleted state shows the Alert + disables Try

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx` — extend dispatch
- `apps/frontend/src/features/workflow-builder/settings/dynamic-node/DynamicNodeSettings.tsx` — new file (body component)
- `apps/frontend/src/features/workflow-builder/settings/dynamic-node/DynamicNodeSettings.spec.tsx` — new test
- `apps/frontend/src/features/workflow-builder/settings/dynamic-node/VersionPinSelect.tsx` — small Select wrapper (or inline if simple)

## Technical notes

- Reuse Phase 2 Track 3's library-version-pin UI patterns from `ChildWorkflowNodeSettings`. The shapes are intentionally similar.
- Parameter changes go through the existing workflow-config-update path (same as static activities). No new save flow.
- The "Edit script" button does the same thing as the right-click menu entry from US-183 — keep them in sync (extract a helper if needed).
- This story closes Milestone F. After landing US-180 → US-184, the frontend is feature-complete; Milestone G runs the end-to-end Playwright walkthrough.
- After landing: no Vite restart (frontend-only).
