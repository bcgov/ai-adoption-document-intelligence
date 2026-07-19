# Demo audit — findings (2026-07-18)

**Status: IMPLEMENTED (2026-07-18).** All findings below were fixed and verified — see the "Implementation status" section at the top for what landed and the one open catalog gap. The original work-list is retained below for reference.

---

## Implementation status (2026-07-18)

**Seed demos (`scripts/seed-feature-demos.mjs`) — all fixed, reseeded, browser-verified.** After reseeding, a headless badge-count pass over all 15 seeded demos returned exactly the expected counts with zero page errors: `autowire` 1 (Lone Submit), `ambiguous` 2 (sink ambiguity + Prepare B reachability), `validation` 1 (orphan), every other demo 0.
- **F1** ambiguous demo: `normB` (normalizeOrientation → DocumentRef) replaced with a second `file.prepare` ("Prepare B") so ambiguity actually occurs; steps updated.
- **F2/F3** `linearConfig` (node-settings, validation, versioning, library): fixed the `documentId→apimRequestId` mislabel; added a real `azureOcr.extract` so `store` consumes a genuinely-produced `ocrResult`.
- **F4** `edgesValidateConfig`: rebuilt as an honest chain `prep → submit → extract → checkConfidence → switch → {validateFields | store}`; `requiresReview` now produced by `ocr.checkConfidence`; fallback is `document.storeRejection` (was `ocr.cleanup` on a phantom `ocrResult`). `processedSegments` kept as the one declared trigger input (per decision).
- **F5** `conditionStepRefConfig`: `whenReady`→`azureOcr.submit` (consumes the prepared file), `whenMissing`→`document.storeRejection`; step-picker invariants on `prep`/switch untouched.
- **F6** control-flow: dropped the unused child `outputMappings`/`preparedDoc`; added an honesty note that branches deliberately dead-end (per "cheap honesty notes" decision).
- **F7** `groupingConfig`: fixed mislabel; chain re-ordered to `prep → submit → extract → cleanup → store`; the "OCR Model" exposed param now edits a real node parameter (`nodes.prep.parameters.modelId`); the decorative "Confidence Threshold" param dropped (per decision).
- **F8/F9** stale step text fixed (typed-io port/kind examples; node-settings "3 output ports"; autowire + ambiguous badge-click now describes the "Problems on <label>" drawer → "Pick a source →" flow).
- **F10** dynamic-node script now uppercases `fileName` (a real PreparedFile field), not the nonexistent `url`.

**Agent fixture (`scenario-1.json`) — patched config only (per decision):** declared `ctx.documentId` + bound `prepare1.documentId` so the flagship canvas is badge-clean. Transcript left as a dated historical capture (re-record when the agent stack resumes).

**Templates (`docs-md/graph-workflows/templates/*.json`) — all 8 fixed, all create-validate clean AND browser-verified badge-clean (0 node badges each on load).** Recurring stale patterns fixed everywhere: `azureOcr.poll` `response`→`ocrResponse` + added `status`→`ocrStatus` (condition retargeted to `ctx.ocrStatus`); dropped dead `documentId` inputs on poll/extract/cleanup/mistralOcr; `file.prepare` `modelId` input → node `parameters`; added required `documentId` binding; `ocr.checkConfidence` dead `threshold` input dropped; `spellcheck`/`characterConfusion` output `ocrResult`→`correctedResult`; `normalizeOrientation` dead `confidenceThreshold` input dropped; `azureClassify.poll` dead `constructedClassifierName` input dropped + required `modelId` bound to `constructedClassifierName`; `selectClassifiedPages` `targetLabel` bound; `splitAndClassify`/`tables.lookup` `groupId` bound (declared as a trigger-injected ctx key); `tables.lookup` dead `submissionDate` input dropped and its `tableId`/`lookupName` moved from `parameters` into real input-port bindings (they are required *ports*, not params — leaving them as params left an unsatisfied badge); "OCR Model" exposed params repointed to real `nodes.<prep>.parameters.modelId`, decorative "Confidence Threshold" params dropped. The template load+save round-trip test still passes.

**Env note (fixed during verification):** the running frontend dev server was serving a **stale vite dep-optimize cache** for `@ai-di/graph-workflow` (missing the taxonomy-wave export `resolveKindFamilyRoot`) — editing the template JSONs, which the frontend imports via `import.meta.glob`, triggered a re-optimize that surfaced it, breaking the editor for **all** workflows. The package `dist` was correct; fix was clearing `**/node_modules/.vite` + restarting `npm run dev:frontend`. Worth remembering: any edit to a globbed template/source can trip the stale-optimize gotcha.

**RESOLVED (2026-07-18, follow-up commit) — was a catalog mistype, not a real gap.** `ocr.normalizeFields` had been typed with input/output kind **`OcrFields`** — a schema-free subkind of `OcrResult` that **no activity produces** and that only this one activity referenced (`OcrTable` is a similar orphan). But its **runtime** ([apps/temporal/src/activities/ocr-normalize-fields.ts](../../apps/temporal/src/activities/ocr-normalize-fields.ts)) consumes and produces a plain `OCRResult` — identical to its siblings `ocr.cleanup` / `ocr.spellcheck` (both correctly typed `OcrResult`). So the `OcrFields` typing was simply wrong, making the activity un-wireable. **Fix:** retyped the two ports to `OcrResult` in [ocr-normalize-fields.ts](../../packages/graph-workflow/src/catalog/activities/ocr-normalize-fields.ts) (catalog-only; no runtime/migration change), then **restored** the `normalizeFields` node to both templates (in-place transform on `cleanedResultRef`, matching `characterConfusion`/`spellcheck`). Both templates now create-valid AND browser-verified badge-clean. The now-orphan `OcrFields`/`OcrTable` kinds were left in the registry (harmless; optional cleanup deferred).

**Note (not fixed, low priority):** the four `childWorkflow` nodes in `multi-page-report` map to library-child ports (`blobKey`/`documentId`/`modelId`/`confidenceThreshold` in, `ocrResult` out) that the referenced `standard-ocr-workflow` library does not formally declare via `metadata.inputs`/`outputs`; create-validation passes regardless. If strict library-port checking is later enforced, these mappings will need matching port descriptors on the child.

---

**Original work-list (below) — retained for reference; superseded by the status above.**

**Scope reviewed:** all 14 seeded feature demos in `scripts/seed-feature-demos.mjs`, the agent chat-log fixture `scripts/agent-demo-fixtures/scenario-1.json`, and the 8 user-facing templates in `docs-md/graph-workflows/templates/` (bundled into the **New from template** picker by `apps/frontend/src/features/workflow-builder/templates/index.ts` — they hydrate the editor as-is, so they are as user-facing as the demos; `multi-page-report-workflow.json` is MANUAL_TEST_PLAN's "master exemplar", §3.7).

**Ground truth:** the live activity catalog (`GET /api/activity-catalog`, backend of 2026-07-18, post kind-taxonomy wave). Key resolver facts used throughout (verified in `packages/graph-workflow/src/auto-wire/resolve-input-port.ts`):

- Typed ports auto-bind by kind (nearest unique assignable producer). Post-taxonomy, `DocumentRef` is **not** assignable to `PreparedFile` (siblings under Document).
- Base-`Artifact` identifier ports (`documentId`, `apimRequestId`, …) auto-bind **only** via a unique upstream output with the **exact same port name**; otherwise they are `unsatisfied` → amber problems badge when required.
- An explicit input binding to a **declared ctx key** counts as a source (no badge), even if nothing produces it — but a binding to a *wrong-meaning* key is exactly the "mislabeled key" fabrication class this audit targets.
- Clicking a node's problems badge opens the node-scoped **"Problems on <label>"** validation drawer (with a "Pick a source →" deep-link) — it does **not** open the source picker directly (`WorkflowEditorV2Page.tsx` `handleProblemBadgeClick`).

**Review bar (from Alex):** demos must be sensible to a first-time user and be something a user could plausibly build themselves — not just "passes validation". Anything needing new backend/frontend development is flagged as such and should be avoided if a rework can dodge it.

**Static analysis caveat:** badge predictions below are derived from the resolver code, not from loading each demo in a browser. The implementing agent must verify each demo's badge count in the browser after fixing (see Verification protocol at the end).

---

## Severity legend

- **HIGH** — demo's premise is broken, or a user-facing artifact teaches something false.
- **MED** — visible oddity (unexplained badge, nonsense chain) a first-timer will trip on.
- **LOW** — cosmetic / semantic polish.
- **DECISION** — needs Alex's call before implementing.

---

## A. Seed-script demos (`scripts/seed-feature-demos.mjs`)

### F1 · HIGH — "ambiguous" demo no longer demonstrates ambiguity
`ambiguousConfig` (≈ lines 201–246). Producer B is `document.normalizeOrientation` → `correctedBlobKey: DocumentRef`. Sink is `azureOcr.submit` whose `fileData` is `PreparedFile`. Post-taxonomy `DocumentRef` is not assignable to `PreparedFile`, so **prepA is the only candidate → `fileData` auto-binds, no ambiguity badge, the demo's entire story is false**. The matching e2e fixture was already fixed for exactly this (commit `6ba8f5fc` — two `file.prepare` producers); the demo was missed.

**Fix:** mirror the e2e fixture — replace `normB` with a second `file.prepare` ("Prepare B", inputs `documentId`+`blobKey` bound). Update the demo `steps`: producer names, the Validation-drawer quote, and note the reachability warning story (Prepare B as a second root still works if left unconnected-from-entry; keep the current "second root" shape). Re-verify the exact drawer wording after reseeding.

### F2 · HIGH — `linearConfig` binds `storeResults.documentId` to ctx key `apimRequestId`
Line ≈292: `{ port: "documentId", ctxKey: "apimRequestId" }` — the store node's *document id* reads the *APIM request id*. This is the canonical mislabeled-key fabrication (same class as the old part-4 `ocrResult` mislabel). `ctx.documentId` is declared right there; bind to it. **Same copy-paste bug in `groupingConfig`** (line ≈898).

Affects demos: **node-settings, validation, versioning, library** (all use `linearConfig`) + **grouping**.

### F3 · MED — `linearConfig` chain is not a sensible workflow
`prep → submit → store`: `ocr.storeResults.ocrResult` reads declared-but-never-produced `ctx.ocrResult`; the chain submits OCR and "stores results" that don't exist (no extract step). Passes validation; fails the first-time-user sensibility bar.

**Fix:** extend to `prep → submit → extract (azureOcr.extract) → store`. `extract.apimRequestId` auto-binds by name from submit; bind/auto-bind `store.ocrResult` from extract's `ocrResult`. Drop the now-unneeded phantom `ctx.ocrResult` (or keep `preparedFileData`/`apimRequestId` bindings as-is — the node-settings demo steps rely on `preparedFileData` and `myNewVar`; check each dependent demo's `steps` still read true, esp. versioning's v2-label diff and grouping's group membership.)

### F4 · MED — "edges-validate" demo: two unexplained amber badges + absurd fallback + phantom switch flag
`edgesValidateConfig` (≈ lines 593–736):
1. `store` binds only `ocrResult` — required `documentId` unbound, no upstream `documentId` output → **badge on "Store Results"** the steps never mention. Bind `documentId → ctx.documentId`.
2. `validateFields` binds only `processedSegments` — required `documentId` unbound → **second unexplained badge**. Bind it.
3. The error-edge fallback for a *file-prepare* failure is `ocr.cleanup` reading phantom `ctx.ocrResult` — nonsense. The catalog has the perfect real activity: **`document.storeRejection`** (`documentId → ctx.documentId`, `reason → ` a declared ctx key, e.g. `rejectionReason` — declared trigger input, honest).
4. `reviewSwitch` routes on `ctx.requiresReview`, which nothing produces. The real producer exists: `ocr.checkConfidence` (outputs `requiresReview`). Sensible rework: `prep → submit → extract → checkConfidence → switch`, with `checkConfidence` outputs `requiresReview → ctx.requiresReview`. (Grows the graph by 2 nodes; the demo's point — edge types + rule editor — survives intact.)
5. `validateFields.processedSegments` (`Segment[]`) has no real producer; producing real Segments needs the whole split/classify/combine chain (heavy). **Recommendation: keep it as a declared trigger-input ctx key** and add one guide-step sentence saying so. **DECISION** if Alex prefers the full chain instead.
6. Minor: `reviewSwitch` carries an `inputs: [{ port: "requiresReview", … }]` array — switch nodes have no catalog ports; verify whether this is dead config and remove if so.

### F5 · MED — "condition-step-ref" demo: nonsense branch targets + unexplained badge
`conditionStepRefConfig` (≈ lines 754–847). `whenReady` = `ocr.cleanup` on phantom `ctx.ocrResult`; `whenMissing` = `ocr.storeResults` with required `documentId` **unbound → unexplained badge**, also on phantom `ocrResult`.

**Fix (keeps the step-picker invariants intact — do not touch `prep`'s `__auto.prep.preparedData` output binding or the switch ref):**
- `whenReady` → `azureOcr.submit` — genuinely consumes `preparedData` (and reinforces the demo's own story: the ref points at prepared data, the ready branch uses it).
- `whenMissing` → `document.storeRejection` (`documentId → ctx.documentId`, `reason →` declared ctx key).

### F6 · MED + DECISION — "control-flow" demo is an intentional forms showcase, but several pieces are fake or dead
`controlFlowConfig` (≈ lines 370–587). This is the documented "all six control-flow node types in one graph" teaching fixture — full functional realism is impossible at this size, and that's acceptable **if the guide says so**. Specific issues:
1. The receipt branch polls (`azureOcr.poll`) and extracts an OCR job that **no node ever submitted** — `ctx.apimRequestId` is trigger-declared only.
2. `childOcr`'s `outputMappings: [{ port: "preparedData", ctxKey: "preparedDoc" }]` — the inline child's only node declares **no outputs binding**, so the mapping likely maps nothing (verify how childWorkflow output ports resolve for inline children). Either give child `c1` an `outputs: [{ port: "preparedData", ctxKey: … }]` binding or drop the mapping.
3. `preparedDoc` is consumed by nothing; `approve` (humanGate) and `childOcr` dead-end without reaching the map body's exit node.

**Recommended (cheap) path:** fix #2, and add one honest sentence to the demo's first step: this graph exists to show every control-flow *form*; branches deliberately dead-end and `apimRequestId` is assumed trigger-supplied. **Expensive alternative (Alex to decide):** restructure the map body into a real submit→poll→extract chain — invasive, and the field-drill-down step text (which references specific nodes) would need a careful rewrite.

### F7 · MED + DECISION — "grouping" demo: decorative exposed params + store-before-cleanup order
`groupingConfig` (≈ lines 854–945):
1. Exposed param **"OCR Model"** edits `ctx.modelId.defaultValue` — nothing consumes `modelId` (azureOcr.submit has no such port). **Fix without new development:** apply F3's chain (add `azureOcr.extract`, which has an optional `modelId` port) and bind `extract.modelId → ctx.modelId` → the param becomes real.
2. Exposed param **"Confidence Threshold"** edits `ctx.confidenceThreshold` — **no catalog activity consumes a threshold** (`ocr.checkConfidence` takes only `documentId`+`ocrResult`; several stale templates bind a nonexistent `threshold` port, see F10). Making this real **requires development** (add a `threshold` input to `ocr.checkConfidence`) — per Alex, avoid; **recommend replacing the param** with something real (e.g. expose `fileName` or drop to one group-param and adjust the "each with an exposed parameter" step).
3. Chain order `store → cleanup` is backwards (you clean before storing). With F3 applied: `prep → submit → extract → cleanup → store`, groups "OCR Extraction" = prep/submit/extract, "Finalize" = cleanup/store.
4. Inherits F2's `documentId → apimRequestId` mislabel.

### F8 · MED — guide-step factual errors (typed-io, node-settings)
These live in the demo `steps` arrays (regenerate the guide after editing — never hand-edit `FEATURE_DEMO_GUIDE.md`):
1. **typed-io** step 2 example tooltip `ocrResponse: OcrResult` — no such port/kind pair anywhere in this demo (`ocrResponse` is `azureOcr.poll`'s output, kind `Artifact`; poll isn't in the graph). Use a real one, e.g. `ocrResult: OcrResult` on Extract's output.
2. **typed-io** step 4: "Cleanup — … the `ocrResponse` input" — `ocr.cleanup`'s input port is **`ocrResult`**.
3. **node-settings** step 3: "this OCR node has one input port `fileData` and one output port `apimRequestId`" — `azureOcr.submit` has **three** output ports (`apimRequestId`, `statusCode`, `headers`); one output *binding* ≠ one port. Reword (the distinction is literally this step's teaching point).

### F9 · HIGH — badge-click steps describe removed behavior (autowire + ambiguous demos)
Steps claim the badge "opens the input's source picker directly" / "opens the producer picker straight away". Actual: badge → node-scoped **"Problems on <label>"** drawer → "Pick a source →" → picker. Fix both demos' `steps` (guide lines 59 and 72 are the generated mirrors). MANUAL_TEST_PLAN Part 8 didn't match my grep for those phrases, but the implementing agent should re-read MTP Part 8's badge steps for the same staleness.

### F10 · LOW — dynamic-node demo script reads a field that doesn't exist
`demoDynamicNodeScript()` (≈ lines 1236–1253): "Uppercases the documentUrl field", reads `ctx.document.url`. It's bound to a **PreparedFile** (`fileName, fileType, contentType, blobKey, modelId, outputFormat?` — no `url`), so it always returns `""`. Fix: uppercase `fileName` (rename description accordingly). Optionally declare `@inputs` kind `PreparedFile` instead of `Document` for shape-honesty (verify the dyn-node kind allowlist accepts subkinds first; `Document` still type-checks via baseKind).

### F11 · LOW (optional polish)
- **workflow-as-api**: `priority` field is declared but consumed by nothing (arguably fine — it showcases an optional schema field; could add a step sentence). The workflow ends at `prep`; appending `azureOcr.submit` costs zero bindings (auto-binds) and makes it look like a real pipeline start.
- **sources-upload**: same optional-`submit` idea; otherwise clean.

### Clean / keep as-is (intentional teaching fixtures — do NOT "fix")
- **autowire**: "Lone Submit (unsatisfied)" is the documented point.
- **validation**: the orphan node is the documented point.
- **try-preview** (`sourcePrepConfig`): honest, runnable without Azure — the model demo.
- **typed-io graph** itself is fully honest (`prep→submit→extract→clean`, all auto-binds work incl. `apimRequestId` name-match); only its step text needs F8.

---

## B. Templates (`docs-md/graph-workflows/templates/*.json`) — HIGH, biggest chunk

All 8 templates predate recent catalog waves and carry **dead bindings to ports that no longer exist**, plus unbound required ports. A first-time user loading them from the picker gets broken dataflow and (likely) problem badges. Mechanical scan vs the live catalog (implementing agent: re-run the same check after fixing; note this scan does **not** account for values supplied via `parameters` — e.g. `tables.lookup` correctly gets `tableId`/`lookupName` via `parameters` and `file.prepare` gets `modelId` via `parameters`, so verify per case whether a flagged port is truly broken or a parameters-vs-port mismatch):

Recurring stale patterns (fix once, apply everywhere):
- `azureOcr.poll`: input `documentId` (gone), output **`response` → real port is `ocrResponse`** — downstream `extract.ocrResponse` reads a ctx key nothing writes.
- `azureOcr.extract`, `ocr.cleanup`, `mistralOcr.process`: input `documentId` (gone).
- `ocr.normalizeFields` / `ocr.spellcheck` / `ocr.characterConfusion`: output bound as `ocrResult` → real ports are `normalizedResult` / `correctedResult`.
- `ocr.checkConfidence`: input `threshold` — port doesn't exist (see F7.2).
- `file.prepare`: input `modelId` (gone — modelId now rides inside PreparedFile via parameters); required `documentId` unbound in most templates (→ badge).
- `document.normalizeOrientation`: input `confidenceThreshold` (gone).
- `azureClassify.poll`: input `constructedClassifierName` (gone); required `modelId` unbound.
- `document.selectClassifiedPages`: required `targetLabel` unbound (check if `parameters` covers it).
- `document.splitAndClassify` (multi-page-report): required `groupId` unbound (groupId may be runtime-injected — verify how the runner supplies groupId before "fixing").
- `tables.lookup` (payment-lookup): input `submissionDate` — port doesn't exist (`parameters` already carries `tableId`/`lookupName`; required `groupId` may be runtime-injected — verify).

Priority order: **multi-page-report-workflow.json first** (MTP master exemplar, §3.7/§4.14), then standard-ocr family, then the rest. After fixing, each template should load badge-clean (or with badges the template's own description explains).

## C. Agent chat fixture (`scripts/agent-demo-fixtures/scenario-1.json`) — DECISION

1. The seeded workflow's `prepare1` binds only `blobKey` — required `documentId` unbound, no upstream name-match → **amber badge on the flagship "agent built this" demo canvas**.
2. The transcript embeds a **stale catalog snapshot** (5 mentions of `base64` / "Extract Pages to Base64" that no longer match the catalog).
3. The guide sells these as "transcripts captured from real live runs" — hand-editing the transcript would itself violate the no-fabrication rule.

Options for Alex: **(a)** re-record the scenario against the live agent (Azure gpt-5.4 stack; the agent-chat project's live phase is currently paused) — honest but heavier; **(b)** minimally fix only the *workflow config* (bind `documentId`) and leave the transcript as a dated historical capture, adding a guide sentence that the catalog has evolved since recording; **(c)** drop the agent demo until the agent project resumes. Recommendation: (b) now, (a) when the agent work resumes.

---

## Implementation order + verification protocol

1. **Seed-script fixes** (F1–F9, F11): edit `scripts/seed-feature-demos.mjs` only — `steps` arrays are the guide source; **regenerate** with `npm run seed:demos` (never hand-edit `FEATURE_DEMO_GUIDE.md`; that's how it went stale last time).
2. **Browser-verify every demo after reseeding** (auth bypass per `.claude/skills/app-browser-auth`): expected badge counts — autowire: exactly 1 (Lone Submit); ambiguous: exactly 2 (ambiguity on sink + reachability on Prepare B); validation: exactly 1 (orphan); **all other demos: 0**; zero `pageerror`s. Verify quoted drawer/tooltip strings in steps against the real UI.
3. **Templates sweep** (section B): fix, re-run the port-name scan, load each via New-from-template, verify badge-clean; re-check MANUAL_TEST_PLAN §3.7/§4.14 claims still hold.
4. **Dynamic-node script** (F10) — republish happens automatically on reseed.
5. **Agent fixture** per Alex's decision (section C).
6. Cross-check MANUAL_TEST_PLAN for text mirroring anything changed (Part 8 badge behavior, Part 5/6 chain descriptions, template node counts — §3.7 says "16 nodes"; my scan of multi-page-report shows the node list, recount after edits).

Open decisions for Alex: F4.5 (validateFields real-chain vs declared trigger input), F6 (control-flow: cheap honesty notes vs restructure), F7.2 (drop/replace the fake threshold param vs adding a real `threshold` port — new development, discouraged), section C option.
