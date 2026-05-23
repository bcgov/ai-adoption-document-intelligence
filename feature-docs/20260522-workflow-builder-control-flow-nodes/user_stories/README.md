NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user stories files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

## Foundation — Reusable Graph-Aware Primitives (US-001 to US-003) -- HIGH priority

| File | Title |
|---|---|
| [US-001-node-picker-primitive.md](./US-001-node-picker-primitive.md) | NodePicker primitive |
| [US-002-edge-picker-primitive.md](./US-002-edge-picker-primitive.md) | EdgePicker primitive |
| [US-003-condition-expression-editor.md](./US-003-condition-expression-editor.md) | ConditionExpressionEditor primitive (recursive) |

## Per-Type Settings Forms (US-004 to US-009) -- HIGH priority

| File | Title |
|---|---|
| [US-004-switch-node-settings.md](./US-004-switch-node-settings.md) | SwitchNodeSettings form |
| [US-005-map-node-settings.md](./US-005-map-node-settings.md) | MapNodeSettings form |
| [US-006-join-node-settings.md](./US-006-join-node-settings.md) | JoinNodeSettings form |
| [US-007-child-workflow-node-settings.md](./US-007-child-workflow-node-settings.md) | ChildWorkflowNodeSettings form |
| [US-008-poll-until-node-settings.md](./US-008-poll-until-node-settings.md) | PollUntilNodeSettings form |
| [US-009-human-gate-node-settings.md](./US-009-human-gate-node-settings.md) | HumanGateNodeSettings form |

## Canvas + Palette Support (US-011 to US-012) -- HIGH priority

| File | Title |
|---|---|
| [US-011-palette-flow-control-section.md](./US-011-palette-flow-control-section.md) | Palette "Flow Control" section + skeleton-add handlers |
| [US-012-canvas-per-type-shapes.md](./US-012-canvas-per-type-shapes.md) | Canvas renders distinct shapes for control-flow nodes |

## Wiring (US-010) -- HIGH priority

| File | Title |
|---|---|
| [US-010-node-settings-panel-wiring.md](./US-010-node-settings-panel-wiring.md) | Wire per-type forms into NodeSettingsPanel |

## Verification (US-013) -- MEDIUM priority

| File | Title |
|---|---|
| [US-013-validation-surfacing-verification.md](./US-013-validation-surfacing-verification.md) | Verify validation surfacing for control-flow nodes |

## Suggested Implementation Order (by dependency chain)

### Phase 1 — Reusable primitives
- [x] **US-001** (NodePicker primitive) — required by US-005, US-006
- [x] **US-002** (EdgePicker primitive) — required by US-004, US-009
- [x] **US-003** (ConditionExpressionEditor primitive) — required by US-004, US-008

### Phase 2 — Per-type forms, canvas, palette (parallelizable after Phase 1)
- [x] **US-004** (SwitchNodeSettings) — consumes US-002, US-003
- [x] **US-005** (MapNodeSettings) — consumes US-001
- [x] **US-006** (JoinNodeSettings) — consumes US-001
- [x] **US-007** (ChildWorkflowNodeSettings) — no primitive deps
- [x] **US-008** (PollUntilNodeSettings) — consumes US-003
- [x] **US-009** (HumanGateNodeSettings) — consumes US-002
- [x] **US-011** (Palette "Flow Control" section) — independent of Phase 2 forms; required for end-to-end add
- [ ] **US-012** (Canvas per-type shapes) — independent of Phase 2 forms; required for visual differentiation

### Phase 3 — Wiring
- [ ] **US-010** (NodeSettingsPanel wiring) — depends on all of US-004 through US-009

### Phase 4 — Verification
- [ ] **US-013** (Validation surfacing verification) — depends on US-010, US-011, US-012

> Stories are ordered by dependency chain for automated implementation.
> Each story should be implementable after all stories in previous phases are complete.
> Do not start a phase until all stories in prior phases are checked off.
