# Adding New Activities and Node Types in the Graph Workflow Engine

This guide explains how to add new functionality end-to-end in the graph workflow architecture.

It covers two scenarios:

1. Add a new activity type (for existing node types like `activity` and `pollUntil`).
2. Add a brand-new node type (new execution semantics in the DAG engine).

References:
- `docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md`
- `docs-md/graph-workflows/GRAPH_TYPES.md`

---

## 1. How execution flows today (end-to-end)

At runtime, a workflow graph follows this path:

1. A workflow config is created/updated via backend workflow APIs.
2. Backend validates graph schema and activity type strings.
3. Config is stored in `workflows.config` (JSONB).
4. OCR request loads the selected workflow config and starts Temporal `graphWorkflow`.
5. Temporal workflow validates graph defensively again.
6. Graph runner executes nodes (`activity`, `switch`, `map`, `join`, `childWorkflow`, `pollUntil`, `humanGate`).
7. Activity nodes resolve `activityType` strings to real activity functions via the worker registry.

Main files in this flow:
- Backend save-time validation: `apps/backend-services/src/workflow/graph-schema-validator.ts`
- Backend activity allow-list: `apps/backend-services/src/workflow/activity-registry.ts`
- Workflow start: `apps/backend-services/src/ocr/ocr.service.ts`
- Temporal client start call: `apps/backend-services/src/temporal/temporal-client.service.ts`
- Worker activity registration: `apps/temporal/src/activity-registry.ts`
- Worker workflow-safe activity type list: `apps/temporal/src/activity-types.ts`
- Temporal workflow entrypoint: `apps/temporal/src/graph-workflow.ts`
- Graph execution loop: `apps/temporal/src/graph-engine/graph-runner.ts`
- Node execution handlers: `apps/temporal/src/graph-engine/node-executors.ts`

---

## 2. Scenario A - Add a new activity type

Use this when you do **not** need a new node type. You only want a new action that runs inside an existing `activity` node (or `pollUntil` node).

Example: add `document.normalizeMetadata`.

### Step A1: Implement the Temporal activity

Create a new file:
- `apps/temporal/src/activities/<your-activity-file>.ts`

Export the function with a strongly typed input/output contract.

Then export it from:
- `apps/temporal/src/activities.ts`

### Step A2: Register it in the Temporal activity registry

Modify:
- `apps/temporal/src/activity-registry.ts`

Add a `register({...})` entry with:
- `activityType` string (used in graph JSON)
- `activityFn` reference
- metadata (`defaultTimeout`, `defaultRetry`, `description`)

Note: execution currently uses node-level timeout/retry defaults in `node-executors.ts` (`2m` and `maximumAttempts: 3`) when not specified on the node.

### Step A3: Add it to workflow-safe activity type constants

Modify:
- `apps/temporal/src/activity-types.ts`

Add your `activityType` string to `REGISTERED_ACTIVITY_TYPES`.

This matters because workflow code cannot import worker-only modules directly; it validates with this constants file.

### Step A4: Add backend save-time validation support

Modify:
- `apps/backend-services/src/workflow/activity-registry.ts`

Add the same `activityType` string and description.

Without this, backend graph validation rejects configs using your new activity.

### Step A5: Add tests

Update/create tests:
- `apps/temporal/src/activities/<your-activity-file>.test.ts` (new)
- `apps/temporal/src/activity-registry.test.ts` (update expected activity list)
- `apps/backend-services/src/workflow/activity-registry.spec.ts` (update expected activity list/count)

Also add/adjust graph validation tests if needed:
- `apps/backend-services/src/workflow/graph-schema-validator.spec.ts`
- `apps/temporal/src/graph-schema-validator.test.ts`

### Step A6: Use the activity in graph configs

Use in workflow JSON as:
- node `type: "activity"` or `type: "pollUntil"`
- set `activityType: "<your.activityType>"`
- map `inputs`/`outputs` ports to `ctx` keys

Useful places for examples/templates:
- `docs-md/templates/*.json` (if maintaining templates)
- Workflow configs stored via API/UI

---

## 3. Scenario B - Add a brand-new node type

Use this when your new behavior cannot be expressed with existing node types and requires new graph semantics.

Example: a hypothetical `batch` node.

### Step B1: Add type definitions in all three apps

Keep these in sync:
- `apps/backend-services/src/workflow/graph-workflow-types.ts`
- `apps/temporal/src/graph-workflow-types.ts`
- `apps/frontend/src/types/graph-workflow.ts`

Update:
- `NodeType` union
- new node interface
- `GraphNode` discriminated union

### Step B2: Implement runtime execution logic

Modify:
- `apps/temporal/src/graph-engine/node-executors.ts`

Add a new `case` in `executeNode(...)` and implement handler logic.

If your node affects dependency readiness/routing semantics, also review:
- `apps/temporal/src/graph-engine/graph-algorithms.ts`
- `apps/temporal/src/graph-engine/graph-runner.ts`

### Step B3: Extend graph validation rules

Modify both validators:
- `apps/backend-services/src/workflow/graph-schema-validator.ts`
- `apps/temporal/src/graph-schema-validator.ts`

Add validation for:
- required fields of new node
- cross-node references
- edge constraints
- deterministic safety constraints if relevant

### Step B4: Update frontend rendering and editor assumptions

Modify:
- `apps/frontend/src/components/workflow/GraphVisualization.tsx`

At minimum, update node type maps:
- dimensions
- colors
- icons
- render logic for any special shape/behavior

If the editor performs type checks or assumptions, also update:
- `apps/frontend/src/pages/WorkflowEditorPage.tsx`

### Step B5: Add/adjust tests

Update tests in all layers:
- Temporal node execution tests (graph workflow and/or graph-engine tests)
- Backend validator tests
- Frontend visualization tests (if present for type rendering)

Core files to review:
- `apps/temporal/src/graph-workflow.test.ts`
- `apps/temporal/src/graph-engine/graph-algorithms.test.ts`
- `apps/temporal/src/graph-schema-validator.test.ts`
- `apps/backend-services/src/workflow/graph-schema-validator.spec.ts`

---

## 4. Input/output contract rules (common source of bugs)

For `activity` and `pollUntil` nodes:

1. Input object is built from:
   - resolved `inputs` port bindings from `ctx`
   - merged `parameters` object
2. Activity return value is expected to be an object.
3. For each output binding, executor reads `result[binding.port]` and writes to `ctx`.

So the activity return object keys must match output port names exactly.

Relevant implementation:
- `apps/temporal/src/graph-engine/node-executors.ts`
- `apps/temporal/src/graph-engine/context-utils.ts`

---

## 5. Complete checklist before merging

### For a new activity type

- [ ] Implement activity in `apps/temporal/src/activities/`
- [ ] Export from `apps/temporal/src/activities.ts`
- [ ] Register in `apps/temporal/src/activity-registry.ts`
- [ ] Add string to `apps/temporal/src/activity-types.ts`
- [ ] Add string to `apps/backend-services/src/workflow/activity-registry.ts`
- [ ] Update temporal registry tests
- [ ] Update backend registry tests
- [ ] Add/update validator tests where relevant
- [ ] Add/update docs-md/template graph examples

### For a new node type

- [ ] Add node type/interface in backend, temporal, and frontend type files
- [ ] Implement executor behavior in temporal graph engine
- [ ] Extend backend validator
- [ ] Extend temporal validator
- [ ] Update frontend graph visualization for new node type
- [ ] Add node-type-specific tests in temporal/backend/frontend
- [ ] Update docs (`docs-md/GRAPH_TYPES.md` and this guide)

---

## 6. Practical gotchas

1. Activity type strings must stay synchronized across:
   - backend `activity-registry.ts`
   - temporal `activity-types.ts`
   - temporal `activity-registry.ts`

2. Backend may accept/reject at save time differently than runtime if those lists drift.

3. `getWorkflowGraphConfig` is an internal Temporal activity used by child workflow behavior. Do not rely on it as a user-facing graph node unless explicitly intended.

4. Node-level timeout/retry values in graph config drive execution behavior. Registry defaults are metadata for discoverability/tests unless explicitly wired into execution.

5. New node types must preserve Temporal determinism and avoid non-deterministic workflow-side behavior.

---

## 7. Suggested implementation order

1. Implement temporal activity or node executor logic.
2. Update temporal type constants/unions.
3. Update backend validation/type definitions.
4. Update frontend rendering/types.
5. Add tests in temporal + backend (+ frontend for new node type).
6. Update docs and workflow templates.

This order catches most contract mismatches early and keeps schema/type changes aligned with execution behavior.

---

## 8. OCR Correction Tool Activities (Feature 008)

Three OCR correction tools are registered as activity types and can be used in graph workflows:

### `ocr.spellcheck`

Dictionary-based spellcheck on OCR field values. Uses nspell with an English dictionary.

**Parameters:**
- `language` (string, optional, default: `"en"`) — language code
- `fieldScope` (string[], optional) — restrict to specific field keys

**Input binding:** `ocrResult` (from `ctx.ocrResult` or `ctx.cleanedResult`)
**Output:** `{ ocrResult, changes, metadata }` (CorrectionResult)

### `ocr.characterConfusion`

Character confusion map replacements (O→0, l→1, S→5, etc.) with optional custom map override.

**Parameters:**
- `confusionMapOverride` (Record<string, string>, optional) — overrides default confusion map
- `applyToAllFields` (boolean, optional, default: false) — apply to all fields, not just date/number-like
- `fieldScope` (string[], optional) — restrict to specific field keys

**Input binding:** `ocrResult` (from `ctx.ocrResult` or `ctx.cleanedResult`)
**Output:** `{ ocrResult, changes, metadata }` (CorrectionResult)

### `ocr.normalizeFields`

Deterministic field normalization: whitespace cleanup, digit grouping, date separators.

**Parameters:**
- `documentType` (string, optional) — LabelingProject id for schema-aware rules
- `enabledRules` / `disabledRules` (string[], optional)
- `normalizeFullResult` (boolean, optional)
- `normalizeWhitespace` (boolean, optional, default: true)
- `normalizeDigitGrouping` (boolean, optional, default: true)
- `normalizeDateSeparators` (boolean, optional, default: true)
- `fieldScope` (string[], optional) — restrict to specific field keys
- `emptyValueCoercion` (`none` | `blank` | `null`, optional, default: `none`) — after rules, coerce empty fields to `""` or JSON null for benchmark GT alignment (all fields in the OCR payload; **not** filtered by `fieldScope`)

**Input binding:** `ocrResult` (from `ctx.ocrResult` or `ctx.cleanedResult`)
**Output:** `{ ocrResult, changes, metadata }` (CorrectionResult)

### Example graph config snippet

```json
{
  "correctionNode": {
    "id": "correctionNode",
    "type": "activity",
    "label": "Spellcheck Correction",
    "activityType": "ocr.spellcheck",
    "parameters": { "language": "en" },
    "inputs": [{ "port": "ocrResult", "ctxKey": "cleanedResult" }],
    "outputs": [{ "port": "ocrResult", "ctxKey": "cleanedResult" }]
  }
}
```

### Correction Tool Registry

A programmatic manifest of the three AI-recommendable correction tools and their parameters is available via `apps/temporal/src/correction-tool-registry.ts`. The AI recommendation pipeline (Feature 008 Step 3) uses it for tool IDs and parameter schemas; **node placement** for candidate workflows is fixed: **split the first normal edge after `azureOcr.extract`** (see `docs-md/OCR_IMPROVEMENT_PIPELINE.md`), not per-entry “safe insertion” metadata in the registry.

See also: `docs-md/OCR_CONFUSION_MATRICES.md` for confusion matrix documentation.
