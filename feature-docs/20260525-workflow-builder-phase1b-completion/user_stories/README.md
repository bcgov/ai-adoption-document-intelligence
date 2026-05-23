NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user stories files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

## Milestone C — `document.split.custom-ranges` page-range editor (US-031 to US-032)

| File | Title |
|---|---|
| [US-031-page-range-list-editor.md](./US-031-page-range-list-editor.md) | `PageRangeListEditor` widget — row editor + per-row validation |
| [US-032-page-range-editor-routing.md](./US-032-page-range-editor-routing.md) | `JsonSchemaForm` routes `x-widget: "page-range-list"` |

## Milestone D — confusion-map editor (US-033 to US-034)

| File | Title |
|---|---|
| [US-033-confusion-map-editor.md](./US-033-confusion-map-editor.md) | `ConfusionMapEditor` — row-based view of `Record<string, string>` |
| [US-034-confusion-map-editor-routing.md](./US-034-confusion-map-editor-routing.md) | `JsonSchemaForm` routes `x-widget: "confusion-map-editor"` |

## Milestone E — keyword-patterns editor (US-035 to US-036)

| File | Title |
|---|---|
| [US-035-keyword-pattern-editor.md](./US-035-keyword-pattern-editor.md) | `KeywordPatternEditor` — pattern (regex-validated) + segmentType rows |
| [US-036-keyword-pattern-editor-routing.md](./US-036-keyword-pattern-editor-routing.md) | `JsonSchemaForm` routes `x-widget: "keyword-pattern-editor"` |

## Milestone F — classification rules editor (US-037 to US-039)

| File | Title |
|---|---|
| [US-037-classification-rule-editor-shell.md](./US-037-classification-rule-editor-shell.md) | `ClassificationRuleEditor` list shell — add/remove rules |
| [US-038-classification-rule-pattern-rows.md](./US-038-classification-rule-pattern-rows.md) | Per-rule pattern rows (scope/operator/value) |
| [US-039-classification-rule-editor-routing.md](./US-039-classification-rule-editor-routing.md) | `JsonSchemaForm` routes `x-widget: "classification-rule-editor"` |

## Milestone G — switch condition-tree audit (US-040)

| File | Title |
|---|---|
| [US-040-switch-condition-tree-audit.md](./US-040-switch-condition-tree-audit.md) | Verify `SwitchNodeSettings` exposes the full recursive `ConditionExpressionEditor` |

## Milestone H — group editing in V2 (US-041 to US-044)

| File | Title |
|---|---|
| [US-041-group-from-selection.md](./US-041-group-from-selection.md) | "Group selected" top-bar action creates a `nodeGroups[<id>]` entry |
| [US-042-group-settings-panel.md](./US-042-group-settings-panel.md) | Right-rail group settings body (label / icon / color / exposedParams) |
| [US-043-simplified-view-toggle.md](./US-043-simplified-view-toggle.md) | Top-bar simplified-view switch collapses groups to chips |
| [US-044-exposed-params-editor.md](./US-044-exposed-params-editor.md) | `exposedParams[]` list editor inside the group panel |

## Milestone I — hover-to-extend chains (US-045)

| File | Title |
|---|---|
| [US-045-hover-to-extend.md](./US-045-hover-to-extend.md) | Hovering an outgoing handle pops a node picker; click adds + connects |

## Milestone J — node-type swap (US-046 to US-047)

| File | Title |
|---|---|
| [US-046-canvas-context-menu.md](./US-046-canvas-context-menu.md) | Right-click context menu on canvas nodes |
| [US-047-node-type-swap.md](./US-047-node-type-swap.md) | "Change activity type" action preserves overlapping config |

## Milestone K — Flow Control palette label review (US-048)

| File | Title |
|---|---|
| [US-048-flow-control-label-audit.md](./US-048-flow-control-label-audit.md) | Replace engineering jargon in Flow Control labels |

## Milestone L — auto-layout fallback (US-049 to US-050)

| File | Title |
|---|---|
| [US-049-auto-layout-helper.md](./US-049-auto-layout-helper.md) | `layoutGraph` helper + top-bar "Auto-arrange" button |
| [US-050-auto-layout-on-template-load.md](./US-050-auto-layout-on-template-load.md) | Apply auto-layout on template-load when positions are missing |

## Milestone M — polish bundle (US-051 to US-053)

| File | Title |
|---|---|
| [US-051-shared-duration-validation.md](./US-051-shared-duration-validation.md) | Lift duration regex into `packages/graph-workflow` + use in validator |
| [US-052-poll-until-parameter-validation.md](./US-052-poll-until-parameter-validation.md) | Shared validator runs `validateActivityParameters` on `pollUntil` nodes |
| [US-053-border-color-warning-audit.md](./US-053-border-color-warning-audit.md) | Chase the lingering `borderColor` console warning (pending Alex's text) |

## Suggested Implementation Order (by independence)

Phase 1B items are largely independent and can land in any order. The
suggested ordering below prioritises shared-package changes early (so a
single Vite restart covers them) and ends with the highest-leverage
visible UX features.

### Phase 1 — small, isolated wins
- [x] **US-048** (Flow Control label review — propose, get sign-off, apply)
- [x] **US-052** (pollUntil parameter validation in shared validator)
- [x] **US-051** (duration regex lift + validator wire-up)
- [ ] **US-053** (borderColor warning — pending Alex's console text)

### Phase 2 — four remaining rich widgets (all use JsonSchemaForm routing)
- [x] **US-031** (PageRangeListEditor)
- [x] **US-032** (route `page-range-list`)
- [x] **US-033** (ConfusionMapEditor)
- [x] **US-034** (route `confusion-map-editor`)
- [x] **US-035** (KeywordPatternEditor)
- [x] **US-036** (route `keyword-pattern-editor`)
- [x] **US-037** (ClassificationRuleEditor shell)
- [x] **US-038** (per-rule pattern rows)
- [x] **US-039** (route `classification-rule-editor`)

### Phase 3 — switch condition tree audit
- [x] **US-040** (audit + close)

### Phase 4 — auto-layout
- [x] **US-049** (helper + button)
- [x] **US-050** (auto-apply on template load)

### Phase 5 — canvas interactions
- [x] **US-045** (hover-to-extend chains)
- [x] **US-046** (canvas context menu)
- [x] **US-047** (node-type swap, depends on US-046)

### Phase 6 — group editing (biggest milestone, save for last)
- [x] **US-041** (group-from-selection)
- [x] **US-042** (group settings panel, depends on US-041)
- [x] **US-043** (simplified-view toggle, depends on US-041)
- [x] **US-044** (exposed-params editor, depends on US-042)

> Stories are ordered by independence. Each milestone (C…M) is its own
> commit. Within a milestone the stories are sequential.
