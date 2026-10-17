# Typing waves — post-implementation review findings (2026-07-18)

> **STATUS: ALL RESOLVED (2026-07-18).** F1–F10 and cleanups C1–C7, C9, C10
> are fixed, with tests, in this branch. **C8** (stale
> `scripts/agent-demo-fixtures/scenario-1.json`) is intentionally deferred to
> the demo-fabrication audit / the parallel demo-workflow work.
> **F4** was resolved via the validator reserved-namespace guard rather than
> ref-prefixing (lower ripple; see the F4 entry). Suites after the fixes:
> graph-workflow **942** Jest, temporal **1073** Jest (+ clean tsc), frontend
> workflow-builder **1372** Vitest — all green; both apps + the package
> typecheck clean. Design-doc drift corrected in
> [KIND_TAXONOMY_REFINEMENT_DESIGN.md](KIND_TAXONOMY_REFINEMENT_DESIGN.md) §5/§6/§9/§13.

**Scope reviewed:** `git diff 3bb0b06c..HEAD` (~7,700 lines) — the two "better
typing" waves: **kind field schemas** ([KIND_FIELD_SCHEMAS_DESIGN.md](KIND_FIELD_SCHEMAS_DESIGN.md))
and **kind taxonomy refinement** ([KIND_TAXONOMY_REFINEMENT_DESIGN.md](KIND_TAXONOMY_REFINEMENT_DESIGN.md)),
plus the loop-variables follow-up (commit `70de8fcb`).

**How this review was produced:** 8 independent finder passes (line-by-line,
removed-behavior, cross-file, reuse, simplification, efficiency, altitude,
CLAUDE.md conventions) over the diff, then per-candidate verification against
the actual code at HEAD (call paths, seeds, runtime executors, validator).
Every finding below carries a verdict. **CONFIRMED** = reproduced against the
code; **PLAUSIBLE** = mechanism verified, impact depends on realistic-but-
unconfirmed state. Refuted candidates are listed at the bottom so nobody
"fixes" deliberate behavior.

**For the fixing agent:** work top-down (F1 → F10, then cleanups). Each item
has an acceptance check. Follow repo CLAUDE.md rules: update tests with every
backend change, run the affected suites (`packages/graph-workflow` Jest,
`apps/temporal` Jest, frontend Vitest), no `any`, no backwards-compat shims,
update docs in `/docs-md` where the fix changes documented behavior. Several
fixes below change kind tags or shared dispatch — re-run the taxonomy design's
§9 regression protocol (open seeded demos, list wiring changes) after F1/F7.

---

## Correctness findings

### F1. `segment.combineResult.currentSegment` over-narrowed to `TypedSegment` — valid loops now rejected — CONFIRMED

- **File:** `packages/graph-workflow/src/catalog/activities/segment-combine-result.ts:20`
- **Problem:** The runtime activity (`apps/temporal/src/activities/combine-segment-result.ts:22-33`)
  reads **no** TypedSegment-specific field — it spreads `currentSegment` and
  attaches `ocrResult`; it works for any segment shape. The design's own
  tagging rule (§2: "genuinely handles multiple shapes → keep the family tag")
  says this input must stay `Segment`. As tagged, `isAssignable` rejects
  `DocumentSegment` (parent-into-child) and `LabeledSegment` (sibling), so the
  documented patterns `document.split → map → … → segment.combineResult` and
  `flattenClassifiedDocuments → map → … → combineResult` no longer auto-wire
  or validate — the map item dims as incompatible and save-time validation
  errors — even though execution would succeed. (The multi-page-report
  template survives only because it happens to use `splitAndClassify`, which
  produces `TypedSegment[]`.)
- **Fix:** retag `currentSegment` back to `Segment` (family), per design §9:
  "fix the table (and tag), not the demo." Update the design doc's §5 Segment
  table row + its evidence column (the "inline duplicate of SegmentWithType
  shape" evidence describes the *declared type*, not what the code accepts).
  Also revisit the Temporal input type: `CombineSegmentResultInput.currentSegment: SegmentWithType`
  overstates the contract the same way; `DocumentSegment`-compatible or a
  minimal segment shape is honest (keep `combinedSegment`'s declared spread
  shape in sync).
- **Acceptance:** a graph `document.split → map(itemCtxKey) → segment.combineResult`
  auto-wires `currentSegment` and validates clean; sibling-rejection e2e still
  passes for genuinely-wrong pairs; graph-workflow Jest + temporal Jest green.

### F2. Node-card preview reads hardcoded flat ctx slots — empty preview for virtually every real producer — CONFIRMED

- **File:** `apps/frontend/src/features/workflow-builder/preview/PreviewWidget.tsx:160-185`
- **Problem:** `renderForOutputKind` now dispatches the *widget* by baseKind
  family (the dc6529c9 fix), but still reads the *value* from fixed slots
  `outputCtx.document` / `.ocrResult` / `.classification` / `.segments`.
  `outputCtx` is the nested ctx delta keyed by the producer's actual output
  `ctxKey` (`snapshotCtxDelta`, `apps/temporal/src/graph-engine/node-executors.ts:246`).
  Seeded producers bind `preparedFileData`, `preparedDoc`, `blobKey`,
  `documentUrl`, `__auto.prep.preparedData` — never `document` — so
  Document-family previews get `undefined` and render empty
  (`DocumentPreview.asDocument(undefined) → null`). Only ctxKeys literally
  named `ocrResult`/`segments`/`classification` ever show data. This is the
  same flat-lookup bug class as the Phase-4 wire-peek fix; the wave fixed
  dispatch but not the read. The new tests bake the shortcut in by fabricating
  rows like `buildRow("PreparedFile", { document: doc })` — a shape no real
  producer writes.
- **Fix:** resolve the producing node's output binding ctxKey for the
  previewed port and read via `resolveCtxBinding(ctxKey, outputCtx)` — exactly
  what `WirePeekPopover.tsx:144` already does. Rewrite the fabricated-row
  tests to use real binding-shaped `outputCtx`. Note: `DocumentRef` values are
  bare blob-key strings; `DocumentPreview` requires `{blobKey: …}` — either
  adapt the string into `{blobKey: value}` for `DocumentRef`-rooted kinds or
  return null explicitly for string-shaped subkinds (decide and document; do
  not leave it to the implicit shape-miss).
- **Acceptance:** with a run of the seeded OCR demo, the `file.prepare` node
  card shows a populated preview (and the wire peek and node card agree);
  Vitest preview suites green with realistic `outputCtx` fixtures.

### F3. Condition editor never resolves canonical `ctx.`-prefixed refs — seeded demos stuck in manual mode — CONFIRMED

- **Files:** `apps/frontend/src/features/workflow-builder/graph-widgets/condition-producer-binding.ts:96-127`
  (no `ctx.` strip), call site `ConditionExpressionEditor.tsx:855-864`
- **Problem:** seeds store condition refs in the canonical evaluator style —
  `ctx.ocrStatus`, `ctx.requiresReview` (`scripts/seed-feature-demos.mjs`) —
  and the evaluator documents `ctx.<key>` as a first-class namespace
  (`apps/temporal/src/expression-evaluator.ts:114`). `resolveCtxKeyToProducer`
  matches refs verbatim against producer ctx keys, so `ctx.ocrStatus` never
  matches producer key `ocrStatus`; `forcedManual` kicks in
  (`ConditionExpressionEditor.tsx:862`) and the resolved caption + field-drill
  UI never appear for exactly the refs the product's own seeds write. The
  sibling helper `splitKnownBase` (`variable-field-options.ts:49`) already
  strips `ctx.` calling it the seed/legacy style — the two resolvers disagree.
- **Fix:** strip a leading `ctx.` in `resolveCtxKeyToProducer` before
  matching (mirroring `splitKnownBase`), or normalize at the call site.
  Coordinate with F4's ref-emission decision so read and write sides agree on
  one canonical spelling.
- **Acceptance:** opening the seeded control-flow demo's `pollUntil`
  condition shows the resolved "node → port" caption and field autocomplete
  for `ctx.ocrStatus`; unit tests cover both spellings.

### F4. Editor emits bare refs that collide with evaluator namespaces (`segment.` / `doc.` / `param.` / `row.` / `ctx.`) — silent wrong value at runtime — CONFIRMED (mechanism)

- **Files:** `ConditionExpressionEditor.tsx:871` and `:960-963` (emits
  `baseKey` / `` `${baseKey}.${field}` `` with no namespace),
  `apps/temporal/src/expression-evaluator.ts:130-155`
- **Problem:** the evaluator switches on the FIRST dotted segment
  unconditionally — `segment.confidence` → `ctx.currentSegment.confidence`,
  `doc.x` → `ctx.documentMetadata.x` — with **no fallback** to a literal ctx
  key and **no validator rule** reserving those names (grep: `itemCtxKey`
  and reserved-name checks absent from `packages/graph-workflow/src/validator/validator.ts`).
  An author who binds an output to ctxKey `segment` or `doc` (natural names
  in this product) and picks a drilled field stores a ref the runtime
  resolves against a different object — wrong branch, no error.
- **Fix (pick one altitude, don't band-aid):** (a) emit `ctx.`-prefixed refs
  from the editor (canonical namespace; requires F3 so the resolver
  round-trips them), or (b) add a validator error/warning for output-binding
  and map `itemCtxKey`/`indexCtxKey` names whose first segment is a reserved
  namespace (`param`, `row`, `ctx`, `doc`, `segment`). Option (a) fixes the
  class; (b) alone leaves other bare-ref writers exposed. Doing (a) + (b) is
  defensible.
- **Acceptance:** a workflow with a producer bound to ctxKey `segment` either
  evaluates its drilled condition against `ctx["segment"]` correctly (a) or
  cannot be saved/edited without a clear diagnostic (b); temporal
  expression-evaluator tests updated accordingly.

### F5. Loop variables missing for map-body nodes on dead-end branches — picker disagrees with canvas AND runtime — CONFIRMED

- **File:** `apps/frontend/src/features/workflow-builder/graph-widgets/VariablePicker.tsx:103-130`
  (`loopVariablesInScope`)
- **Problem:** membership test = entry-is-ancestor **AND**
  `upstreamNodesWithDistance(config, bodyExitNodeId).has(currentNodeId)`.
  Body nodes that never reach the exit fail it. In the seeded control-flow
  demo (map `eachDoc`, bodyEntry `routeByType`, bodyExit `extractOcr`),
  `childOcr` and `approve` are dead-end branch nodes: the canvas body box
  includes them (`canvas/map-body-groups.ts:71-99` forward BFS),
  `analyzeMapBody` includes them (`settings/control-flow/map-body-analysis.ts:93-105`;
  dead-ends are a *warning*, not exclusion), and the runtime executes them
  with `itemCtxKey`/`indexCtxKey` in ctx
  (`apps/temporal/src/graph-engine/node-executors.ts:607-610, 1008-1034`).
  Only the picker excludes them — `currentDoc`/`docIndex` and their drill
  rows are silently absent on exactly those nodes (one of which *binds*
  `currentDoc.blobKey` in the seed). This is also the third hand-rolled
  body-membership algorithm in the codebase.
- **Fix:** replace the ancestor/upstream pair with the existing forward
  entry→exit BFS semantics — reuse `analyzeMapBody(...).bodyNodeIds` (or
  `collectReachable`) rather than writing a fourth variant.
- **Acceptance:** in the seeded control-flow demo, the picker on `childOcr`
  and `approve` shows the "Loop variables" group with `currentDoc` +
  `docIndex` and `currentDoc.*` drill rows; `variable-picker-scope` tests
  extended with a dead-end-branch case.

### F6. Map-item kind resolution is scope-blind and first-match — wrong kinds shown outside the owning map — CONFIRMED (mechanism) / PLAUSIBLE (impact)

- **File:** `apps/frontend/src/features/workflow-builder/graph-widgets/resolve-producer-kind.ts:152-197`
- **Problem:** `resolveMapItemKind` runs as precedence step 0 for **every**
  resolution, scans **all** map nodes, and `resolveProducerKindFor` takes no
  consumer node — so (a) a ctx key equal to any map's `itemCtxKey` resolves
  to that map's element kind graph-wide, shadowing a real catalog producer of
  the same key for nodes *outside* the body (the docstring's "the item key
  exists only inside the map body" is an unenforced assumption — no validator
  rule constrains `itemCtxKey` collisions at all); and (b) with two maps
  sharing an `itemCtxKey`, whichever map comes first in `Object.entries`
  order wins for both bodies.
- **Fix:** thread the consumer node id into `resolveProducerKindFor` (callers
  all have it: VariablePicker/`buildVariableOptions` know `currentNodeId`,
  the condition editor knows its node) and only apply the map-item unwrap
  when the consumer is inside that map's body — using the same body-set
  helper as F5. A validator rule flagging `itemCtxKey` collisions with other
  producers would also close (a) at the source; do it if cheap, but the
  scoped resolver is the primary fix.
- **Acceptance:** a graph with map(`itemCtxKey: "x"`) plus an activity
  writing ctx `x` elsewhere resolves `x` to the activity's kind outside the
  body and the element kind inside it; unit tests in
  `resolve-producer-kind.test.ts` cover both plus the two-map case.

### F7. Catalog retags hard-block saving pre-wave workflows (including unrelated edits) — CONFIRMED behavior, needs a product decision — PLAUSIBLE as a defect

- **Files:** `apps/backend-services/src/workflow/workflow.service.ts:727-738`,
  `packages/graph-workflow/src/validator/validator.ts:1472-1486`
- **Problem:** kind-mismatch findings are `severity: "error"`, kinds are
  resolved live from the retagged catalog, and `updateWorkflow` throws
  `BadRequestException` on any error — so a workflow saved before the wave
  whose wiring is now sibling-mismatched cannot be saved at all, even for
  unrelated edits. The design (§9) promised "keeps running + surfaces as
  invalid on next edit"; the actual behavior is a save wall. For genuine
  latent miswires this is arguably the honest outcome under the
  no-backwards-compat rule — **but** F1 shows at least one retag rejects
  legitimate wirings, and any future over-narrow has the same blast radius.
- **Fix:** first land F1 (removes the known false positive). Then make an
  explicit decision, recorded in the design doc: either keep the hard block
  (document it in §9 as intended), or downgrade *pre-existing* kind-mismatch
  findings on update to warnings while keeping them errors at creation/wire
  time. Do not silently leave the design doc claiming softer behavior than
  the code has.
- **Acceptance:** design doc §9 matches actual save behavior; if a downgrade
  is chosen, a service test proves an unrelated-edit save succeeds on a
  config with a pre-existing kind mismatch while the builder still shows the
  edge as invalid.

### F8. Two catalog activities now share the displayName "Extract Page Range" — CONFIRMED

- **Files:** `packages/graph-workflow/src/catalog/activities/document-extract-to-base64.ts:8`
  vs `document-extract-page-range.ts:8`
- **Problem:** the §6 honesty fix renamed `document.extractToBase64`'s
  displayName to exactly its sibling's. Palette, extend popover, and
  validation messages now show two identical entries with different ports —
  picking the wrong twin silently miswires.
- **Fix:** give `document.extractToBase64` a distinct honest name (e.g.
  "Extract Page to Blob" — it writes one page to a new blob and returns
  `pageBlobPath`/`pageIndex`/`byteLength`/`pageCount`). The activity *id*
  stays (persisted identifier, per design §6).
- **Acceptance:** no two catalog entries share a displayName (add a
  provider-catalog test asserting displayName uniqueness).

## Convention violations (repo CLAUDE.md)

### F9. `combine-segment-result` has no test at all — CONFIRMED

- **File:** `apps/temporal/src/activities/combine-segment-result.ts`
- CLAUDE.md: "When creating or updating backend code also create and update
  related tests." The activity was updated (inline interface → shared
  `SegmentWithType`) and is the only touched activity with no `.test.ts`.
  Add one (merge behavior, passthrough of extra fields — especially relevant
  if F1 loosens the input type). Run the temporal suite.

### F10. Dead type re-export left by the z.infer migration — CONFIRMED

- **File:** `apps/temporal/src/activities/split-and-classify-document.ts:5`
  (`export type { SegmentWithType };`)
- Zero importers consume it from this file (the barrel `activities.ts` does
  not re-export it; `combine-segment-result.ts` imports from
  `@ai-di/graph-workflow`). It is exactly the backwards-compat shim CLAUDE.md
  forbids and re-advertises the file as a type owner the wave just
  dispossessed. Delete the line. While there, check the sibling re-exports in
  `select-classified-pages.ts` / `flatten-classified-documents.ts`: they ARE
  consumed via the barrel today — leave them, but consider pointing the
  barrel at `@ai-di/graph-workflow` directly if it's a one-line change.

## Cleanups (verified, lower priority — batch after F1–F10)

- **C1. Shared `[]`-parse helper ignored (3 new copies).** `render-kind-value.tsx:53`,
  `PreviewWidget.tsx:164-165`, `resolve-producer-kind.ts:169-170` each
  hand-roll `endsWith("[]")` + `slice(0, -2)`;
  `canvas/artifact-kind-colour.ts` exports `splitKindRef`/`elementKindOf`
  whose docstring exists to prevent exactly this drift. Use the helper.
- **C2. Mirrored family switches in the preview path.** `PreviewWidget.renderForOutputKind`
  (family→ctx-slot) hand-mirrors `renderKindValue` (family→widget) with a
  comment claiming they "can never drift" — they are two switches. F2's fix
  (resolve value by binding, not slot) should delete the slot switch
  entirely; if any mapping remains, make it one shared table.
- **C3. `familyRoot` has a diverging sibling.** `render-kind-value.tsx:24`
  walks the LIVE registry; `settings/kind-select-options.ts:64` (`familyFor`)
  walks frozen `ARTIFACT_REGISTRY` with hardcoded family names — the two
  disagree for dynamically-registered kinds, and this is the codebase's
  fourth baseKind walk. Export one family-root helper from the package (next
  to `getArtifactKindMeta`) and use it in both frontend sites.
- **C4. Picker hot-path recomputation.** The typed-I/O block
  (`VariablePicker.tsx:306-322`) rebuilds `flatCtxKeys`/`knownBaseKeys`/
  `entries` and re-runs `sortVariablesByCompatibility` on every render with
  no `useMemo`, and re-resolves kinds that `expandVariableOptions` already
  stored in `pathMeta` (`meta.set(key, {kind}` at
  `variable-field-options.ts:134-139`); `expandVariableOptions`'s memo keys
  on `value`, so its O(keys×nodes) `resolveProducerKindFor` scans re-run per
  keystroke; step-0 map scan (F6) sits in the same loop. After F6's
  refactor: read base kinds from `pathMeta`, memoize the entries+sort on
  `[groupedOptions, pathMeta, expectedKind]`, and consider a module-level
  cache in `resolveKindFields` (registry is append-only). Real but modest at
  current graph sizes — correctness items above come first.
- **C5. `producerKind` ternary duplicates `resolveValuePathKind`.**
  `VariablePicker.tsx:314-317` — the `includes(".")` split re-implements what
  `resolveValuePathKind` already does for both shapes (exact-base dotted keys
  like `__auto.n1.result` resolve correctly through `splitKnownBase`), and
  the only production `resolveProducerKind` prop caller
  (`NodeSettingsPanel.tsx:878`) passes the identical fallback. Simplify to
  one call; consider dropping the prop.
- **C6. Dotted BASE keys get a spurious field-style caption.**
  `VariablePicker.tsx:244-253` uses "contains a dot" as the drilled-row test,
  so `__auto.<node>.<port>` base rows print a caption, contradicting the
  documented "base keys get no caption" contract. Discriminate on
  membership in the drilled-row set (or `pathMeta` row type), not on dots.
- **C7. Trailing-dot ref edge.** `condition-producer-binding.ts:105` accepts
  `ocrResult.` as a drilled ref with `fieldPath: ""`; the editor then shows a
  resolved caption ending in "· " while the persisted ref evaluates to null
  at runtime (`traversePath` with an empty segment). Treat an empty
  `fieldPath` as unresolved (or normalize the stored ref).
- **C8. Stale agent-demo fixture.** `scripts/agent-demo-fixtures/scenario-1.json`
  still advertises pre-retag kinds (`fileData: Document`,
  `currentSegment/combinedSegment: Segment`, …, ~20 hits) — a replayed
  transcript now demonstrates behavior the builder no longer has. Regenerate
  the fixture against the live catalog (fold into the planned post-taxonomy
  demo audit).
- **C9. Duplicate "(regression guard)" tests.**
  `render-kind-value.test.tsx:136-154` re-assert earlier tests in the same
  file verbatim. Fold the one new assertion (`Reference` → null) into the
  original tests and delete the copies.
- **C10. String-shaped subkinds are invisible to field schemas.**
  `zod-to-fields.ts:66-70` — the `string` case never consults `kindSchemas`,
  so a field can never be declared a `DocumentRef`/`DocumentContent`/
  `ClassificationLabel` (e.g. `PreparedFile.blobKey` IS a DocumentRef at
  runtime but drills as untyped string, losing compat-sorting one level
  deep). Also, registering a string schema in `KIND_SCHEMAS` today is
  *silently ignored* — contradicting the converter's fail-loud philosophy.
  Low priority; if deferred, at least make the string case throw or warn on
  a registered-schema identity hit, and note the deferral in the design doc.

## Refuted candidates (do NOT "fix" these)

- **`source.upload` dropping `format: "uri"`** — deliberate honesty fix
  (design §6.2): the stored value is a blob key; the annotation was the lie.
- **`listProvidersForKind` returning `[]` for `Document`/`DocumentRef`** —
  honest under the new taxonomy (OCR providers genuinely accept only
  `PreparedFile`); no in-repo caller exists. Revisit UX (e.g. "insert
  file.prepare" suggestion) when the Phase-5 provider-swap consumer lands.
- **`TypedSegment` registering full extend-schema fields alongside
  `baseKind`** — defensible single-source derivation; the dedupe is
  documented and tested. Splitting "own" fields out would create its own
  drift risk against the extend-schema.
- **Loop-variable BFS cost** — memoized on `[config, currentNodeId]` and
  short-circuited; immeasurable at realistic sizes.
- **`deep` Map in `expandVariableOptions` holding ≤1 entry** — style only.

## Bird's-eye assessment

The core architecture is sound and shipped at the right altitude: Zod schemas
as the single source (`kind-schemas.ts`), identity-based kind references,
`z.infer` adoption in Temporal, fail-loud `zodToFields`, bounded baseKind
walks, and honest family-vs-subkind tagging follow the design docs closely.
The retag table's per-port evidence discipline mostly held — F1 is the one
row where declared-type evidence was mistaken for accepted-shape evidence.

The consistent failure *pattern* — worth reading before fixing, because it
predicts where the next bugs are — is that **the package layer got the
general mechanism, while frontend surfaces re-derived local approximations
of it**:

1. Three new hand-rolled `[]` parses next to an existing shared helper (C1);
2. a fourth baseKind walk (C3) and two family switches promised never to
   drift (C2);
3. a third map-body-membership algorithm that contradicts the other two AND
   the runtime (F5);
4. two ref-spelling conventions (`ctx.`-prefixed vs bare) with resolvers and
   emitters split across both, colliding with evaluator namespaces (F3/F4);
5. a value-read that didn't adopt the already-proven `resolveCtxBinding`
   pattern from the wire-peek fix in the same wave (F2).

The systemic fixes are consolidation, not new abstraction: one body-set
helper, one family-root helper, one kind-literal parser, one ref spelling,
one ctx-value reader. All already exist — the fixes point surfaces at them.

Design-doc drift to correct while fixing: §9's "keeps running / surfaces on
edit" understates the save-block (F7); §12's claim that subkind previews
render is only true for lucky ctxKey names (F2); §5's combineResult row (F1).
