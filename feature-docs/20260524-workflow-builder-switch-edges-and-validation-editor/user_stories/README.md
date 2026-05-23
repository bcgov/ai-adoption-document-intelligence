NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user stories files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

## Milestone A — Switch case-routed edges (US-021 to US-026) — HIGH priority

| File | Title |
|---|---|
| [US-021-edge-label-helper.md](./US-021-edge-label-helper.md) | `edge-labels` helper renders `ConditionExpression` as compact one-line text |
| [US-022-edge-picker-type-filter.md](./US-022-edge-picker-type-filter.md) | `EdgePicker` accepts an optional `edgeTypes` filter |
| [US-023-workflow-edge-component.md](./US-023-workflow-edge-component.md) | Custom `WorkflowEdge` xyflow component with type-based styling + labels |
| [US-024-error-source-handle.md](./US-024-error-source-handle.md) | Error source handle on nodes whose `errorPolicy.onError === "fallback"` |
| [US-025-handle-connect-edge-type.md](./US-025-handle-connect-edge-type.md) | `handleConnect` stamps `conditional` / `error` / `normal` per source |
| [US-026-switch-settings-conditional-only.md](./US-026-switch-settings-conditional-only.md) | `SwitchNodeSettings` per-case and default pickers filter to `conditional` edges |

## Milestone B — `validateFields.rules` rich editor (US-027 to US-030) — HIGH priority

| File | Title |
|---|---|
| [US-027-validation-rule-editor-shell.md](./US-027-validation-rule-editor-shell.md) | `ValidationRuleEditor` list shell — add/remove/variant-switch |
| [US-028-validation-rule-editor-field-and-array.md](./US-028-validation-rule-editor-field-and-array.md) | `field-match` + `array-match` variant bodies |
| [US-029-validation-rule-editor-arithmetic.md](./US-029-validation-rule-editor-arithmetic.md) | `arithmetic` variant body with nested expression |
| [US-030-json-schema-form-routes-validation-rule-editor.md](./US-030-json-schema-form-routes-validation-rule-editor.md) | `JsonSchemaForm` routes `x-widget: "validation-rule-editor"` to the new component |

## Suggested Implementation Order (by dependency chain)

### Phase A1 — foundations (no UI deps)
- [x] **US-021** (edge-labels helper — pure function, TDD-first)
- [x] **US-022** (EdgePicker `edgeTypes` filter prop)

### Phase A2 — canvas wiring
- [x] **US-023** (WorkflowEdge component, depends on US-021)
- [x] **US-024** (Error source handle on fallback-policy nodes)
- [x] **US-025** (handleConnect edge-type stamping — depends on US-024 for the error-handle id)

### Phase A3 — settings panel wiring (commit Milestone A here)
- [x] **US-026** (SwitchNodeSettings uses `edgeTypes={["conditional"]}` — depends on US-022)

### Phase B1 — validateFields rich editor
- [x] **US-027** (ValidationRuleEditor list shell)
- [x] **US-028** (field-match + array-match variant bodies — depends on US-027)
- [x] **US-029** (arithmetic variant body with nested expression — depends on US-027)

### Phase B2 — wire into the renderer (commit Milestone B here)
- [x] **US-030** (JsonSchemaForm routes `x-widget: "validation-rule-editor"` — depends on US-027/028/029)

> Stories are ordered by dependency chain for automated implementation.
> Each story should be implementable after all stories in previous phases are complete.
> Do not start a phase until all stories in prior phases are checked off.
