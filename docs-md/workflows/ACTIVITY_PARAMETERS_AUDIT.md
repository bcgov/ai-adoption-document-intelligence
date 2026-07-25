# Workflow Activity Parameters Audit

**Purpose:** Define what workflow authors should configure versus what should stay auto-wired or internal in the current V2 workflow builder.

**Audience:** Product, UX, and engineering.

**Companion docs:**

- `WORKFLOW_SIMPLIFIED_VIEW_GUIDE.md` — team review decisions and simplified palette
- `WORKFLOW_NODE_CATALOG.md` — field/widget-level node spec

---

## Current operating model

At runtime, every activity receives one merged parameter object:

1. `node.inputs[]` resolved from workflow context
2. `node.parameters` static values
3. system-injected values such as `requestId` and `groupId`
4. benchmark-only payloads such as Azure OCR cache replay

In the current V2 editor:

- activity parameters are schema-driven
- inputs are auto-wire-first with Override/Revert
- raw port→ctx bindings are hidden in Advanced
- groups and `exposedParams` are editable

This audit governs **what belongs in the author-facing settings surface**.

---

## Exposure policy

| Classification | Meaning | UI treatment |
|---|---|---|
| User config | Business choice an author should manage | Show by default |
| Advanced user config | Useful but not needed by most authors | Collapsed Advanced section |
| Wiring | Data source or flow connection | Auto-wire by default; picker in detailed mode |
| Internal | Runtime/system implementation detail | Never expose |

Never expose `groupId`, `requestId`, benchmark internals, raw operation IDs (`apimRequestId`, `resultId`, `constructedClassifierName`), or `__benchmarkOcrCache`.

---

## Activity exposure table

| Activity ID | Primary settings | Advanced settings | Auto-wired / hidden |
|---|---|---|---|
| `file.prepare` | OCR model | — | document/blob metadata |
| `azureOcr.submit` | — | locale | request/response plumbing |
| `azureOcr.poll` | poll timing via `pollUntil` | extra poll controls | poll payload |
| `azureOcr.extract` | — | — | operation/payload wiring |
| `mistralOcr.process` | template model | annotation prompt | provider internals |
| `ocr.cleanup` | — | — | whole step in simplified composites |
| `ocr.checkConfidence` | confidence threshold | — | `requiresReview` wiring |
| `ocr.enrich` | document type, LLM toggle, LLM threshold | — | enrichment payload wiring |
| `ocr.spellcheck` | language | field scope | audit metadata |
| `ocr.characterConfusion` | document type, confusion profile | rule lists, apply-all, map overrides | audit metadata |
| `ocr.normalizeFields` | document type, empty-value mode | rule toggles, field scope | audit metadata |
| `ocr.storeResults` | — | — | storage payload wiring |
| `document.updateStatus` | status value | — | request/status plumbing |
| `document.storeRejection` | — | — | rejection branch payloads |
| `document.split` | strategy, range settings | — | segment/context plumbing |
| `document.classify` | classification rules | — | segment/object plumbing |
| `document.splitAndClassify` | keyword patterns | — | segment plumbing |
| `document.validateFields` | validation rules | — | primary/attachment array mechanics |
| `segment.combineResult` | — | — | loop-internal join prep |
| `document.normalizeOrientation` | OSD threshold | — | orientation internals |
| `document.extractPageRange` | — | — | page-range wiring |
| `document.extractToBase64` | — | — | page-range wiring |
| `azureClassify.submit` | classifier | — | operation-id plumbing |
| `azureClassify.poll` | — | — | classification payload |
| `document.selectClassifiedPages` | target label | — | classifier payload structure |
| `document.flattenClassifiedDocuments` | filter labels | — | classifier payload structure |
| `data.transform` | input/output format, field mapping | XML envelope, source-slot details | raw slot bindings |
| `tables.lookup` | table, lookup, lookup arguments | — | tenant/group plumbing |
| `blob.read` | — | — | blob content plumbing |

---

## Control-flow exposure table

| Node type | Primary settings | Advanced settings | Hidden in simplified mode |
|---|---|---|---|
| `pollUntil` | poll interval | initial delay, max attempts, timeout | raw stop-condition wiring in template-fixed flows |
| `humanGate` | review timeout | on-timeout behavior | signal internals unless needed |
| `switch` | none by default | condition editor in detailed mode | branch expression plumbing |
| `map` | collection input | item variable name, max concurrency | body boundary IDs when inferable |
| `join` | wait strategy | results key | source-map linkage internals |
| `childWorkflow` | workflow picker | input/output mappings | mapping internals in simplified mode |

---

## Combination guidance

### Combine in UI, not runtime

- `file.prepare` → `azureOcr.submit` → `pollUntil(azureOcr.poll)` → `azureOcr.extract`
- `azureClassify.submit` → `azureClassify.poll`
- `ocr.cleanup` → optional correction chain → `ocr.checkConfidence`

### Already combined at runtime

- `mistralOcr.process`
- `document.splitAndClassify`

### Keep separate

- `document.selectClassifiedPages` and `document.flattenClassifiedDocuments`
- `blob.read` and `document.extractToBase64`
- branch-dependent flows such as `checkConfidence` → switch → review/store

---

## Non-author activities

Omit from workflow-author palette:

- all `benchmark.*` activities
- `getWorkflowGraphConfig`

---

## Next implementation focus

1. Enforce this exposure policy in simplified panels and schema-driven forms.
2. Build rich editors where raw JSON remains too heavy:
   - validation rules
   - split/classify patterns
   - correction rule configuration
   - tables lookup arguments
3. Finalize composite panels and palette curation.
4. Keep advanced bindings as the escape hatch, not the default surface.

---

## Related documents

- `WORKFLOW_SIMPLIFIED_VIEW_GUIDE.md`
- `WORKFLOW_NODE_CATALOG.md`
- `WORKFLOW_NODE_IO_MODEL_DECISION.md`
- `../graph-workflows/GRAPH_TYPES.md`
- `../workflow-config-overrides.md`
