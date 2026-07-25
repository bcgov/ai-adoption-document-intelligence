# Workflow-builder domain & surface inventory

Shared vocabulary for the four gap-discovery oracle passes (A goal-journeys, B duty-roster,
C static cross-product, D change/delete axis).

**Scope:** `docs-md/workflow-builder/MANUAL_TEST_PLAN.md` Parts 3–9 (canvas & node basics;
control-flow settings forms & condition editor; switch/error edges & validation; rich widgets,
grouping, layout, node swap; typed I/O artifacts; auto-wire; try-in-place / previews / caching /
run history). Parts 10–16 are out of scope but several surfaces are **shared**; those rows are
marked `SHARED` and are in-scope only where a Parts 3–9 concern reaches them.

**How to cite:** findings put the §2 short names (lowercase, `area:qualifier`) in their
`surfaces` array. §3 is Pass D's work-list. §4 is Pass C's grid input.

All paths are repo-relative from `/home/alstruk/GitHub/ai-adoption-document-intelligence`.
Line numbers verified at time of writing (branch `feature/visual-workflow-builder`).

---

## 1. Artifacts

Every authored object in the model, with its defining type and source location.

### 1.1 Persistence-level artifacts

| Artifact | Defining type | Source |
|---|---|---|
| Workflow lineage (the "workflow" a user names/slugs) | `WorkflowLineage` | `apps/shared/prisma/schema.prisma:172` |
| Workflow version (immutable config revision) | `WorkflowVersion` | `apps/shared/prisma/schema.prisma:200` |
| Head-version pin | `WorkflowLineage.head_version_id` | `apps/shared/prisma/schema.prisma:172` |
| Workflow kind (primary / library / benchmark candidate) | `WorkflowKind` enum column `workflow_kind` | `apps/shared/prisma/schema.prisma:172` |
| Run (Temporal execution — **no Prisma table**) | `RunSummaryDto` / `RunSummaryStatus` | `apps/backend-services/src/workflow/dto/list-runs.dto.ts:26`, `:145` |
| Activity-output cache row | `ActivityOutputCache` | `apps/shared/prisma/schema.prisma:888` |
| Cache TTL | `DEFAULT_CACHE_TTL_MS` (24 h) | `packages/graph-workflow/src/cache/constants.ts` |
| Dynamic-node lineage (`SHARED`, Part 14) | `DynamicNode` | `apps/shared/prisma/schema.prisma:914` |
| Dynamic-node version (`SHARED`, Part 14) | `DynamicNodeVersion` | `apps/shared/prisma/schema.prisma:939` |

### 1.2 Graph-config artifacts

| Artifact | Defining type | Source |
|---|---|---|
| Graph config (root) | `GraphWorkflowConfig` | `packages/graph-workflow/src/types.ts:15` |
| Schema version (`"1.0"` literal) | `GraphWorkflowConfig.schemaVersion` | `packages/graph-workflow/src/types.ts:16` |
| Graph metadata | `GraphMetadata` | `packages/graph-workflow/src/types.ts:44` |
| Config hash | `GraphMetadata.configHash` | `packages/graph-workflow/src/types.ts:44`; computed in `packages/graph-workflow/src/config-hash.ts` |
| Ephemeral-cleanup policy (no Parts 3–9 UI — see §5) | `EphemeralConfig` | `packages/graph-workflow/src/types.ts:35` |
| Library port descriptor (`SHARED`, Part 10) | `LibraryPortDescriptor` | `packages/graph-workflow/src/types.ts:83` |
| Ctx declaration | `CtxDeclaration` | `packages/graph-workflow/src/types.ts:94` |
| **Ctx key** (the blackboard key itself) | `Record<string, CtxDeclaration>` key + `PortBinding.ctxKey` | `packages/graph-workflow/src/types.ts:21`, `:172` |
| Synthesised ctx key (`__auto.<nodeId>.<port>`) | `AUTO_CTX_KEY_PREFIX` / `synthesiseCtxKey` | `packages/graph-workflow/src/auto-wire/synthesise-ctx-key.ts` |
| Entry node pointer | `GraphWorkflowConfig.entryNodeId` | `packages/graph-workflow/src/types.ts:20` |
| Node group | `NodeGroup` | `packages/graph-workflow/src/types.ts:114` |
| Group exposed param | `ExposedParam` | `packages/graph-workflow/src/types.ts:123` |
| Node position | `GraphNodeBase.metadata.position` — a convention inside the free-form `metadata?: Record<string, unknown>` bag, **not a declared field** | `packages/graph-workflow/src/types.ts:169` |
| Input-port lock list | `metadata.lockedInputPorts` | `packages/graph-workflow/src/auto-wire/lock-list.ts` |
| Output-port lock list | `metadata.lockedOutputPorts` | `packages/graph-workflow/src/auto-wire/lock-list.ts` |
| Arrange-on-load flag | `metadata.arrangeOnLoad` | `apps/frontend/src/features/workflow-builder/arrange-on-load.ts:26` |

### 1.3 The 8 node types

`NodeType` union — `packages/graph-workflow/src/types.ts:152`. Discriminated union `GraphNode` — `:319`.

| # | `type` | Interface | Source | Type-specific reference fields |
|---|---|---|---|---|
| 1 | `activity` | `ActivityNode` | `packages/graph-workflow/src/types.ts:186` | `activityType`, `parameters`, `retry`, `timeout`, `dynamicNodeVersion` |
| 2 | `switch` | `SwitchNode` | `packages/graph-workflow/src/types.ts:217` | `cases[]` (`SwitchCase` `:223`), `defaultEdge` |
| 3 | `map` | `MapNode` | `packages/graph-workflow/src/types.ts:230` | `collectionCtxKey`, `itemCtxKey`, `indexCtxKey`, `maxConcurrency`, `bodyEntryNodeId`, `bodyExitNodeId` |
| 4 | `join` | `JoinNode` | `packages/graph-workflow/src/types.ts:242` | `sourceMapNodeId`, `strategy` (`"all"` only), `resultsCtxKey` |
| 5 | `childWorkflow` | `ChildWorkflowNode` | `packages/graph-workflow/src/types.ts:258` | `workflowRef` (`library`\|`inline`), `inputMappings`, `outputMappings` |
| 6 | `pollUntil` | `PollUntilNode` | `packages/graph-workflow/src/types.ts:274` | `activityType`, `condition`, `interval`, `maxAttempts`, `initialDelay`, `timeout`, `parameters` |
| 7 | `humanGate` | `HumanGateNode` | `packages/graph-workflow/src/types.ts:287` | `signal.name`, `signal.payloadSchema`, `timeout`, `onTimeout`, `fallbackEdgeId` |
| 8 | `source` | `SourceNode` | `packages/graph-workflow/src/types.ts:310` | `sourceType`, `parameters` |

Shared base fields (`GraphNodeBase`, `packages/graph-workflow/src/types.ts:162`):
`id`, `type`, `label`, `inputs?`, `outputs?`, `errorPolicy?`, `metadata?`.

### 1.4 Ports & bindings

| Artifact | Defining type | Source |
|---|---|---|
| Port binding (`{ port, ctxKey }`) | `PortBinding` | `packages/graph-workflow/src/types.ts:172` |
| Catalog port descriptor (`name`, `label`, `description`, `required`, `kind`) | `PortDescriptor` | `packages/graph-workflow/src/catalog/types.ts:43` |
| Error policy (`retryable`, `onError`, `fallbackEdgeId`, `maxRetries`) | `ErrorPolicy` | `packages/graph-workflow/src/types.ts:177` |
| Retry policy | `RetryPolicy` | `packages/graph-workflow/src/types.ts:203` |
| Timeout policy | `TimeoutPolicy` | `packages/graph-workflow/src/types.ts:210` |
| Auto-wire port resolution | `PortResolution` | `packages/graph-workflow/src/auto-wire/resolve-input-port.ts:11` |
| Auto-wire mechanism | `AutoBoundVia` | `packages/graph-workflow/src/auto-wire/resolve-input-port.ts:9` |
| Derived canvas wire (data / structural) | `DataWire` / `StructuralWire` / `DerivedWire` | `apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts:32`, `:61`, `:69` |

### 1.5 Edges

`GraphEdge` — `packages/graph-workflow/src/types.ts:333`.
Fields: `id`, `source`, `sourcePort?`, `target`, `targetPort?`, `type`, `condition?`.

| Flavour | `type` value | Who stamps it | Renders as |
|---|---|---|---|
| Normal (execution order) | `"normal"` | node-to-node drag; `ensureControlEdge` in `apps/frontend/src/features/workflow-builder/canvas/wire-mutations.ts` | solid grey, or a **dashed grey "sequence" wire** when no data rides it (`apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts:265`) |
| Conditional (switch branch) | `"conditional"` | auto-stamped when the drag starts on a switch source handle (`apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx`) | switch accent + `if <predicate>` / `otherwise` / `(unmatched)` label (`apps/frontend/src/features/workflow-builder/canvas/edge-labels.ts`) |
| Error (fallback) | `"error"` | drag from the bottom `error` handle (`apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:662`) | red + `on error` label (`apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx:222`) |

Note: a **data wire** is *not* a `GraphEdge`. It is derived from `PortBinding` pairs and has id
`wire:<consumerNodeId>:<port>` (`apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts:218`).

### 1.6 Expression language

| Artifact | Defining type | Source |
|---|---|---|
| Condition expression (5-variant union) | `ConditionExpression` | `packages/graph-workflow/src/types.ts:347` |
| Comparison | `ComparisonExpression` | `packages/graph-workflow/src/types.ts:354` |
| Logical (and/or) | `LogicalExpression` | `packages/graph-workflow/src/types.ts:360` |
| Not | `NotExpression` | `packages/graph-workflow/src/types.ts:365` |
| Null check | `NullCheckExpression` | `packages/graph-workflow/src/types.ts:370` |
| List membership | `ListMembershipExpression` | `packages/graph-workflow/src/types.ts:375` |
| Value ref (`{ref}` XOR `{literal}`) | `ValueRef` | `packages/graph-workflow/src/types.ts:381` |

### 1.7 Kinds (typed I/O)

| Artifact | Defining type | Source |
|---|---|---|
| Kind union (27 members) | `ArtifactKind` | `packages/graph-workflow/src/types/artifacts.ts:40` |
| Array cardinality | `ArrayKind` (`` `${ArtifactKind}[]` ``) | `packages/graph-workflow/src/types/artifacts.ts:74` |
| Kind reference used on ports/ctx | `KindRef` | `packages/graph-workflow/src/types/artifacts.ts:81` |
| Runtime `Segment` provenance shape (7-value `kind`) | `Segment` | `packages/graph-workflow/src/types/artifacts.ts:91` |
| Per-kind UI meta (`displayName`, `color`, `baseKind`, `fields`) | `ArtifactKindMeta` | `packages/graph-workflow/src/types/artifact-registry.ts:46` |
| Frozen v1 registry snapshot | `ARTIFACT_REGISTRY` | `packages/graph-workflow/src/types/artifact-registry.ts:66` |
| Live registry accessor / mutator | `getArtifactKindMeta` / `registerArtifactKind` | `packages/graph-workflow/src/types/artifact-registry.ts:292`, `:274` |
| Family-root walk | `resolveKindFamilyRoot` | `packages/graph-workflow/src/types/artifact-registry.ts:312` |
| Assignability check | `isAssignable` | `packages/graph-workflow/src/types/subtype-check.ts:37` |
| Kind field schemas (6 kinds) | `KIND_SCHEMAS` | `packages/graph-workflow/src/types/kind-schemas.ts:113` |
| Inherited-field resolution (walks `baseKind`, max 16) | `resolveKindFields` | `packages/graph-workflow/src/types/kind-fields.ts:20` |
| Ambient TS aliases for dynamic-node scripts | `packages/graph-workflow/src/kinds/index.ts` | (11 scalar + 11 array aliases) |

**`baseKind` family tree** (`packages/graph-workflow/src/types/artifact-registry.ts:66`; doc-comment tree at `packages/graph-workflow/src/types/artifacts.ts:1`):

```
Artifact                                       (gray, root, wildcard)
├── Document                                   (blue)
│   ├── DocumentRef                            (blue)
│   │   ├── MultiPageDocument                  (blue)
│   │   └── SinglePageDocument                 (blue)
│   ├── PreparedFile                           (blue, HAS fields)
│   └── DocumentContent                        (blue)
├── Segment                                    (green)
│   ├── Segment<Text|Table|Figure|Form|KeyValue|Signature|Header>   (green, 7 kinds)
│   ├── DocumentSegment                        (green, HAS fields)
│   │   └── TypedSegment                       (green, HAS fields)
│   ├── ClassifiedPageSegment                  (green, HAS fields)
│   └── LabeledSegment                         (green, HAS fields)
├── OcrResult                                  (violet, HAS fields)
│   ├── OcrFields                              (violet)
│   └── OcrTable                               (violet)
├── Classification                             (yellow)
│   ├── ClassificationLabel                    (yellow)
│   └── LabeledDocumentMap                     (yellow, deliberately schema-free)
├── ValidationResult                           (yellow)
└── Reference                                  (teal)
```

Only 6 kinds carry a `fields` descriptor list (drill-down): `PreparedFile`, `DocumentSegment`,
`TypedSegment`, `ClassifiedPageSegment`, `LabeledSegment`, `OcrResult`
(`packages/graph-workflow/src/types/kind-schemas.ts:113`).

### 1.8 Catalogs

| Artifact | Defining type | Source | Count |
|---|---|---|---|
| Activity catalog entry | `ActivityCatalogEntry` | `packages/graph-workflow/src/catalog/types.ts:75` | — |
| Activity registry | `ACTIVITY_CATALOG` (from `ENTRIES` `:109`) | `packages/graph-workflow/src/catalog/index.ts:156` | **41** static entries |
| Palette category | `CatalogCategory` | `packages/graph-workflow/src/catalog/types.ts:24` | 12 |
| Source catalog entry | `SourceCatalogEntry` | `packages/graph-workflow/src/catalog/source-types.ts:93` | — |
| Source registry | `SOURCE_CATALOG` | `packages/graph-workflow/src/catalog/source-catalog.ts:39` | **2** (`source.api`, `source.upload`) |
| Source field row (`source.api`) | `FieldDescriptor` | `packages/graph-workflow/src/catalog/source-types.ts:72` |
| Provider descriptor | `PROVIDER_CATALOG` | `packages/graph-workflow/src/catalog/provider-catalog.ts` |
| Dynamic-node signature (`SHARED`, Part 14) | `DynamicNodeSignature` | `packages/graph-workflow/src/dynamic-nodes/types.ts:40` |
| Dynamic-node port (`SHARED`) | `DynamicNodePort` | `packages/graph-workflow/src/dynamic-nodes/types.ts:24` |

### 1.9 Run / validation artifacts

| Artifact | Defining type | Source |
|---|---|---|
| Validation error (`path`, `message`, `severity`) | `GraphValidationError` | `packages/graph-workflow/src/types.ts:420` |
| Engine node status | `NodeStatusValue` / `NodeStatus` | `packages/graph-workflow/src/types.ts:430`, `:437` |
| Whole-run status query shape | `GraphWorkflowStatus` | `packages/graph-workflow/src/types.ts:444` |
| Run result | `GraphWorkflowResult` | `packages/graph-workflow/src/types.ts:410` |
| **Frontend** node run status | `NodeRunStatusValue` / `NodeRunStatus` / `NodeStatusesMap` | `apps/frontend/src/features/workflow-builder/run/node-status.types.ts:26`, `:47`, `:66` |
| Cache-hit metadata | `NodeRunStatusCacheHit` | `apps/frontend/src/features/workflow-builder/run/node-status.types.ts:39` |
| Preview payload (cache row projection) | `ActivityOutputPreview` (`outputCtx`, `outputKind`, `createdAt`, `expiresAt`) | `apps/frontend/src/features/workflow-builder/preview/preview.types.ts` |
| Auto-wire per-node problem | `NodeInputProblem` | `apps/frontend/src/features/workflow-builder/auto-wire-status.ts:17` |
| Settings-panel row resolution | `RowResolution` (`PortResolution` + `ctx-bound`) | `apps/frontend/src/features/workflow-builder/settings/input-row-resolution.ts:77` |

---

## 2. Surfaces

Every UI surface in Parts 3–9 that renders or edits an artifact. **Short name** is the stable
identifier for findings' `surfaces` arrays.

### 2.1 Page shell & chrome

| Short name | Component | Renders / edits | Test-plan refs |
|---|---|---|---|
| `page-shell` | `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` | whole `GraphWorkflowConfig`; owns save/create, drop handling, drawer state | 3.1–3.7, all |
| `topbar` | `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:987`–`:1089` | name, description, node/edge counter, validation button, Save, Try, Run, More | 3.6, 5.4, 9.1, 9.2 |
| `topbar:validation-button` | `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1427` | `Valid` / `N issues` / `N warnings` summary | 5.4, 7.2, 8.5, 8.14 |
| `topbar:more-menu` | `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1090`–`:1184` | History, Run history, Save as library, Auto-arrange, Group selected, Simplified view, Workflow settings, Form preview | 6.2, 6.3, 6.7, 9.8, 9.11 |
| `topbar:replay-indicator` | `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1470` | "Replay mode" badge + clear | 9.9 |
| `palette` | `apps/frontend/src/features/workflow-builder/palette/ActivityPalette.tsx` | Sources / Flow Control / Custom / activity-category sections; drag + click add | 3.1, 3.5, 7.1 |
| `templates-modal` | `apps/frontend/src/features/workflow-builder/templates/TemplatesPickerModal.tsx` | "New workflow from template" picker | 3.7 |

### 2.2 Canvas

| Short name | Component | Renders / edits |
|---|---|---|
| `canvas` | `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` | the xyflow surface; node/edge types, connect gestures, selection, auto-fit |
| `canvas:node-card` | `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (`ActivityNodeRenderer`) | activity node body, label, badges |
| `canvas:switch-diamond` | `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (`SwitchNodeRenderer`, `NODE_TYPES` at `:1167`) | switch node, `data-shape="diamond"` |
| `canvas:control-flow-card` | `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (`ControlFlowRectangleRenderer`) | map / join / childWorkflow / pollUntil / humanGate cards |
| `canvas:source-card` | `apps/frontend/src/features/workflow-builder/sources/SourceNodeRenderer.tsx` | source node card, output handle, type pill |
| `canvas:port-rows` | `apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx` (+ `apps/frontend/src/features/workflow-builder/canvas/port-rows.ts`) | per-port rows, kind-coloured handles, amber needs-source ring, drop-compat highlight |
| `canvas:node-handle` | `apps/frontend/src/features/workflow-builder/canvas/handle-style.ts` | node-level execution handles, colour + array outline + tooltip |
| `canvas:type-pill` | `apps/frontend/src/features/workflow-builder/canvas/NodeTypePill.tsx`, `apps/frontend/src/features/workflow-builder/canvas/NodeTypePillRow.tsx` | legacy kind pills under a selected node (7.3 says superseded by port rows) |
| `canvas:wire` | `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx` (+ `apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts`) | data / sequence / conditional / error wires, labels, provenance tooltip |
| `canvas:edge-label` | `apps/frontend/src/features/workflow-builder/canvas/edge-labels.ts` | `if <predicate>` / `otherwise` / `on error` / `(unmatched)` |
| `canvas:group-chip` | `apps/frontend/src/features/workflow-builder/canvas/GroupChipNode.tsx` (+ `apps/frontend/src/features/workflow-builder/canvas/group-projection.ts`) | collapsed group chip in simplified view |
| `canvas:map-body-box` | `apps/frontend/src/features/workflow-builder/canvas/MapBodyContainer.tsx` (+ `apps/frontend/src/features/workflow-builder/canvas/map-body-groups.ts`) | the dashed green map-body rectangle |
| `canvas:node-badge` | `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx` (unified problems badge, `node-badge-<id>`, top-left) | merged validation + auto-wire issue count |
| `node-menu` | `apps/frontend/src/features/workflow-builder/canvas/NodeContextMenu.tsx` | Change activity type / Edit script / Delete node |
| `node-swap-modal` | `apps/frontend/src/features/workflow-builder/canvas/NodeTypeSwapModal.tsx` (+ `apps/frontend/src/features/workflow-builder/canvas/swap-node-type.ts`) | activity-type picker for swap |
| `wire-menu` | `apps/frontend/src/features/workflow-builder/canvas/WireContextMenu.tsx` | View data / Revert to automatic / Disconnect |
| `wire-peek` | `apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.tsx` | value that flowed across a data wire |
| `hover-extend` | `apps/frontend/src/features/workflow-builder/canvas/HoverExtendPopover.tsx` (+ `apps/frontend/src/features/workflow-builder/canvas/extend-filter.ts`, `apps/frontend/src/features/workflow-builder/canvas/use-hover-extend.ts`, `apps/frontend/src/features/workflow-builder/canvas/place-extended-node.ts`) | compatible-next-node popover off a source handle |
| `connect-summary` | `apps/frontend/src/features/workflow-builder/canvas/ConnectSummaryPopover.tsx` | post-connect auto-wire narration with Fix deep-links |
| `auto-arrange` | `apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts` (+ `apps/frontend/src/features/workflow-builder/arrange-on-load.ts`) | dagre layout, stamps `metadata.position` |

### 2.3 Settings panel

| Short name | Component | Renders / edits |
|---|---|---|
| `settings-panel` | `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx` | shell: header, label, type badge, ENTRY badge, Set-as-entry, delete, type dispatch |
| `settings-panel:inputs` | `apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx` (+ `apps/frontend/src/features/workflow-builder/settings/input-row-resolution.ts`) | one row per wireable input; badge, source, CTA, overflow menu |
| `settings-panel:advanced-bindings` | `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx:735`–`:841` | raw `port → ctxKey` input/output binding editors (8.4) |
| `settings-panel:params` | `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx` | schema-driven activity parameter form |
| `settings-panel:switch` | `apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.tsx` | cases list + default edge |
| `settings-panel:map` | `apps/frontend/src/features/workflow-builder/settings/control-flow/MapNodeSettings.tsx` (+ `apps/frontend/src/features/workflow-builder/settings/control-flow/map-body-analysis.ts`) | collection/item/index ctx keys, max concurrency, body entry/exit, reachability alerts |
| `settings-panel:join` | `apps/frontend/src/features/workflow-builder/settings/control-flow/JoinNodeSettings.tsx` | source map picker + results ctx key |
| `settings-panel:child-workflow` | `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx` | Library/Inline toggle, library card, inline JSON, input/output mappings |
| `settings-panel:poll-until` | `apps/frontend/src/features/workflow-builder/settings/control-flow/PollUntilNodeSettings.tsx` (+ `apps/frontend/src/features/workflow-builder/settings/control-flow/duration-validation.ts`) | activity type, nested params, condition, schedule fields |
| `settings-panel:human-gate` | `apps/frontend/src/features/workflow-builder/settings/control-flow/HumanGateNodeSettings.tsx` | signal name, payload schema, timeout, on-timeout, conditional fallback edge picker |
| `settings-panel:source` | `apps/frontend/src/features/workflow-builder/sources/SourceNodeSettings.tsx` | source catalog header + params form + Upload & Try |
| `settings-panel:group` | `apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx` | label, description, icon, colour, member list, delete group |
| `settings-panel:dynamic-node` (`SHARED`, Part 14) | `apps/frontend/src/features/workflow-builder/settings/dynamic-node/DynamicNodeSettings.tsx` | `dyn.*` node settings |
| `exposed-params-editor` | `apps/frontend/src/features/workflow-builder/settings/group/ExposedParamsEditor.tsx` | per-row label / node / param path / type / enum options |
| `kind-select` | `apps/frontend/src/features/workflow-builder/settings/KindSelect.tsx` (+ `apps/frontend/src/features/workflow-builder/settings/kind-select-options.ts`) | `KindRef` picker (wildcard sentinel) |
| `workflow-settings` | `apps/frontend/src/features/workflow-builder/settings/WorkflowSettingsDrawer.tsx` | version, tags, entry node, ctx declarations table (Name/Type/Description/Kind/Input) |

### 2.4 Rich widgets

| Short name | Component | Edits |
|---|---|---|
| `widget:page-range` | `apps/frontend/src/features/workflow-builder/settings/rich-widgets/PageRangeListEditor.tsx` | `document.split` `customRanges[]` |
| `widget:confusion-map` | `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ConfusionMapEditor.tsx` | `ocr.characterConfusion` `customConfusionMap` |
| `widget:keyword-pattern` | `apps/frontend/src/features/workflow-builder/settings/rich-widgets/KeywordPatternEditor.tsx` | `document.splitAndClassify` `keywordPatterns[]` |
| `widget:classification-rule` | `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ClassificationRuleEditor.tsx` | `document.classify` rules + patterns |
| `widget:validation-rule` | `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx` | `document.validateFields` `rules[]` (3 variants) |
| `widget:field-list` | `apps/frontend/src/features/workflow-builder/sources/FieldListEditor.tsx` | `source.api` `parameters.fields[]` |

### 2.5 Graph widgets (pickers)

| Short name | Component | Renders / edits |
|---|---|---|
| `condition-editor` | `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx` | recursive expression tree, operator selects, Ref/Literal toggle |
| `condition-step-picker` | `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionProducerPicker.tsx` (+ `apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.ts`) | "Node → Port" rows for a condition Ref (no kind filter) |
| `variable-picker` | `apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx` (+ `apps/frontend/src/features/workflow-builder/graph-widgets/variable-picker-utils.ts`, `apps/frontend/src/features/workflow-builder/graph-widgets/variable-field-options.ts`, `apps/frontend/src/features/workflow-builder/graph-widgets/ctx-declaration.ts`) | grouped ctx-key autocomplete, field drill-down, compat dimming, inline "+ Create variable" |
| `producer-picker` | `apps/frontend/src/features/workflow-builder/graph-widgets/ProducerPicker.tsx` (+ `apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.ts`) | kind-filtered upstream producer node→port rows |
| `edge-picker` | `apps/frontend/src/features/workflow-builder/graph-widgets/EdgePicker.tsx` | outgoing-edge select + stale-reference warning |
| `node-picker` | `apps/frontend/src/features/workflow-builder/graph-widgets/NodePicker.tsx` | node select/autocomplete + missing-node warning |
| `kind-dot` | `apps/frontend/src/features/workflow-builder/graph-widgets/KindDot.tsx` (+ `apps/frontend/src/features/workflow-builder/canvas/artifact-kind-colour.ts`) | 8px kind colour dot |

### 2.6 Validation

| Short name | Component | Renders |
|---|---|---|
| `validation-drawer` | `apps/frontend/src/features/workflow-builder/validation/ValidationDrawer.tsx` | issues grouped by node + workflow-level bucket; also node-scoped "Problems on <label>" mode |
| `validation-engine` | `apps/frontend/src/features/workflow-builder/validation/useGraphValidation.ts` | debounced merge of core validator + auto-wire + map-body issues |
| `validation:map-body` | `apps/frontend/src/features/workflow-builder/validation/map-body-validation.ts` | map-body reachability warnings |
| `validation:auto-wire` | `apps/frontend/src/features/workflow-builder/auto-wire-validation.ts` (+ `apps/frontend/src/features/workflow-builder/auto-wire-status.ts`) | auto-wire input-health warnings |

### 2.7 Run, preview, cache, history

| Short name | Component | Renders |
|---|---|---|
| `run-drawer` | `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx` (+ `apps/frontend/src/features/workflow-builder/run/build-stub-input.ts`) | Try/Run tabs, JSON body, curl sample, input-schema docs, upload section |
| `run-state` | `apps/frontend/src/features/workflow-builder/run/RunStateContext.tsx` | `activeRunId`, `isReplay`, `nodeStatuses`, group aggregate status |
| `run-status-badge` | `apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.tsx` | per-node run-status circle (top-right) + group aggregate overlay |
| `run:active-edges` | `apps/frontend/src/features/workflow-builder/run/active-edges.ts` | which edges animate blue |
| `run:polling` | `apps/frontend/src/features/workflow-builder/run/useNodeStatuses.ts` | 1.5 s poll, terminal stop, single-shot in replay |
| `preview-widget` | `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx` | per-node preview pane (loading/error/evicted/not-run/ready) |
| `preview:dispatch` | `apps/frontend/src/features/workflow-builder/preview/render-kind-value.tsx` | kind-family → widget dispatch (shared by `preview-widget` and `wire-peek`) |
| `preview:document` | `apps/frontend/src/features/workflow-builder/preview/DocumentPreview.tsx` | thumbnail strip + full-size modal |
| `preview:segments` | `apps/frontend/src/features/workflow-builder/preview/SegmentArrayPreview.tsx` (+ `apps/frontend/src/features/workflow-builder/preview/segment-kind-colors.ts`) | parent doc image + polygon overlays |
| `preview:ocr` | `apps/frontend/src/features/workflow-builder/preview/OcrResultPreview.tsx` | K/V table + raw-JSON modal |
| `preview:classification` | `apps/frontend/src/features/workflow-builder/preview/ClassificationPreview.tsx` | label pill + confidence bar |
| `preview:json` | `apps/frontend/src/features/workflow-builder/preview/JsonValuePreview.tsx` | generic truncated-JSON fallback |
| `cache-evicted-alert` | `apps/frontend/src/features/workflow-builder/preview/CacheEvictedAlert.tsx` | red alert + Re-run recovery |
| `preview:query` | `apps/frontend/src/features/workflow-builder/preview/useActivityOutputPreview.ts` | batched `preview-cache-batch` query + debounced invalidation |
| `run-history-drawer` | `apps/frontend/src/features/workflow-builder/run-history/RunHistoryDrawer.tsx` | infinite-scroll run list |
| `run-history-filters` | `apps/frontend/src/features/workflow-builder/run-history/RunHistoryFilters.tsx` | status / date-range / version filters |
| `run-row` | `apps/frontend/src/features/workflow-builder/run-history/RunRow.tsx` | status dot, version pin, timestamp, input chip, Replay |
| `run-history:query` | `apps/frontend/src/features/workflow-builder/run-history/useWorkflowRuns.ts` | cursor-paged runs query |
| `source-upload` | `apps/frontend/src/features/workflow-builder/sources/SourceUploadButton.tsx` (+ `apps/frontend/src/features/workflow-builder/sources/useSourceUpload.ts`) | Upload & Try (9.3) |

### 2.8 Shared surfaces owned by Parts 10–16

Include a finding here only when a Parts 3–9 concern reaches it.

| Short name | Component | Owned by |
|---|---|---|
| `library-picker` | `apps/frontend/src/features/workflow-builder/library/LibraryPickerModal.tsx` | Part 10; reached from `settings-panel:child-workflow` (4.4) |
| `save-as-library` | `apps/frontend/src/features/workflow-builder/library/SaveAsLibraryModal.tsx` | Part 10; reached from `topbar:more-menu` |
| `library-port-editor` | `apps/frontend/src/features/workflow-builder/library/LibraryPortListEditor.tsx` | Part 10; typed-I/O concern reaches it at 7.8 |
| `version-history` | `apps/frontend/src/features/workflow-builder/versioning/VersionHistoryDrawer.tsx` (+ `apps/frontend/src/features/workflow-builder/versioning/useVersionRunCount.ts`) | Part 12; 9.11 run-count badge is a Part 9 concern |
| `compare-to-head` | `apps/frontend/src/features/workflow-builder/versioning/CompareToHeadModal.tsx` | Part 12 |
| `dynamic-node-editor` | `apps/frontend/src/features/workflow-builder/dynamic-nodes/DynamicNodeEditor.tsx` | Part 14; reached from `node-menu` "Edit script" |

**Surface count in scope (§2.1–§2.7):** 79 named surfaces. Plus 6 shared (§2.8).

---

## 3. Dependency edges — Pass D's work-list

Each row is `upstream artifact → downstream artifact`: the downstream object holds a reference
that only stays valid while the upstream exists and keeps its identity/shape. Pass D asks, for
every row: **what happens on rename / retype / delete / re-parent of the upstream?**

### 3.1 Node identity

| # | Upstream → Downstream | Reference field | Defined / resolved at |
|---|---|---|---|
| D1 | node → edge (source) | `GraphEdge.source` | `packages/graph-workflow/src/types.ts:333`; validated `packages/graph-workflow/src/validator/validator.ts:307` |
| D2 | node → edge (target) | `GraphEdge.target` | `packages/graph-workflow/src/types.ts:333`; validated `:314` |
| D3 | node → entry pointer | `GraphWorkflowConfig.entryNodeId` | `packages/graph-workflow/src/types.ts:20`; validated `packages/graph-workflow/src/validator/validator.ts:256`, `:265`, `:277` |
| D4 | node → map body entry | `MapNode.bodyEntryNodeId` | `packages/graph-workflow/src/types.ts:230`; validated `:583` |
| D5 | node → map body exit | `MapNode.bodyExitNodeId` | `packages/graph-workflow/src/types.ts:230`; validated `:590`; reachability `apps/frontend/src/features/workflow-builder/settings/control-flow/map-body-analysis.ts` |
| D6 | **map node** → join source | `JoinNode.sourceMapNodeId` | `packages/graph-workflow/src/types.ts:242`; validated `packages/graph-workflow/src/validator/validator.ts:602`, `:610` (must exist AND be a map) |
| D7 | node → group membership | `NodeGroup.nodeIds[]` | `packages/graph-workflow/src/types.ts:114`; validated `:1102`, `:1113`; pruned `apps/frontend/src/features/workflow-builder/group/prune-node-from-groups.ts` |
| D8 | node → exposed-param owner | `ExposedParam.nodeId` | `packages/graph-workflow/src/types.ts:123`; pruned `apps/frontend/src/features/workflow-builder/group/prune-node-from-groups.ts`; stale warning `apps/frontend/src/features/workflow-builder/settings/group/ExposedParamsEditor.tsx` |
| D9 | node → synthesised ctx-key namespace `__auto.<nodeId>.<port>` | `PortBinding.ctxKey` | `packages/graph-workflow/src/auto-wire/synthesise-ctx-key.ts` |
| D10 | node → validation-error anchor `nodes.<id>.…` | `GraphValidationError.path` | `packages/graph-workflow/src/validator/validator.ts` (all `nodes.` paths); bucketed `apps/frontend/src/features/workflow-builder/validation/useGraphValidation.ts:116` |
| D11 | node → run node-status map key | `NodeStatusesMap` key | `apps/frontend/src/features/workflow-builder/run/node-status.types.ts:66` |
| D12 | node → cache row | `ActivityOutputCache.nodeId` | `apps/shared/prisma/schema.prisma:888` |
| D13 | node → canvas position | `metadata.position` | `packages/graph-workflow/src/types.ts:169`; written by `apps/frontend/src/features/workflow-builder/canvas/auto-layout.ts` |
| D14 | node → synthetic map-body group `__map_body_<mapId>` | derived group id | `apps/frontend/src/features/workflow-builder/canvas/map-body-groups.ts:12` |
| D15 | node **label** → rendered captions (producer picker rows, `← <producer label>`, drawer `humanizeNodeIds`, edge labels) | `GraphNode.label` | `apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx:284`; `apps/frontend/src/features/workflow-builder/validation/ValidationDrawer.tsx:87` |

### 3.2 Catalog → node

| # | Upstream → Downstream | Reference field | Defined / resolved at |
|---|---|---|---|
| D16 | activity catalog entry → activity node | `ActivityNode.activityType` | `packages/graph-workflow/src/catalog/index.ts:156`; validated `packages/graph-workflow/src/validator/validator.ts:383`, `:401`, `:1203` |
| D17 | activity catalog entry → pollUntil node | `PollUntilNode.activityType` | same |
| D18 | source catalog entry → source node | `SourceNode.sourceType` | `packages/graph-workflow/src/catalog/source-catalog.ts:39`; validated `packages/graph-workflow/src/validator/validator.ts:464`, `:506` |
| D19 | **catalog port name** → port binding | `PortBinding.port` ↔ `PortDescriptor.name` | `packages/graph-workflow/src/catalog/types.ts:43`; `packages/graph-workflow/src/types.ts:172` |
| D20 | **catalog port kind** → binding legality | `PortDescriptor.kind` (`KindRef`) | `packages/graph-workflow/src/catalog/types.ts:43`; enforced `packages/graph-workflow/src/validator/validator.ts:1481` (binding-walk), `packages/graph-workflow/src/types/subtype-check.ts:37` |
| D21 | catalog port kind → auto-wire candidacy | `PortDescriptor.kind` | `packages/graph-workflow/src/auto-wire/resolve-input-port.ts`; gate `packages/graph-workflow/src/auto-wire/should-auto-wire.ts` |
| D22 | catalog port kind → drag-to-bind accept/reject | `PortDescriptor.kind` | `apps/frontend/src/features/workflow-builder/canvas/port-kinds.ts`, `apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx:175` |
| D23 | catalog port kind → variable-picker dimming | `PortDescriptor.kind` | `apps/frontend/src/features/workflow-builder/graph-widgets/variable-picker-utils.ts:87` |
| D24 | catalog port kind → handle colour / array outline | `PortDescriptor.kind` | `apps/frontend/src/features/workflow-builder/canvas/handle-style.ts`, `apps/frontend/src/features/workflow-builder/canvas/artifact-kind-colour.ts` |
| D25 | catalog `parametersSchema` / `paramsSchema` → node `parameters` | `ActivityNode.parameters` | `packages/graph-workflow/src/catalog/types.ts:75`; rendered `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx`; validated `packages/graph-workflow/src/validator/validator.ts:477` |
| D26 | catalog `x-widget` hint → rich widget | `x-widget` in JSON Schema | `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx:254` |
| D27 | catalog `nonCacheable` → cache decorator bypass | `ActivityCatalogEntry.nonCacheable` | `packages/graph-workflow/src/catalog/types.ts:75` |
| D28 | node `parameters` key → exposed-param path | `ExposedParam.path` | `packages/graph-workflow/src/types.ts:123`; validated `packages/graph-workflow/src/validator/validator.ts:1136` |
| D29 | source `parametersSchema` → source node `parameters` | `SourceNode.parameters` | `packages/graph-workflow/src/catalog/source-types.ts:93`; validated `packages/graph-workflow/src/validator/validator.ts:477` |
| D30 | source `deriveOutputSchema` → run-spec input schema | `SourceCatalogEntry.deriveOutputSchema` | `packages/graph-workflow/src/catalog/source-types.ts:93`; consumed `apps/backend-services/src/workflow/build-run-spec.ts` |
| D31 | `source.api` field row → derived output schema property | `FieldDescriptor.name` | `packages/graph-workflow/src/catalog/source-types.ts:72`; edited `apps/frontend/src/features/workflow-builder/sources/FieldListEditor.tsx` |

### 3.3 Ctx keys

| # | Upstream → Downstream | Reference field | Defined / resolved at |
|---|---|---|---|
| D32 | **binding → ctx key** (producer writes) | `PortBinding.ctxKey` on `node.outputs[]` | `packages/graph-workflow/src/types.ts:172` |
| D33 | **binding → ctx key** (consumer reads) | `PortBinding.ctxKey` on `node.inputs[]` | same; kind-checked `packages/graph-workflow/src/validator/validator.ts:1481` |
| D34 | ctx key → ctx declaration (undeclared-key error) | `config.ctx[key]` | `packages/graph-workflow/src/types.ts:21`; validated `packages/graph-workflow/src/validator/validator.ts:681` (inputs), `:697` (outputs) |
| D35 | **ctx key → condition ref** | `ValueRef.ref` | `packages/graph-workflow/src/types.ts:381`; reverse-resolved `apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.ts` |
| D36 | ctx key → map collection | `MapNode.collectionCtxKey` | `packages/graph-workflow/src/types.ts:230`; auto-filled `packages/graph-workflow/src/auto-wire/resolver.ts` |
| D37 | ctx key → map item (loop variable) | `MapNode.itemCtxKey` | `packages/graph-workflow/src/types.ts:230`; scope `apps/frontend/src/features/workflow-builder/graph-widgets/variable-picker-utils.ts` + `apps/frontend/src/features/workflow-builder/settings/control-flow/map-body-analysis.ts` |
| D38 | ctx key → map index | `MapNode.indexCtxKey` | `packages/graph-workflow/src/types.ts:230` |
| D39 | **map → join `resultsCtxKey`** | `JoinNode.resultsCtxKey` | `packages/graph-workflow/src/types.ts:242`; auto-synthesised `packages/graph-workflow/src/auto-wire/resolver.ts` as `__auto.<joinId>.results`; derived default `<mapId>Results` in `apps/frontend/src/features/workflow-builder/settings/control-flow/JoinNodeSettings.tsx` |
| D40 | ctx key → childWorkflow input mapping | `ChildWorkflowNode.inputMappings[].ctxKey` | `packages/graph-workflow/src/types.ts:258` |
| D41 | ctx key → childWorkflow output mapping | `ChildWorkflowNode.outputMappings[].ctxKey` | `packages/graph-workflow/src/types.ts:258` |
| D42 | ctx key → library port path (`SHARED`) | `LibraryPortDescriptor.path` | `packages/graph-workflow/src/types.ts:83`; validated `packages/graph-workflow/src/validator/validator.ts:1632` |
| D43 | ctx key → run-spec input property | `CtxDeclaration.isInput` | `packages/graph-workflow/src/types.ts:94`; stub built `apps/frontend/src/features/workflow-builder/run/build-stub-input.ts` |
| D44 | ctx key → reserved-namespace collision | bare `param`/`row`/`ctx`/`doc`/`segment` | `packages/graph-workflow/src/validator/validator.ts:1502`–`:1550` |
| D45 | ctx key rename → every reference above | `renameCtxKey` sweep | `apps/frontend/src/features/workflow-builder/settings/rename-ctx-key.ts` |
| D46 | ctx `kind` → downstream compatibility | `CtxDeclaration.kind` | `packages/graph-workflow/src/types.ts:94`; resolved `apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.ts` |
| D47 | ctx key → data-wire derivation (producer/consumer pairing) | matching `outputs[].ctxKey` / `inputs[].ctxKey` | `apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts` |

### 3.4 Edges

| # | Upstream → Downstream | Reference field | Defined / resolved at |
|---|---|---|---|
| D48 | **edge → switch case** | `SwitchCase.edgeId` | `packages/graph-workflow/src/types.ts:223`; validated `packages/graph-workflow/src/validator/validator.ts:561` |
| D49 | edge → switch default | `SwitchNode.defaultEdge` | `packages/graph-workflow/src/types.ts:217`; validated `:544`, `:550` |
| D50 | edge → errorPolicy fallback | `ErrorPolicy.fallbackEdgeId` | `packages/graph-workflow/src/types.ts:177`; validated `:338`, `:348`, `:357`, `:365` |
| D51 | edge → humanGate fallback | `HumanGateNode.fallbackEdgeId` | `packages/graph-workflow/src/types.ts:287` |
| D52 | edge `type === "conditional"` + `source === switchId` → EdgePicker option set | filter args | `apps/frontend/src/features/workflow-builder/settings/control-flow/SwitchNodeSettings.tsx:179`, `:263`; `apps/frontend/src/features/workflow-builder/graph-widgets/EdgePicker.tsx` |
| D53 | switch case condition → edge label text | `SwitchCase.condition` | `apps/frontend/src/features/workflow-builder/canvas/edge-labels.ts`; unreferenced edge → `(unmatched)` at `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx:136` |
| D54 | normal edge presence → sequence-wire vs data-wire rendering | `GraphEdge.type === "normal"` with no binding | `apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts:265` |
| D55 | node deletion → orphaned edges | `edges[]` sweep | `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` delete handler |

### 3.5 Groups

| # | Upstream → Downstream | Reference field | Defined / resolved at |
|---|---|---|---|
| D56 | **group → member node** | `NodeGroup.nodeIds[]` | `packages/graph-workflow/src/types.ts:114`; single-membership enforced `apps/frontend/src/features/workflow-builder/group/create-group.ts` |
| D57 | **group → exposed param** | `NodeGroup.exposedParams[]` | `packages/graph-workflow/src/types.ts:114` |
| D58 | member node removal → exposed-param pruning (+ toast) | `ExposedParam.nodeId` | `apps/frontend/src/features/workflow-builder/group/prune-node-from-groups.ts`; toast `apps/frontend/src/features/workflow-builder/settings/group/GroupNodeSettings.tsx:212` |
| D59 | group → simplified-view chip | `chipIdForGroup` | `apps/frontend/src/features/workflow-builder/canvas/group-projection.ts:57` |
| D60 | group → chip edge rewriting | projected edges | `apps/frontend/src/features/workflow-builder/canvas/group-projection.ts` |
| D61 | group → aggregate run status on the chip | `getAggregateStatus` | `apps/frontend/src/features/workflow-builder/run/RunStateContext.tsx:156` |
| D62 | group emptied → group deletion | zero `nodeIds` | `apps/frontend/src/features/workflow-builder/group/prune-node-from-groups.ts` |

### 3.6 Kinds

| # | Upstream → Downstream | Reference field | Defined / resolved at |
|---|---|---|---|
| D63 | kind → `baseKind` parent | `ArtifactKindMeta.baseKind` | `packages/graph-workflow/src/types/artifact-registry.ts:46`, `:66` |
| D64 | kind → family root (preview dispatch, colour grouping) | `resolveKindFamilyRoot` | `packages/graph-workflow/src/types/artifact-registry.ts:312`; consumed `apps/frontend/src/features/workflow-builder/preview/render-kind-value.tsx:30` |
| D65 | kind → field schema → picker drill-down | `KIND_SCHEMAS` / `resolveKindFields` | `packages/graph-workflow/src/types/kind-schemas.ts:113`; `packages/graph-workflow/src/types/kind-fields.ts:20`; consumed `apps/frontend/src/features/workflow-builder/graph-widgets/variable-field-options.ts` |
| D66 | kind → assignability decision | `isAssignable` (walks `baseKind`, strict on `[]`) | `packages/graph-workflow/src/types/subtype-check.ts:37` |
| D67 | dynamic kind registration → live registry | `registerArtifactKind` | `packages/graph-workflow/src/types/artifact-registry.ts:274` |
| D68 | kind → Mantine colour | `ArtifactKindMeta.color` | `packages/graph-workflow/src/types/artifact-registry.ts:66`; translated `apps/frontend/src/features/workflow-builder/canvas/artifact-kind-colour.ts` |

### 3.7 Cross-workflow / versioning

| # | Upstream → Downstream | Reference field | Defined / resolved at |
|---|---|---|---|
| D69 | **library workflow → childWorkflow reference** | `ChildWorkflowNode.workflowRef.workflowId` | `packages/graph-workflow/src/types.ts:258`; stale warning `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx:636` |
| D70 | **version → childWorkflow pin** | `ChildWorkflowNode.workflowRef.version` (absent = head) | `packages/graph-workflow/src/types.ts:258` |
| D71 | library `metadata.inputs/outputs` → childWorkflow port signature | `LibraryPortDescriptor` | `packages/graph-workflow/src/types.ts:83`; rendered `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx` |
| D72 | inline graph → childWorkflow embedded config | `workflowRef.inline.graph` | `packages/graph-workflow/src/types.ts:258` |
| D73 | version → head pointer | `WorkflowLineage.head_version_id` | `apps/shared/prisma/schema.prisma:172` |
| D74 | version → run pin | `RunSummaryDto.workflowVersionId` | `apps/backend-services/src/workflow/dto/list-runs.dto.ts:145`; filter `apps/frontend/src/features/workflow-builder/run-history/RunHistoryFilters.tsx` |
| D75 | version → run-count badge | `useVersionRunCount` | `apps/frontend/src/features/workflow-builder/versioning/useVersionRunCount.ts` |
| D76 | **dynamic-node slug → node activity type** `dyn.<slug>` | `ActivityNode.activityType` + `ActivityCatalogEntry.dynamicNodeSlug` | `packages/graph-workflow/src/catalog/types.ts:75`; `apps/frontend/src/features/workflow-builder/palette/usePaletteSections.ts:50`; `apps/shared/prisma/schema.prisma:914` |
| D77 | dynamic-node version → node pin | `ActivityNode.dynamicNodeVersion` ↔ `DynamicNodeVersion.versionNumber` | `packages/graph-workflow/src/types.ts:186`; `apps/shared/prisma/schema.prisma:939` |

### 3.8 Run / cache

| # | Upstream → Downstream | Reference field | Defined / resolved at |
|---|---|---|---|
| D78 | **run → cache row** | write scoped by `(workflowLineageId, nodeId, configHash, inputHash)` | `apps/shared/prisma/schema.prisma:888` |
| D79 | config hash → cache row validity | `GraphMetadata.configHash` → `ActivityOutputCache.configHash` | `packages/graph-workflow/src/config-hash.ts`; `apps/shared/prisma/schema.prisma:888` |
| D80 | input hash → cache row validity | `computeInputHash` → `ActivityOutputCache.inputHash` | `packages/graph-workflow/src/cache/compute-input-hash.ts`, `packages/graph-workflow/src/cache/hash-artifact.ts`, `packages/graph-workflow/src/cache/artifact-shapes.ts` |
| D81 | cache row → preview widget | `outputCtx` / `outputKind` | `apps/frontend/src/features/workflow-builder/preview/preview.types.ts`; consumed `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx` |
| D82 | cache row `outputKind` → preview widget dispatch | `resolveKindFamilyRoot(outputKind)` | `apps/frontend/src/features/workflow-builder/preview/render-kind-value.tsx:30` |
| D83 | cache row TTL expiry → evicted state | `expiresAt` vs `DEFAULT_CACHE_TTL_MS` | `apps/shared/prisma/schema.prisma:888`; `packages/graph-workflow/src/cache/constants.ts`; surfaced `apps/frontend/src/features/workflow-builder/preview/CacheEvictedAlert.tsx` |
| D84 | data wire → peeked value (`outputCtx` at the wire's ctx key) | `DataWire.ctxKey` | `apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts:32`; read `apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.tsx` |
| D85 | run → node-status map | `GET /:id/runs/:runId/node-statuses` | `apps/backend-services/src/workflow/workflow.controller.ts:792`; consumed `apps/frontend/src/features/workflow-builder/run/useNodeStatuses.ts` |
| D86 | node status → active-edge animation | `active-edges` rule (source running / target pending) | `apps/frontend/src/features/workflow-builder/run/active-edges.ts:35` |
| D87 | node status → preview evicted-vs-not-run branch | `producedOutput(status)` | `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx:49` |
| D88 | source upload → run id | `SourceUploadResponse.runId` → `RunStateContext.activeRunId` | `apps/frontend/src/features/workflow-builder/sources/useSourceUpload.ts`; `apps/frontend/src/features/workflow-builder/sources/SourceUploadButton.tsx` |
| D89 | new Try → prior run cancellation | server-side cancel-on-new-Try | `apps/backend-services/src/workflow/workflow.controller.ts` (run start path) |

### 3.9 Auto-wire lock state

| # | Upstream → Downstream | Reference field | Defined / resolved at |
|---|---|---|---|
| D90 | port name → input lock list entry | `metadata.lockedInputPorts[]` | `packages/graph-workflow/src/auto-wire/lock-list.ts` |
| D91 | port name → output lock list entry | `metadata.lockedOutputPorts[]` | `packages/graph-workflow/src/auto-wire/lock-list.ts` |
| D92 | lock list → resolver skip (`locked` / `locked-unbound`) | `getLockedInputPorts` | `packages/graph-workflow/src/auto-wire/resolve-input-port.ts:50`–`:64` |
| D93 | redundant lock stripping on save | `stripRedundantLocks` | `packages/graph-workflow/src/auto-wire/strip-redundant-locks.ts` |
| D94 | lock normalisation on load | `normaliseLocks` | `packages/graph-workflow/src/auto-wire/normalise-locks.ts` |
| D95 | upstream reachability (BFS distance) → candidate ranking | `upstreamNodesWithDistance` | `packages/graph-workflow/src/auto-wire/upstream-walk.ts` |

**Total dependency edges: 95.**

---

## 4. State sources — Pass C's grid input

Every enum a surface can render, with exact members and definition site.
Rows marked **⚠ no backing enum** are hardcoded strings in a component with no type to check against.

### 4.1 Run status

| Enum | Members | Defined at | Rendered by |
|---|---|---|---|
| `NodeStatusValue` (engine) | `pending`, `running`, **`completed`**, `failed`, `skipped` | `packages/graph-workflow/src/types.ts:430` | — (not imported by the frontend; see §5.1) |
| `NodeRunStatusValue` (frontend/DTO) | `pending`, `running`, **`succeeded`**, `failed`, `skipped`, **`cancelled`** | `apps/frontend/src/features/workflow-builder/run/node-status.types.ts:26` | `run-status-badge`, `preview-widget`, `run:active-edges` |
| Backend DTO `enum` | `pending`, `running`, `succeeded`, `failed`, `skipped` (**no `cancelled`**) | `apps/backend-services/src/workflow/dto/node-statuses-response.dto.ts:44` | API contract |
| `TERMINAL_NODE_STATUSES` | `succeeded`, `failed`, `skipped`, `cancelled` | `apps/frontend/src/features/workflow-builder/run/node-status.types.ts:72` | `run:polling` stop condition |
| Badge style map | `pending`→gray, `running`→blue, `succeeded`→green, `failed`→red, `skipped`→violet, `cancelled`→gray | `apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.tsx:57`–`:67` | `run-status-badge` |
| Group aggregate precedence | `failed` > `running` > `succeeded` > `skipped` > `pending` | `apps/frontend/src/features/workflow-builder/run/RunStateContext.tsx:160`–`:183` | `canvas:group-chip` |
| `RunSummaryStatus` (run history) | `running`, `succeeded`, `failed`, `cancelled` | `apps/backend-services/src/workflow/dto/list-runs.dto.ts:26`; frontend mirror `apps/frontend/src/features/workflow-builder/run-history/useWorkflowRuns.ts:41` | `run-row`, `run-history-filters` |
| Run-history filter options | `all`, `running`, `succeeded`, `failed`, `cancelled` | `apps/frontend/src/features/workflow-builder/run-history/RunHistoryFilters.tsx:37`, `:46`–`:50` | `run-history-filters` |
| `GraphWorkflowResult.status` | `completed`, `failed`, `cancelled` | `packages/graph-workflow/src/types.ts:410` | — |
| `GraphWorkflowStatus.overallStatus` | `running`, `completed`, `failed`, `cancelled` | `packages/graph-workflow/src/types.ts:444` | — |

### 4.2 Validation

| Enum | Members | Defined at | Rendered by |
|---|---|---|---|
| `GraphValidationError.severity` | `error`, `warning` | `packages/graph-workflow/src/types.ts:423` | `validation-drawer`, `canvas:node-badge`, `topbar:validation-button` |
| Validation-button colour | `red` (errors), `yellow` (warnings), `green` (clean) | `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1434` | `topbar:validation-button` |
| Drawer action hint | `pick-source`, `select-node` | `apps/frontend/src/features/workflow-builder/validation/ValidationDrawer.tsx:316` | `validation-drawer` |
| Auto-wire node roll-up | `ok`, `ambiguous`, `unsatisfied` | `apps/frontend/src/features/workflow-builder/auto-wire-status.ts:9` | `canvas:node-badge` |
| Auto-wire issue kind | `ambiguous`, `unsatisfied`, `locked-unbound` | `apps/frontend/src/features/workflow-builder/auto-wire-status.ts:17` | `validation-drawer`, `connect-summary` |

**Validation-error anchor (`path`) shapes** — Pass C's severity × anchor axis. All from
`packages/graph-workflow/src/validator/validator.ts` unless noted.

| Anchor shape | Severity | Line | Drawer routing |
|---|---|---|---|
| `""` (root) | error | `:148` | workflow-level |
| `schemaVersion` | error | `:197` | workflow-level |
| `nodes` | error | `:210` | workflow-level |
| `nodes.<id>` | error | `:225`, `:233` | node bucket → select node |
| `nodes.<id>` | **warning** | `:1046`, `:1150` | node bucket → select node |
| `nodes.<id>.label` | error | `:240` | node bucket |
| `entryNodeId` | error | `:256`, `:265`, `:277` | workflow-level |
| `edges` | error | `:987` | workflow-level |
| `edges[i]` / `edges[i].source` / `edges[i].target` | error | `:298`, `:307`, `:314` | workflow-level |
| `edges.<edgeId>` / `edges.<edgeId>.source` | error | `:357`, `:365` | workflow-level |
| `nodes.<id>.errorPolicy.fallbackEdgeId` | error | `:338`, `:348` | node bucket |
| `nodes.<id>.activityType` | error | `:383`, `:401`, `:1203` | node bucket |
| `nodes.<id>.inputs` | error | `:454` | node bucket |
| `nodes.<id>.sourceType` | error | `:464`, `:506` | node bucket |
| `nodes.<id>.parameters<suffix>` | error | `:477` | node bucket |
| `metadata.ctx` | **warning** | `:523` | workflow-level |
| `nodes.<id>.defaultEdge` | error | `:544`, `:550` | node bucket |
| `nodes.<id>.cases[i].edgeId` | error | `:561` | node bucket |
| `nodes.<id>.bodyEntryNodeId` / `.bodyExitNodeId` | error | `:583`, `:590` | node bucket |
| `nodes.<id>.sourceMapNodeId` | error | `:602`, `:610` | node bucket |
| `nodes.<id>.inputs[i].ctxKey` | error | `:681` | node bucket |
| `nodes.<id>.outputs[i].ctxKey` | error | `:697` | node bucket |
| `<conditionPath>.operator` / `.operands` / `.operand` | error | `:767`, `:794`, `:814` | node bucket |
| `nodeGroups.<id>.nodeIds` / `.nodeIds[i]` | error | `:1102`, `:1113` | workflow-level (does not start with `nodes.`) |
| `nodeGroups.<id>.exposedParams[i].path` | error | `:1136` | workflow-level |
| **`nodes.<id>.inputs.<port>`** | error | `:1481` | **deep-links to source picker** (`apps/frontend/src/features/workflow-builder/validation/ValidationDrawer.tsx:74`) |
| **`nodes.<id>.inputs.<port>`** | **warning** | `apps/frontend/src/features/workflow-builder/auto-wire-validation.ts:42` | **deep-links to source picker** |
| `ctx.<key>` (reserved namespace) | error | `:1514`, `:1519` | workflow-level |
| `nodes.<id>.outputs.<port>` (reserved namespace) | error | `:1514` | node bucket → select node (no deep-link) |
| `nodes.<id>.itemCtxKey` / `.indexCtxKey` (reserved namespace) | error | `:1514` | node bucket → select node |
| `metadata.inputs[i].path` / `metadata.outputs[i].path` | error | `:1632` | workflow-level |
| `nodes.<mapId>.bodyExitNodeId` (map-body reachability) | **warning** | `apps/frontend/src/features/workflow-builder/validation/map-body-validation.ts:38`, `:44`, `:57` | node bucket |

Reserved ctx namespaces: `param`, `row`, `ctx`, `doc`, `segment`
(`packages/graph-workflow/src/validator/validator.ts:1502`).

### 4.3 Ports & binding state

| Enum | Members | Defined at | Rendered by |
|---|---|---|---|
| `PortResolution.status` | `auto-bound`, `ambiguous`, `unsatisfied`, `locked`, `locked-unbound` | `packages/graph-workflow/src/auto-wire/resolve-input-port.ts:11` | `settings-panel:inputs`, `connect-summary`, `canvas:port-rows` |
| `RowResolution` (frontend superset) | the 5 above **+ `ctx-bound`** ⚠ display-only | `apps/frontend/src/features/workflow-builder/settings/input-row-resolution.ts:77`, produced at `:122` | `settings-panel:inputs` |
| `AutoBoundVia` | `nearest-kind`, `name-match`, `map-item` | `packages/graph-workflow/src/auto-wire/resolve-input-port.ts:9` | `canvas:wire` provenance tooltip |
| `PinnedSource.via` | `producer`, `ctx` | `apps/frontend/src/features/workflow-builder/settings/input-row-resolution.ts:47` | `settings-panel:inputs` |
| Input-row badge text | `Auto` (green), *(none)* `Pick a source` (yellow), *(none)* `Needs a source` (red), `Pinned` (gray), `Disconnected` (gray), *(none)* `from <ctxKey>` | `apps/frontend/src/features/workflow-builder/settings/InputsSection.tsx:272`–`:395` | `settings-panel:inputs` |
| Port direction | `input`, `output` | `apps/frontend/src/features/workflow-builder/canvas/port-kinds.ts:39`; `apps/frontend/src/features/workflow-builder/canvas/port-rows.ts:90` | `canvas:port-rows` |
| Handle-id prefix | `in-`, `out-`, plus the literal `error` bottom handle | `apps/frontend/src/features/workflow-builder/canvas/port-kinds.ts:41`; `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:662` | `canvas` |
| Port-row data attrs | `data-port-kind` (default `Artifact`), `data-needs-source` (`true`/`false`), `data-drop-compatible` | `apps/frontend/src/features/workflow-builder/canvas/PortRows.tsx:170`–`:175` | `canvas:port-rows` |

### 4.4 Wires & edges

| Enum | Members | Defined at | Rendered by |
|---|---|---|---|
| `GraphEdge.type` | `normal`, `conditional`, `error` | `packages/graph-workflow/src/types.ts:333` | `canvas:wire` |
| Wire variant | `data`, `sequence`, `conditional`, `error` | `apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts:34`, `:63` | `canvas:wire` (`data-wire-variant`, `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx:298`) |
| `data-provenance` ⚠ no enum type | `pinned`, `auto:nearest-kind`, `auto:name-match`, `auto:map-item`, `auto`, `manual` | `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx:104`–`:107` | `canvas:wire` |
| Edge label | `if <predicate>`, `otherwise`, `on error`, `(unmatched)` | `apps/frontend/src/features/workflow-builder/canvas/edge-labels.ts:157`; `apps/frontend/src/features/workflow-builder/canvas/WorkflowEdge.tsx:136`, `:147`, `:222` | `canvas:edge-label` |
| Comparison words in labels | `is`, `is not`, `>`, `≥`, `<`, `≤`, `contains` | `apps/frontend/src/features/workflow-builder/canvas/edge-labels.ts:38`–`:46` | `canvas:edge-label` |
| Collapsed logical label | `all of (N)`, `any of (N)` | `apps/frontend/src/features/workflow-builder/canvas/edge-labels.ts:72` | `canvas:edge-label` |

### 4.5 Node & canvas

| Enum | Members | Defined at |
|---|---|---|
| `NodeType` | `activity`, `switch`, `map`, `join`, `childWorkflow`, `pollUntil`, `humanGate`, `source` | `packages/graph-workflow/src/types.ts:152` |
| Canvas `NODE_TYPES` keys | the 8 above **+ `group-chip`, `map-body-container`** | `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:1167` |
| `CONTROL_FLOW_TYPES` | `switch`, `map`, `join`, `childWorkflow`, `pollUntil`, `humanGate` | `apps/frontend/src/features/workflow-builder/canvas/WorkflowEditorCanvas.tsx:363` |
| `ControlFlowShape` | `diamond`, `rectangle` | `apps/frontend/src/features/workflow-builder/control-flow-visual-hints.ts:34` |
| Fan indicator | `fan-out` (map), `fan-in` (join) | `apps/frontend/src/features/workflow-builder/control-flow-visual-hints.ts:66`, `:76` |
| Palette drop-payload kind | `activity`, `controlFlow`, `source`, `dynamic` | `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:1338`–`:1354` |
| `CatalogCategory` | `Flow Control`, `File Handling`, `OCR (Azure)`, `OCR (Mistral)`, `OCR Cleanup & Correction`, `OCR Quality`, `Document Handling`, `Validation`, `Storage`, `Data Transformation`, `Reference Data`, `Benchmarking` | `packages/graph-workflow/src/catalog/types.ts:24` |
| Hidden palette categories | `Benchmarking` | `apps/frontend/src/features/workflow-builder/catalog-utils.ts:99` |
| Group icon keys | `scan`, `cleanup`, `quality`, `human`, `save`, `prepare`, `process`, `validate` | `apps/frontend/src/features/workflow-builder/group/group-icons.ts:32` |

### 4.6 Control-flow forms

| Enum | Members | Defined at |
|---|---|---|
| `ErrorPolicy.onError` | `fail`, `fallback`, `skip` | `packages/graph-workflow/src/types.ts:177` |
| `HumanGateNode.onTimeout` | `fail`, `continue`, `fallback` | `packages/graph-workflow/src/types.ts:287`; restated `apps/frontend/src/features/workflow-builder/settings/control-flow/HumanGateNodeSettings.tsx:71`, `:80` |
| Signal-name presets | `humanApproval`, `approve`, `review`, `reject` | `apps/frontend/src/features/workflow-builder/settings/control-flow/HumanGateNodeSettings.tsx:90` |
| `JoinNode.strategy` | `all` (only; `any` removed) | `packages/graph-workflow/src/types.ts:242` |
| `workflowRef.type` | `library`, `inline` | `packages/graph-workflow/src/types.ts:258`; options `apps/frontend/src/features/workflow-builder/settings/control-flow/ChildWorkflowNodeSettings.tsx:79` |
| Control-flow defaults | join `strategy: "all"`; pollUntil `interval: "30s"`; humanGate `timeout: "1h"`, `onTimeout: "fail"`; childWorkflow `{type:"library"}` | `apps/frontend/src/features/workflow-builder/palette/control-flow-skeletons.ts:78`, `:88`, `:103`, `:113`, `:114` |

### 4.7 Condition editor

| Enum | Members | Defined at |
|---|---|---|
| `OperatorKind` (editor grouping) | `comparison`, `and`, `or`, `not`, `null-check`, `membership` | `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx:64` |
| Comparison operators | `equals`, `not-equals`, `gt`, `gte`, `lt`, `lte`, `contains` | `packages/graph-workflow/src/types.ts:354`; UI list `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx:81` |
| Logical operators | `and`, `or` | `packages/graph-workflow/src/types.ts:360` |
| Not operator | `not` | `packages/graph-workflow/src/types.ts:365` |
| Null-check operators | `is-null`, `is-not-null` | `packages/graph-workflow/src/types.ts:370`; UI `…ConditionExpressionEditor.tsx:91` |
| Membership operators | `in`, `not-in` | `packages/graph-workflow/src/types.ts:375`; UI `…ConditionExpressionEditor.tsx:96` |
| `ValueRefMode` | `ref`, `literal` | `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx:812` |
| Ref sub-mode | `step`, `manual` | `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx:863` |
| Sub-mode forcing conditions | `forcedManual` (unresolvable ref), `canUseSteps` (no `currentNodeId`) | `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx:860`, `:862` |

### 4.8 Kinds & typed I/O

| Enum | Members | Defined at |
|---|---|---|
| `ArtifactKind` | 27 members — see §1.7 tree | `packages/graph-workflow/src/types/artifacts.ts:40` |
| `Segment.kind` (runtime provenance) | `Text`, `Table`, `Figure`, `Form`, `KeyValue`, `Signature`, `Header` | `packages/graph-workflow/src/types/artifacts.ts:91` |
| `SegmentKind` (preview palette) | same 7 | `apps/frontend/src/features/workflow-builder/preview/segment-kind-colors.ts:36` |
| Registry colours | `gray`, `blue`, `green`, `violet`, `yellow`, `teal` | `packages/graph-workflow/src/types/artifact-registry.ts:66` |
| Kinds with a field schema | `OcrResult`, `PreparedFile`, `DocumentSegment`, `TypedSegment`, `ClassifiedPageSegment`, `LabeledSegment` | `packages/graph-workflow/src/types/kind-schemas.ts:113` |
| Preview dispatch families | `Segment` (array only), `Document`, `OcrResult`, `Classification`; everything else → `null` | `apps/frontend/src/features/workflow-builder/preview/render-kind-value.tsx:31`–`:42` |

### 4.9 Ctx / schema types

| Enum | Members | Defined at |
|---|---|---|
| `CtxDeclaration.type` | `string`, `number`, `boolean`, `object`, `array` | `packages/graph-workflow/src/types.ts:94`; UI `apps/frontend/src/features/workflow-builder/settings/WorkflowSettingsDrawer.tsx:39` |
| `LibraryPortDescriptor.type` | same 5 | `packages/graph-workflow/src/types.ts:83` |
| `FieldDescriptor.type` (source.api) | same 5 | `packages/graph-workflow/src/catalog/source-types.ts:72`; UI `apps/frontend/src/features/workflow-builder/sources/FieldListEditor.tsx:63` |
| `ExposedParam.type` | `string`, `number`, `boolean`, `select`, **`duration`** | `packages/graph-workflow/src/types.ts:123` |
| Exposed-params editor options | `string`, `number`, `boolean`, `select` (**`duration` missing**) | `apps/frontend/src/features/workflow-builder/settings/group/ExposedParamsEditor.tsx:54` |
| `GraphMetadata.kind` | `workflow`, `library` | `packages/graph-workflow/src/types.ts:44` |
| `SourceRuntimePattern` | `push`, `pull`, `manual` | `packages/graph-workflow/src/catalog/source-types.ts:31` |

### 4.10 Rich-widget option sets

| Enum | Members | Defined at |
|---|---|---|
| `x-widget` dispatched by the form | `combobox`, `classification-rule-editor`, `validation-rule-editor`, `confusion-map-editor`, `keyword-pattern-editor`, `field-list-editor`, `page-range-list` | `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx:259`, `:346`, `:376`, `:406`, `:441`, `:471`, `:501` |
| `x-widget` declared but **not** dispatched ⚠ | `textarea`, `documentPicker` | `apps/frontend/src/features/workflow-builder/json-schema-form/types.ts:11` (doc comment only; the field itself is an untyped `string` at `:42`) |
| Validation rule types | `field-match`, `arithmetic`, `array-match` | `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx:68` (restated `:242`) |
| Validation match operators | `equals`, `approximately` | `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx:36` |
| Validation field types | `text`, `number`, `currency` | `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx:37` |
| Validation match types | `any`, `all` | `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx:38` |
| Arithmetic operations | `sum`, `difference`, `product` | `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx:39` |
| Classification pattern scopes / operators | imported `CLASSIFICATION_PATTERN_SCOPES` / `_OPERATORS` | `packages/graph-workflow/src/catalog/activities/document-classify.ts` |
| `PreparedFile.fileType` | `pdf`, `image` | `packages/graph-workflow/src/types/kind-schemas.ts:46` |
| `PreparedFile.outputFormat` | `text`, `markdown` | `packages/graph-workflow/src/types/kind-schemas.ts:46` |
| `OcrResult.storage` | `blob` (literal) | `packages/graph-workflow/src/types/kind-schemas.ts:23` |

### 4.11 Preview / cache states ⚠ (no backing enum)

| Surface | States | Defined at |
|---|---|---|
| `preview-widget` `data-state` | `loading`, `error`, `evicted`, `not-run`, `ready`, **plus 3 silent `null` returns** (control-flow node with no output `:162`; live-Try miss `:199`; unknown kind `:205`) | `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx:141`, `:149`, `:180`, `:190`, `:210` |
| `preview-widget` not-run copy | failed → *"This step failed in this run…"*; pending/running/cancelled/absent → *"This step didn't run in this run…"* — **this is the "branch not taken / never reached" state** | `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx:59`, `:64` |
| `wire-peek` `data-state` (typed `state: string`) | `no-run`, `loading`, `error`, `evicted`, `empty`, `ready` | `apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.tsx:43`, `:95`, `:104`, `:111`, `:121`, `:147`, `:157` |
| `cache-evicted-alert` `Mode` | `idle`, `rerunning`, `retention-cleaned`, `error` | `apps/frontend/src/features/workflow-builder/preview/CacheEvictedAlert.tsx:188` |
| `ClassificationPreview` confidence band | `green`, `yellow`, `red` | `apps/frontend/src/features/workflow-builder/preview/ClassificationPreview.tsx:50` |

### 4.12 Picker / editor states

| Surface | States | Defined at |
|---|---|---|
| `variable-picker` group headings | `Workflow context`, `Loop variables`, `Other nodes' outputs`, `Compatible`, `Incompatible with this port` | `apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx:161`, `:164`, `:169`, `:335`, `:192` |
| `variable-picker` row attrs | `data-incompatible="true"`, `data-incompatible-reason`, 50% opacity | `apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx:355`–`:368` |
| `variable-picker` create affordance | `+ Create variable "<name>"` when identifier-valid and not existing | `apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx:92`, `:233`–`:247` |
| `run-drawer` open mode | `run`, `try` | `apps/frontend/src/features/workflow-builder/run/RunWorkflowDrawer.tsx:90` |
| `page-shell` mode | `create`, `edit` | `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:143` |
| `page-shell` view mode | `simplifiedView` boolean; `isReplay` boolean | `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx:200`; `apps/frontend/src/features/workflow-builder/run/RunStateContext.tsx` |
| `settings-panel` advanced toggle | `Show advanced` / `Hide advanced` | `apps/frontend/src/features/workflow-builder/settings/NodeSettingsPanel.tsx:679` |
| `node-picker` render mode | Select (≤20 nodes) vs Autocomplete (>20) | `apps/frontend/src/features/workflow-builder/graph-widgets/NodePicker.tsx:38` |
| `settings-panel:map` alerts | `Body exit is unreachable` (red), `Some branches never reach the exit` (yellow) | `apps/frontend/src/features/workflow-builder/settings/control-flow/MapNodeSettings.tsx:202`, `:213` |

**State-source count: 91 distinct enums / state sets across §4.1–§4.12, plus 33 validation-error
anchor shapes in the §4.2 anchor table.**

---

## 5. Observations for the passes

Things noticed while building the inventory. **Not** fixed, **not** triaged — they are leads,
and each pass should confirm or discard them independently.

### 5.1 Two node-status unions that never meet

`packages/graph-workflow/src/types.ts:430` defines `NodeStatusValue` with **`completed`**.
`apps/frontend/src/features/workflow-builder/run/node-status.types.ts:26` defines
`NodeRunStatusValue` with **`succeeded`** and an extra **`cancelled`**. Neither imports the other;
the backend DTO enum (`apps/backend-services/src/workflow/dto/node-statuses-response.dto.ts:44`)
matches the frontend on `succeeded` but omits `cancelled`. Three unions, one concept.
`cancelled` is rendered by the badge (aliased to the pending visual,
`apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.tsx:66`) but the file's own
doc comment says the backend never emits it. **Pass C** should grid `run-status × surface` with
all three unions, not one.

### 5.2 `not-reached` / `branch-not-taken` do not exist as literals

The task brief cites commit `fbc6c2dd` referencing `not-reached` and `branch-not-taken`. Neither
string appears in the tree. The concept is implemented as a **copy string** inside
`notRunMessage` (`apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx:64`),
reached via `data-state="not-run"` (`:190`), and the discrimination between "evicted" and
"never ran" is `producedOutput(status)` at `:49`. So the derived state exists, but it is
computed, unnamed, and untyped. `wire-peek` has the same concept under a *different* name
(`no-run`, `apps/frontend/src/features/workflow-builder/canvas/WirePeekPopover.tsx:95`, `:131`)
with `state` typed as bare `string` (`:43`).

### 5.3 `ctx-bound` — a sixth binding state invented in the frontend

`packages/graph-workflow/src/auto-wire/resolve-input-port.ts:11` declares 5 resolution states.
`apps/frontend/src/features/workflow-builder/settings/input-row-resolution.ts:77` widens that to
6 by adding `ctx-bound` (produced only at `:122`). The engine, the validator, and
`apps/frontend/src/features/workflow-builder/auto-wire-status.ts` all know 5. Any grid built from `PortResolution` alone misses a row that
`settings-panel:inputs` actually renders.

### 5.4 Preview widget has 8 outcomes but only 5 are observable

Three of the eight branches return `null` with no `data-state`
(`apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx:162`, `:199`, `:205`).
The `:205` case — `renderForOutputKind` returned `null` for an unknown/unsupported kind — is
indistinguishable from "no data" to a user. Test-plan 9.5 already flags `OcrTable` /
`ValidationResult` as rendering nothing; per
`apps/frontend/src/features/workflow-builder/preview/render-kind-value.tsx:31`–`:42`, so do
**every non-Segment array kind**, `Reference`, and every kind whose family root is not one of
the four dispatched.

### 5.5 Auto-wire cannot see most producers

`outputPortsFor` in `packages/graph-workflow/src/auto-wire/resolve-input-port.ts` returns `[]`
for every node type except `activity` and `pollUntil` (the map node gets a separate synthetic
pass). **Source nodes are therefore not auto-wire producers**, even though
`apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts:128`–`:156` special-cases
`source.upload` / `source.api` to render source-originated data wires, and
`apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.ts:117`–`:129`
resolves their kinds. Marked **uncertain** — it may be intentional per the code comment
("Tasks 13–15"), but the canvas and the resolver disagree about what a producer is.

### 5.6 `ExposedParam.type: "duration"` is unreachable in the UI

`packages/graph-workflow/src/types.ts:123` allows `duration`;
`apps/frontend/src/features/workflow-builder/settings/group/ExposedParamsEditor.tsx:54` offers
only `string | number | boolean | select`. A config authored with `duration` (template, API,
agent) round-trips but its type select will show blank.

### 5.7 Run history cannot filter on two of the six node statuses

`RunSummaryStatus` has 4 members (`apps/backend-services/src/workflow/dto/list-runs.dto.ts:26`);
`NodeRunStatusValue` has 6. `pending` and `skipped` are unfilterable in `run-history-filters`.
Separately, `apps/frontend/src/features/workflow-builder/run-history/RunRow.tsx:47` has a
`STATUS_COLOR` map whose doc comment claims a `pending` entry the map does not contain.

### 5.8 Only one validation-anchor shape deep-links

`apps/frontend/src/features/workflow-builder/validation/ValidationDrawer.tsx:74` matches exactly
`/^nodes\.(.+)\.inputs\.([^.]+)$/`. Every other anchor in §4.2 — 27 distinct shapes — falls back
to select-node-and-close. Anchors that do **not** start with `nodes.` (`nodeGroups.<id>.…`,
`ctx.<key>`, `metadata.inputs[i].path`, `edges[i]`, `edges.<edgeId>`) land in the *workflow-level*
bucket even when they name a specific node's group or a specific edge
(`apps/frontend/src/features/workflow-builder/validation/useGraphValidation.ts:116`).

### 5.9 The frozen-vs-live registry split

`ARTIFACT_REGISTRY` is `Object.freeze`d and explicitly does **not** reflect runtime kind
registrations (`packages/graph-workflow/src/types/artifact-registry.ts:66`, doc comment at
`:230`). `getArtifactKindMeta` is the live view. Any surface that indexes the frozen constant
directly will be blind to dynamically-registered kinds. Worth a grep pass by whoever owns the
kind axis.

### 5.10 Duplicated unions that can drift

- `HumanGateNode.onTimeout` restated twice in
  `apps/frontend/src/features/workflow-builder/settings/control-flow/HumanGateNodeSettings.tsx`
  (`:71` options, `:80` type guard).
- Validation rule types restated twice in
  `apps/frontend/src/features/workflow-builder/settings/rich-widgets/ValidationRuleEditor.tsx`
  (`:68`, `:242`).
- Comparison operators declared in `packages/graph-workflow/src/types.ts:354` and re-listed in
  `apps/frontend/src/features/workflow-builder/graph-widgets/ConditionExpressionEditor.tsx:81`,
  `apps/frontend/src/features/workflow-builder/canvas/edge-labels.ts:38`, and
  `apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.ts:150`
  — four copies.
- `apps/frontend/src/features/workflow-builder/json-schema-form/types.ts:11` (doc comment only; the field itself is an untyped `string` at `:42`) documents `x-widget` values `textarea` and `documentPicker`
  that `apps/frontend/src/features/workflow-builder/json-schema-form/JsonSchemaForm.tsx` never dispatches.

### 5.11 Artifacts with no Parts 3–9 editing surface

Found in the model, no editor located in scope. Marked **uncertain** — a pass may find one.

| Artifact | Defined at |
|---|---|
| `EphemeralConfig` (`metadata.ephemeral`) | `packages/graph-workflow/src/types.ts:35` |
| `RetryPolicy` / `TimeoutPolicy` on activity nodes | `packages/graph-workflow/src/types.ts:203`, `:210` |
| `ErrorPolicy` (`retryable`, `onError`, `maxRetries`) — 5.2 assumes `onError: "fallback"` is already set, but names no surface that sets it | `packages/graph-workflow/src/types.ts:177` |
| `GraphEdge.sourcePort` / `targetPort` (edges carry port fields the data-wire model does not use) | `packages/graph-workflow/src/types.ts:333` |
| `CtxDeclaration.defaultValue` | `packages/graph-workflow/src/types.ts:94` |
| `ExposedParam.default` | `packages/graph-workflow/src/types.ts:123` |
| `ActivityCatalogEntry.nonCacheable` (affects 9.6 cache behaviour, no UI indicator) | `packages/graph-workflow/src/catalog/types.ts:75` |

### 5.12 Data-wire id uniqueness assumption

`apps/frontend/src/features/workflow-builder/canvas/derive-wires.ts:34`–`:38` documents that
wire ids assume **one `inputs[]` row per (node, port)**; duplicate rows collide. Nothing in
`packages/graph-workflow/src/validator/validator.ts` was found enforcing that uniqueness.
Marked **uncertain**.
