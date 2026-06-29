# Extraction-Engine Experiment Stack (#155–#184) — Code Review

**Reviewed:** 2026-06-27 · **Scope:** production-affecting system code and per-workflow/unit tests only.
**Out of scope (ignored):** everything under `experiments/`, `data/datasets/`, `apps/temporal/src/scripts/`, benchmark-result JSONs, generated reports, and stale rebase noise.

Design spec: `docs/superpowers/specs/2026-05-08-extraction-experiments-design.md` (lives on the branches, not `develop`).

---

## 1. What this stack is

A linear git stack of DRAFT PRs that runs an **extraction-engine bake-off**: it pits the existing Azure DI template pipeline against five alternative OCR/extraction engines on hard handwritten forms, scores each against ground-truth with a schema-aware evaluator, and ends with a real client feature (SDPR human-in-the-loop inline editor). All branches were rebased onto current `develop`, so each branch's diff vs its stack parent is clean.

```
develop
 └─ feature/extraction-experiments  #155  foundation: AOAI-deployments endpoint, benchmark module, enrich-results ref-port migration
     └─ experiment/01-neural-doc-intelligence       #156  E01  worker.ts dev-ergonomics + e2e test (no new engine)
         └─ experiment/02-mistral-doc-ai-azure       #157  E02  Mistral on Azure Foundry engine
             └─ experiment/03-content-understanding   #158  E03  Azure Content Understanding engine
                 └─ experiment/04-vlm-direct           #159  E04  VLM-direct engine
                     └─ experiment/05-vlm-ocr-hybrid     #160  E05  VLM + OCR hybrid engine + azureOcr.readPlain activity
                         └─ improve/01-strict-eval...     #161  schema-aware-evaluator (new) + mistral tune
                             └─ improve/02-...             #162  dataset/GT cleanup only — NO system code (skipped)
                                 └─ improve/03-ensemble     #163  schema-aware-evaluator evolution
                                     └─ experiment/07-gpt-4o  #164  model-config swap only — NO system code (skipped)
                                         └─ experiment/08-gpt-5.2  #165  schema-aware-evaluator final form + graph-workflow.ts bugfix
                                             └─ experiment/09-sdpr-hitl  #184  SDPR HITL inline canvas-overlay editor
```

### The shared engine contract

Every engine is a **Temporal activity** that takes a document blob + a template's `field_schema` and returns the system's canonical `OCRResult` shape (`pages[].words[]/lines[]`, `keyValuePairs[]`, `documents[0].fields{}`, each with polygons + confidences). This lets all five engines plug into the same `graph-workflow` pipeline and the same downstream HITL confidence gate (`check-ocr-confidence.ts`). The engines live under `apps/temporal/src/ocr-providers/<engine>/` and follow a consistent internal split:

- `*-types.ts` — provider response types
- `*-prompt-builder` / `*-schema-builder` — turns field defs into the engine's request
- `*-extract` / `*-process` — the activity entry point (blob → engine call → convert)
- `*-to-ocr-result` — converts engine output into the shared `OCRResult`

### Wiring: the activity-registration "three places" and how they stay aligned

An activity type appears in **three** source lists by design — this is the consolidation pattern, not an accident:

1. `apps/temporal/src/activity-registry.ts` — the runtime registry: `register({...})` with the real activity fn + per-activity timeout/retry policy. **Source of truth for runtime behaviour.**
2. `apps/temporal/src/activity-types.ts` `REGISTERED_ACTIVITY_TYPES` — a **workflow-safe** constant (literally a string array, no Prisma/activity imports). It exists separately *on purpose*: Temporal **workflow** code runs in a deterministic sandbox and **cannot import the activity registry** (which pulls in Prisma and other Node-only deps), so `graph-schema-validator` / `node-executors` validate a node's `activityType` against this lightweight mirror instead.
3. `apps/backend-services/src/workflow/activity-registry.ts` `REGISTERED_ACTIVITY_TYPES` — backend-side metadata, used to validate graph definitions before a workflow is started.

**They are kept aligned by cross-check tests, not by a single shared source** — so yes, there was a deliberate consolidation, but it's test-enforced rather than a literal merge into one file (the sandbox-isolation constraint above is why they can't simply be one import). The two guard tests are:

- `apps/backend-services/src/workflow/activity-registry.spec.ts` — asserts `Object.keys(REGISTERED_ACTIVITY_TYPES)` has **exactly** `EXPECTED_ACTIVITY_TYPES.length` (`toHaveLength`) **and** every expected type is present. This is a strict bijection check.
- `apps/temporal/src/activity-registry.test.ts` — asserts the runtime registry **contains** every `EXPECTED_ACTIVITY_TYPES` entry, but with `toBeGreaterThanOrEqual` / subset semantics (`registry.size >= EXPECTED.length`).

New activity types added by the stack: `mistralAzureOcr.process`, `azureContentUnderstanding.deployAnalyzer`, `azureContentUnderstanding.analyze`, `vlmDirect.extract`, `vlmOcrHybrid.extract`, `azureOcr.readPlain`. Retry policies are deliberately tuned per quota model (Foundry ~10 RPM engines get `30 attempts × 15s × 1.5 × 60s`; the DI read-plain pre-pass gets a lighter `5 × 5s`).

**Alignment status (verified):** all six new activities are correctly wired into all **three production lists** — the `azureContentUnderstanding.analyze` path, the `vlm*` paths, and `azureOcr.readPlain` are present in the runtime registry, the workflow-safe constant, and the backend metadata, and the strict backend spec **passes**. So the functional wiring is fully in alignment.

> 🟢 **W1 — temporal test fixture is stale (minor).** Because `apps/temporal/src/activity-registry.test.ts` uses subset/`>=` semantics (unlike the backend spec's exact `toHaveLength`), its `EXPECTED_ACTIVITY_TYPES` fixture was **not** updated when E05 (#160) added `azureOcr.readPlain` and `vlmOcrHybrid.extract` — and it is also missing the pre-existing `benchmark.flattenPredictionFromRefs` (a develop-side gap, not introduced here). The test still passes, so these activities simply have **no registration-test coverage on the temporal side**, and the temporal cross-check is one-directional (it can't catch a registry that has drifted *ahead* of the fixture). *Fix: add the two E05 activity types (and `benchmark.flattenPredictionFromRefs`) to `EXPECTED_ACTIVITY_TYPES`, and consider switching the size assertion to exact to match the backend spec's strictness.* This is a test-coverage gap only — production wiring is correct.

---

## 2. Per-engine deep dive

### E02 — Mistral on Azure Foundry (`ocr-providers/mistral-azure/`, #157)
The base `ocr-providers/mistral/` provider already landed on `develop` (public Mistral Document-AI). This PR adds the **Azure Foundry-hosted** variant: same Document-AI annotation API, but Bearer-auth to a Foundry deployment, with `confidence_scores_granularity` omitted (Foundry returns 422 on it) and `validateStatus: status === 200`. The `*-to-ocr-result` and `field-definitions-to-mistral-annotation-format` helpers are shared with the base provider. Bbox→polygon math, request construction, and deployment-id resolution are **correct**.

### E03 — Azure Content Understanding (`ocr-providers/azure-content-understanding/`, #158)
The most complex engine. Azure Content Understanding (CU) is a managed "analyzer" service: you register a named analyzer whose schema describes the fields you want, then submit a document and CU returns those fields plus an OCR/markdown layer. Unlike the prebuilt DI models, the *schema is yours* — so the engine has to build, deploy, and version an analyzer per template before it can extract.

The CU activity (`azureCuAnalyze` in `azure-cu-analyze.ts`) runs as **two registered activities** — `azureContentUnderstanding.deployAnalyzer` and `azureContentUnderstanding.analyze` — but in practice the analyze activity orchestrates the whole sequence. Step by step (`azure-cu-analyze.ts`):

1. **Resolve the analyzer id** (`:268-276`). Either an explicit `analyzerId`, or a deterministic id derived from the template (`defaultAnalyzerIdForTemplate`), or a prefix-based default. Deterministic ids are what make redeploys idempotent.
2. **Mock short-circuit** (`:288-306`). If `MOCK_AZURE_CU=true`, build a canned operation response and map it — lets tests run the full mapper without a live CU endpoint.
3. **Build the analyzer schema from the template** (`:324-337`, via `analyzer-schema-builder.ts`). The template's `field_schema` rows are translated into CU's field-schema JSON: each field → a CU type (string/number/date/selectionMark/…), with optional field descriptions, a `numericFieldsNullable` hint, and an optional `documentAnnotationPrompt`. If no template is supplied, it falls back to the base analyzer (CU still returns OCR markdown, just no structured fields). The builder also produces a **stable hash** of the schema so deploys can detect "already current."
4. **Deploy the analyzer (idempotent PUT)** (`:339-348`, `azure-cu-deploy-analyzer.ts`, the `deployAnalyzer` activity). It PUTs the analyzer definition to the CU control plane. An **in-memory cache + a GET probe** (`analyzerDefinitionMatches`) short-circuit the no-op case so repeated runs over a 33-sample benchmark don't redeploy every time. Short timeout, 3 attempts.
5. **Read the document blob and inline it** (`:360-361`). The blob is read and base64-inlined into CU's `AnalysisInput` as `{ data, mimeType }`, avoiding a separate public-URL upload.
6. **POST analyze** (`:366-368`). Submits to `cuAnalyzeUrl(analyzerId)`. CU normally replies **202 Accepted** with an `operation-location` header (async). Some CU rollouts reply **200** with the result inline — handled at `:387-409` as a synchronous success. *(This inline-200 branch is mis-shaped against the actual sync response type — see bug B2 — and the no-`operation-location` fallback polls a fabricated id — bug B3.)*
7. **Poll until terminal** (`:424-466`). GETs the operation/result URL on an interval up to `pollMaxAttempts`. Network errors and `5xx`/`429` are warned-and-retried (`continue`); other non-200s throw; a `200` body's `status` is inspected. On `Succeeded` it maps `body.result` (`:470+`); a terminal `Failed`/timeout throws.
8. **Convert to `OCRResult`** (`cu-to-ocr-result.ts`). CU's `contents`/`fields`/markdown are mapped into the canonical `pages`/`keyValuePairs`/`documents[0].fields` shape (`rawValueFromCuField` picks the right CU value slot per type; markdown becomes the page text/lines). The raw CU operation is also returned as `ocrResponse` so the sync-provider OCR cache can persist it.

The schema builder is solid and well-tested; the **analyze + poll** path (steps 6–7) carries the most correctness risk in the whole stack (B2/B3/B6).

#### What "deploy the analyzer" actually means (and the multi-user implications)

An **analyzer** is a **named, server-side resource that lives on the Azure CU account** — addressed in the URL as `/contentunderstanding/analyzers/{analyzerId}`. It is *not* an LLM you pick at call time; it's a saved **extraction configuration** bundle: a base model (`baseAnalyzerId`), the **field schema** (which fields to pull out, built from your template), and some config. "Deploying the analyzer" = registering/updating that named bundle on CU (an upsert PUT) so you can then call `{analyzerId}:analyze` against it. The closest thing to "the model CU is using" is the `baseAnalyzerId` inside that bundle; the rest of the bundle is "what to extract and how." You can't analyze with a custom schema without first deploying an analyzer that contains it — hence the deploy step before every analyze.

**The id is derived per *template*, not per user or per run** (`azure-cu-analyze.ts:205-208`):
```
analyzerId = sanitize( <AZURE_CU_ANALYZER_PREFIX or "di-experiment"> + "-" + templateModelId )
sanitize = lowercase, then strip everything that isn't [a-z0-9]
```
The deploy happens **inside the `analyze` activity, per document** — there is no separate "deploy once" node in the workflow graph. Implications:

- **Not a cross-tenant problem.** Templates (and their ids) are per-tenant, so two different tenants never derive the same `analyzerId` and never share an analyzer. A tenant edits and runs *their own* template.
- **Same template, unchanged schema → no-op.** Concurrent runs compute the same `bodyHash`, so after the first deploy the rest hit the "remote match / cached" no-op path. The deploy is idempotent for exactly this reason (the benchmark fans out ~33 at once).
- **The only real edge is concurrency right after a schema change (transient, not tracked).** CU can't PATCH a field schema, so a change forces a **DELETE-then-PUT**. Because deploy is per-document, the *first batch after an edit* fans out into many concurrent deploys that all see the change and race to recreate the one analyzer (`409 ModelExists` / mid-delete `404` / `ScenarioNotReady`), which can exhaust the 3-attempt deploy retry under a wide fan-out. It self-heals once one worker wins and the rest no-op, and Temporal retries cover most of it — so this is a transient first-batch nuisance, **judged not worth tracking** for the current usage (sequential or modest-fan-out runs over stable templates). If CU ever becomes a high-concurrency production path, the hardening would be: make the inline deploy concurrency-safe (treat `409`/`ScenarioNotReady` as "another worker is deploying — wait and retry" rather than a destructive recreate), optionally with content-addressed analyzer ids (name-by-schema-hash) so the recreate is never destructive.

### E04 — VLM-direct (`ocr-providers/vlm-direct/`, #159)
Sends page images straight to a vision LLM (Azure OpenAI chat-completions, strict-JSON `response_format`) with a prompt built from field defs, then parses the JSON into `OCRResult`.

#### How VLM-direct produces confidence scores — explained simply

**The problem.** Everywhere else in the system, the OCR engine hands back a **confidence** number for each value it read (e.g. "I'm 0.98 sure this digit is a 7"). The system leans on that number for one important decision: an activity called `ocr.checkConfidence` averages the confidences for a document, and **if the average is below 0.95 it sends the document to a human to review** (HITL). High confidence → auto-accept; low confidence → human checks it.

A vision LLM doesn't give you that number. If you just ask it "how confident are you?", it makes up a number that sounds reasonable but means nothing. So we can't trust a self-reported confidence.

**The trick this engine uses.** Instead of asking the model how sure it is, we ask it to **show its work**. For every field, the model must return *two* things:
1. the **value** it extracted, and
2. a **`source_quote`** — the exact words/text on the form it read that value from.

Then we **ignore whatever the model says about confidence and look only at whether it provided a quote**:

| Did the model give a source quote for this field? | Confidence we assign |
|---|---|
| Yes — a real, non-empty quote | **0.95** (`CONF_WITH_EVIDENCE`) |
| No — quote is empty/missing/blank | **0.50** (`CONF_NO_EVIDENCE`) |

(`vlm-to-ocr-result.ts:194-197`.) The two numbers are picked **on purpose** relative to the 0.95 review threshold: 0.95 sits right *at* the line (a field with evidence stays "good"), and 0.50 sits *well below* it (a field with no evidence is "suspicious").

**How that becomes a document decision.** For each field we stamp this 0.95-or-0.50 onto the field, then take the **plain average across all fields** to get the page's confidence (`:272-307`). That average is what `ocr.checkConfidence` reads. So:
- Model quoted a source for most fields → average near 0.95 → **auto-accept**.
- Model couldn't point at evidence for lots of fields → average drops toward 0.50 → **falls under 0.95 → routed to a human**.

**Why this is clever.** When a VLM *hallucinates*, it typically invents a value it can't actually point to on the page — i.e. it can't produce a real quote. By tying confidence to "did you show me where you got this?" instead of "how sure are you?", an un-evidenced (likely hallucinated) answer **automatically** drives the document to human review. We turned a thing the model lies about (confidence) into a thing it can't easily fake (a verbatim quote that has to match the page).

**The one caveat.** A field that's *genuinely blank* on the form also has no quote, so it scores 0.50 too — which can push an otherwise-perfect document into human review unnecessarily. That's a known, accepted trade-off (documented in the engine's SUMMARY). Separately, note that E05's hybrid engine **accidentally breaks this whole mechanism** — see bug **B1** — because it lets the real OCR's high word-confidences flood the average and drown out these 0.50 signals.

### E05 — VLM + OCR hybrid (`ocr-providers/vlm-ocr-hybrid/` + `activities/azure-di-read-plain.ts`, #160)
Two-leg pipeline: (1) `azureOcr.readPlain` runs Azure DI prebuilt-layout to get markdown + polygons; (2) the markdown + page images go to the VLM with a "trust hierarchy" prompt, and the response is mapped back to `OCRResult`. Reuses E04's evidence-confidence synthesis. Introduces a third copy of the DI submit+poll logic.

#### The "trust hierarchy" prompt — what it is and why

In E04 (VLM-direct) the model gets **only the image**. In E05 the model gets **two views of the same form**: the **OCR markdown** (what Azure DI transcribed) *and* the **page image**. Giving it both raises an obvious question — *what should the model do when the two disagree?* (DI might read a handwritten `4` as a `9`, miss a checkmark, or drop a zero.) The "trust hierarchy" is the explicit rule in the prompt that answers it: **the image is the source of truth; the OCR text is only a helper.** (`vlm-hybrid-prompt-builder.ts`.)

Concretely, the prompt is built in two parts:

- **System message** (`HYBRID_SYSTEM_PREAMBLE`, lines 27-33) tells the model it will receive an OCR markdown rendering *and* an image of the same form, and then states the hierarchy in plain terms: *"The OCR text is auxiliary context… **The image is the source of truth.** When the OCR text and the image disagree on a value (digits, characters, checkboxes, signatures), trust what you see in the image and ignore the OCR text."* It even lists the **common OCR error patterns to override** — digit confusion (4↔9, 8↔3), missed punctuation, misread checkboxes, dropped/added zeros — and adds a "be conservative: don't guess values that aren't visibly on the form" guardrail.

- **User message** (`HYBRID_USER_DIRECTIVE`, lines 35-41) inlines the actual OCR text inside `<ocr_text>…</ocr_text>` delimiters (so the model can clearly tell the auxiliary text apart from the instruction), then re-states the rule and asks for the same `{value, source_quote}` per field as E04 — crucially requiring the **quote to come from the image, even when the OCR text differs**. The image itself is attached as a separate `image_url` content part after this text.

**Why bother giving it the OCR at all, if the image wins?** The markdown gives the vision model **structure and locator hints** — field labels, table/column layout, reading order — which a raw image alone makes the model work harder to recover. So the design is: *use the OCR to find and organize fields quickly, but read the actual values off the image.* That's the "hierarchy" — both inputs, ranked, with the image on top.

Implementation note: E05 **reuses E04's JSON schema and `response_format` verbatim** (`buildVlmExtractionRequest`) and only swaps the message text — so the evidence-based confidence mechanism (above) is identical. It *prepends* the hybrid preamble and *appends* the caller's SDPR-specific global instruction (column conventions, blank-vs-zero rules), so those survive from E04's tuning. (Minor wrinkle: the hybrid passes all options into the base builder, which builds a system prompt it then discards and rebuilds — harmless wasted work.)

### E01 (#156)
No new engine. Adds an end-to-end test for the existing neural DI path plus `worker.ts` dev-ergonomics: closes the native Temporal connection and `process.exit(0)/(1)` on drain so `ts-node-dev --respawn` sees the child exit. Harmless in production (only fires after graceful drain).

---

## 3. The schema-aware evaluator (`evaluators/schema-aware-evaluator.ts`, #161/#163/#165)

### What it is and why it exists

It is the **benchmark scoring engine** — a `BenchmarkEvaluator` that, given one document's engine output and the labelled ground-truth, walks the fields and produces **precision / recall / F1** (plus checkbox accuracy and per-field match detail). It is *not* part of the live extraction pipeline; it runs as the `benchmark.evaluate` activity during a benchmark run. Without it you'd have raw engine outputs but no objective, per-field number to compare engines by — which is the entire point of the bake-off (and of the benchmarking system generally).

**Origin vs. evolution.** The evaluator was **originally created for the benchmarking system** (feature `003-benchmarking-system`, user story **US-015**, requirements §5.2 — both referenced in the file header), *before* the experiments. US-015's purpose: "evaluate workflow outputs against structured ground truth using field-level comparison, so I can measure extraction accuracy with precision/recall/F1 per field," with configurable per-field matching rules (`exact`, `fuzzy`/Levenshtein, `numeric` tolerance, `date` normalization, `boolean`/checkbox). The **experiment stack then evolved it heavily** for hard handwritten forms — git history shows the experiment commits adding: one-of GT alternates (`improve(eval+e02): one-of GT support`), `:garbled:` wildcard sentinels + signature presence-only matching + newline-stacked numerics + hyphen/space text equivalence (`evaluator + promote: signature presence-only, :garbled: wildcard…`), and a correction of the FP/FN definitions to match standard OCR-extraction metrics (`evaluator: fix FP/FN…, recompute all reported numbers`). So #161/#163/#165 don't invent it — they harden it for messy real-world GT.

### Why the format-variant normalization

Handwritten-form ground-truth and engine output legitimately **differ in formatting without either being wrong**: a date labelled `2024-01-15` vs. an engine's `01/15/2024`; an amount `1,234.56` vs. `1234.56`; `Yes` vs. `true` vs. a ticked checkbox; trailing whitespace / case differences; a value the model stacked across two lines. A naïve string-equality scorer would mark all of those as misses and make every engine look terrible. So before comparing, the evaluator canonicalizes per the field's matching rule (date → calendar parts, number → strip separators, boolean → parse truthy tokens, etc.), and adds **domain escape hatches** for labelling reality:

- **`:garbled:` wildcard** — labellers mark an unreadable handwritten cell `:garbled:`; the evaluator treats that field as unscored (any prediction matches) so it neither rewards nor punishes the engine for an unscoreable cell.
- **Presence-only fields** (`signature`, `spouse_signature`) — handwriting can't be character-matched, so it scores *did the engine produce a value where one was expected, and stay blank where the form was blank* instead of literal equality.
- **One-of alternates** — GT can be an array of acceptable values (`["", "0"]` meaning "blank or zero is fine").
- **null-like equivalence** — `null` / `undefined` / `""` / the string `"null"` are all treated as "no value."

### When you'd use it

Select `schema-aware` as a benchmark project's evaluator when your ground-truth is **structured key/value fields** (the IDP extraction case) and you want per-field P/R/F1 with format tolerance — i.e. virtually every extraction benchmark here. The sibling evaluators target other shapes: `black-box-evaluator` (deep-equality/diff of arbitrary JSON, no field semantics) and `ocr-correction-evaluator` (character/text-level OCR accuracy). 

> ⚠️ **Know its real boundary before trusting the numbers:** despite the name, the current implementation is **flat** — it iterates top-level GT keys and compares each via `String(value)`. It does **not** recurse into nested objects or align table/array rows (see bugs **E-1**/**E-2**). For the flat SDPR field sets used in this bake-off that's fine; for any nested or tabular schema the scores are silently wrong.

It evolves across three PRs and reaches its final form at E08 (#165).

**Important architectural reality:** despite the "schema-aware" name, the implementation is **flat** — it iterates `Object.keys(groundTruth)` at the top level and compares each value with `String(value)`. It does **not** recurse into nested objects or align array/table rows. For the current flat-field SDPR datasets this works, but the name oversells it and nested/array GT is silently mishandled (see findings #E-1/#E-2). This is the single most important thing to understand before trusting the benchmark numbers on any non-flat schema.

---

## 4. E09 — SDPR HITL inline editor (`features/annotation/hitl/...`, #184)

The real client deliverable. Adds an **inline canvas-overlay editor** so a reviewer can edit a field's value directly on top of its bounding box on the document canvas, instead of only in the sidebar:

- `CanvasFieldOverlay.tsx` (new) — the in-canvas editable input/checkbox positioned over the active field's box.
- `ConfidenceIndicator.tsx` (new) — confidence-tier coloring (badge / CSS var / canvas hex variants).
- `AnnotationCanvas.tsx` — new `renderActiveBoxOverlay` render-prop; deselect moved from mousedown to click so drag-pan preserves selection; smarter auto-zoom.
- `SnippetView.tsx`, `useFieldFocus.ts`, `ReviewWorkspacePage.tsx` — wiring, focus management, zoom-to-fit-text.

The DO-NOT-MERGE timing-experiment harness commit was correctly dropped during rebase (archived at tag `archive/sdpr-hitl-harness`).

---

## 5. Findings & issue tracker

This section is the **single living tracker** for the stack — tick items off (`[ ]` → `[x]`) as they land. Severity: **🔴 correctness bug / blocker** · **🟡 reuse/simplification** · **🟢 test gap / note**. Findings are real and traced; line numbers are at the stack-tip (E09) state. **⭐ = explicitly prioritized.**

### 🔴 Correctness bugs & blockers (fix before these engines inform a production decision)

- [x] ⭐ **B7 — VLM-direct: genuinely-blank fields score 0.50 and falsely trip HITL review.** `ocr-providers/vlm-direct/vlm-to-ocr-result.ts:194-197`
`evidenceConfidence` assigns `CONF_NO_EVIDENCE` (0.5) whenever a field's `source_quote` is empty — but a field that is *legitimately blank on the form* also has an empty quote, so a correct blank scores 0.5, drags the page mean below the 0.95 gate, and routes an otherwise-fine document to a reviewer.
*Fix:* distinguish **blank value + empty quote** (correct — score confident) from **populated value + no quote** (suspicious — score 0.5); only apply `CONF_NO_EVIDENCE` when there's a non-empty value without a supporting quote.
*Safe to change:* this does **not** alter the comparison-report numbers — `experiments/results/report/REPORT.md` measures accuracy (f1/precision/recall/pass_rate vs ground-truth); the synthesized confidence never feeds those, it only drives live HITL routing, which the bake-off didn't measure.

- [x] **B1 — E05 hybrid silently defeats the HITL confidence gate.** `ocr-providers/vlm-ocr-hybrid/vlm-hybrid-to-ocr-result.ts:147-162`
The mapper replaces `pages` with the **real DI pages**, whose `words[].confidence` are real OCR confidences (~0.97–0.99). But `check-ocr-confidence.ts:39-54` computes a **single average over `pages[].words[].confidence` *plus* `keyValuePairs[].confidence`**. Hundreds of high-confidence DI words numerically swamp the ~74 evidence-based KVP confidences, so a sample with many empty `source_quotes` (0.5 each) still averages well above the 0.95 gate → **review never fires**. The file's own docstring claims "the HITL gate behaviour is unchanged" — that claim is false. This makes E05's benchmark "needs-review" rate untrustworthy.
*Fix:* drop/zero `word.confidence` on the cloned DI pages, or have `check-ocr-confidence` prefer `documents[].fields` confidence when present.

- [x] **B2 / B3 — E03 CU "synchronous result" handling is broken (background + both bugs together).** `azure-cu-analyze.ts:387-409` and `:424-429` *(analyze-path test folded into T5)*

*Background — how CU is supposed to answer.* CU's analyze endpoint is a **long-running operation (LRO)**. The normal flow: you `POST …:analyze`, CU replies **`202 Accepted`** *immediately* (before it's done) and includes an **`operation-location` header** — a URL pointing at where the answer will appear. You then **poll** that URL with GETs until its `status` becomes `Succeeded`/`Failed`. The 202 means "accepted, come back later"; the result is *not* in the 202 body. This async path is the documented behaviour and **it works in this code.**

The bugs are in the engine's attempt to *also* handle a hypothetical **fast path** where CU answers `200 OK` with the finished result inline (no polling). Two things are wrong with that fallback:

- **B2 — the inline-200 branch reads the wrong shape, so it never fires.** A real synchronous `200` would carry a `CuAnalyzeResult` body — the bare result, with `contents`/`fields` at the top level. But the code casts the 200 body to the *polling envelope* type `CuAnalyzeOperation` and checks `inline.status === "Succeeded" && inline.result`. Those two properties (`status`, `result`) only exist on the **poll** response, not on a direct result — so on a genuine inline 200 they're both `undefined`, the `if` is false, and the "synchronous success" branch is skipped entirely. *Fix: parse a 200 body as `CuAnalyzeResult` and map it directly; only the poll responses use the `{status, result}` envelope.*

- **B3 — and when it then falls through to polling, it polls a made-up address.** After skipping B2's branch, the code goes to the poll loop. The poll URL is `operation-location` **if present**, otherwise it falls back to `cuAnalyzeResultUrlFromId(requestId)` — where `requestId = "azure-cu-" + randomUUID()` is a GUID the code **generated locally and never sent to CU** (the POST attaches no client-request-id header). CU files results under *its own* server-assigned id, so this fabricated URL is guaranteed to `404` → the activity throws. *Fix: if there's no `operation-location`, fail fast with a clear error rather than polling a fictional id (or actually send that id as a client-request-id header so it's real).*

**Practical impact:** as long as your CU deployment behaves the documented way (202 + `operation-location`), E03 runs fine — which is why the benchmark worked. But the moment a CU rollout returns an **inline synchronous result** (or a 202 with no header), B2 fails to read it and B3 throws on a fake URL — the engine simply can't retrieve a result it was actually given. It's a latent break for the sync-response case, not a failure you'd see today.

- [x] **B4 — E04/E05 fenced-JSON parser rejects any trailing content.** `ocr-providers/vlm-ocr-hybrid/vlm-hybrid-extract.ts:171` (E05) and the equivalent in E04's `parseStructuredJson` *(deduped into shared `vlm-response-parser.ts`)*
The fence regex is anchored to end-of-string (`...\`\`\`$`). A response like ```` ```json\n{…}\n```\n\nDone. ```` doesn't match, so the raw fenced string (backticks included) is fed to `JSON.parse` → throws. LLMs commonly append a trailing note. Strict-mode `response_format` makes this rare today, but it's a latent crash.
*Fix:* match the first fenced block (drop the `$` anchor) or extract the first `{…}` span.

- [x] **B5 — E05 `azureOcr.readPlain` retries hard failures.** `activities/azure-di-read-plain.ts:286` (+ registry `maximumAttempts: 5`)
A terminal `status: "failed"` analysis throws a plain retryable `Error`; develop's equivalent `poll-ocr-results.ts` uses `ApplicationFailure.create({ nonRetryable: true })`. A genuinely-failed document is therefore re-submitted up to 5×.
*Fix:* throw `ApplicationFailure.create({ nonRetryable: true })` on terminal failure (and on "succeeded but missing analyzeResult").

- [x] **B6 — E03 CU blank dates emit `valueDate: ""`.** `ocr-providers/azure-content-understanding/cu-to-ocr-result.ts:160-167`
An absent/blank CU date yields `valueDate: ""`, which downstream `extractAzureFieldDisplayValue` prefers over `content`, so a blank date reads as a populated value (numbers correctly omit `valueNumber` for blanks — dates don't mirror this).
*Fix:* only set `valueDate` when the normalized string is non-empty.

- [x] **E-1 — Evaluator: nested-object GT produces false-positive matches.** `evaluators/schema-aware-evaluator.ts:350`
`exactMatch` compares via `String(predicted)`. Two different objects both stringify to `"[object Object]"`, so `{a:1}` "matches" `{a:999}`. Every nested-object field scores as a true positive regardless of content. No matcher recurses into objects.
*Fix:* recurse field-by-field (as `black-box-evaluator.ts` does) or compare canonical `JSON.stringify`; if nested objects are out of scope, reject them rather than silently passing.

- [x] **E-2 — Evaluator: array/table-of-rows GT can never match.** `schema-aware-evaluator.ts:71` (`alternativesOf`)
Any array GT is unconditionally treated as **one-of alternates**. A real multi-row table `[{…},{…}]` stringifies to `"[object Object],[object Object]"` and is compared against each single row's `"[object Object]"` → never equal. The "one-of alternates" and "array of rows" semantics are conflated; the schema is never consulted to disambiguate, and there is no row alignment or length-mismatch handling.
*Fix:* disambiguate via the field schema (scalar-with-alternates vs table type) and add real row matching (by key or positional) with explicit length-mismatch scoring.

> **Scope note on E-1/E-2:** the current SDPR datasets are flat, so these do not corrupt *today's* numbers — but any benchmark run over a schema with nested objects or tables will report inflated/zeroed scores silently. Given the stack's whole purpose is picking a production engine from benchmark numbers, this is worth fixing or at minimum loudly documenting.

### 🟡 Reuse / simplification

- [ ] **R1 — DI submit+poll logic now exists in three copies.** `activities/azure-di-read-plain.ts` re-implements the submit (`submit-to-azure-ocr.ts`) + poll (`poll-ocr-results.ts`) that already exist on develop; `normalizeEndpoint`/`readBlobData` are byte-identical. `submit-to-azure-ocr.ts` already supports `outputFormat === "markdown"`. The only genuinely new behavior is collapsing submit+poll into one sync activity. *Compose the existing activities or extract shared client/blob/poll helpers.* — **DEFERRED:** consolidation requires modifying develop's **production** OCR activities (`submit-to-azure-ocr`/`poll-ocr-results`/`mistral-ocr-process`); doing that on this follow-up branch (without their production integration tests) is higher-risk than the cleanup warrants. Better as its own focused PR.

- [ ] **R2 — Mistral blob/template helpers duplicated across providers.** `ocr-providers/mistral-azure/mistral-azure-ocr-process.ts:53-165` — `readBlobData`, `buildDataUrl`, `prismaFieldToAnnotationInput`, and `loadTemplateForAnnotation` are verbatim/near-verbatim copies of develop's `activities/mistral-ocr-process.ts`. *Extract a shared `ocr-providers/mistral/` helper; give the base loader an options param instead of forking it.* (`readBlobData` is in fact copied a **third** time in `vlm-hybrid-extract.ts:60-74`.) — **DEFERRED** with R1: parameterizing the base loader modifies develop's production `mistral-ocr-process.ts`; bundle with the R1 helper-consolidation PR.

- [x] **R3 — CU `readEnv`/`sleep` duplicated** between `azure-cu-analyze.ts` and `azure-cu-deploy-analyzer.ts`; hoist into the shared `azure-cu-client.ts`.

- [x] **R4 — Evaluator duplicates shared normalizers.** Local `parseNumeric` (`schema-aware-evaluator.ts:487-492`) hand-strips commas/spaces but **not** currency symbols, so `"$6,191.12"` fails numeric parse and silently falls back to exact-string match — yet `field-format-engine.ts` already has a `"number"` op that strips `£$€¥,`. `levenshteinDistance` (`:398-420`) is byte-identical to `ocr-correction-evaluator.ts:63-81`. *Reuse the shared canonicalizer + extract one Levenshtein helper.*

- [x] **R5 — VLM-direct masks DB errors as "template not found."** `ocr-providers/vlm-direct/vlm-direct-extract.ts:124-131` — `loadTemplate`'s `catch` returns `null`; the caller then throws "template field_schema not found." A transient Prisma error surfaces as a missing-template error and retries with a misleading message. *Rethrow genuine errors; reserve `null` for an actually-absent schema.*

### 🟢 Test gaps & notes

- [x] **T1 — The riskiest parsing code has no unit tests.** `parseStructuredJson` (E04 and E05) — fence-strip, `JSON.parse`, missing-`fields`/`source_quotes` guards, malformed JSON — has **zero direct tests** in either engine. Bug B4 lives here. *Add unit tests: clean JSON, fenced JSON, trailing-prose, and the strict-mode guard throws.*

- [ ] **T2 — E05 confidence-gate bug is invisible to the suite.** The runtime tests mock `ocr.checkConfidence` to return hardcoded values, and the mapper test only asserts pages/lines/words are non-empty. *Add a test running the real `checkOcrConfidence` over a hybrid `OCRResult` with high DI word-confidences + mostly-empty quotes, asserting `requiresReview === true`.*

- [x] **T3 — Evaluator's headline features are untested.** No test exercises nested-object GT, array/table-of-rows GT, empty GT, currency normalization, or the `date`-rule degenerate-number case (`"2023"` must not match `"2023-06-01"`). These are exactly the paths broken by E-1/E-2/R4. *Highest-value test additions in the stack.*

- [ ] **T4 — E04 e2e test fabricates field types from key-name prefixes** (`experiment-04-vlm-direct.test.ts:407-418`) instead of loading the seeded template `field_schema`, so a number field not matching the `applicant_`/`spouse_` heuristic is treated as a string and its `valueNumber` is silently dropped without the test noticing. The "useful evidence" assertion (`:435`) is near-vacuous (`> populated/2`). *Load real template types; tighten the evidence assertion.*

- [ ] **T5 — E03 CU tests miss the async paths.** No coverage for selection-mark→boolean normalization, per-page span slicing, or the string→number fallback; the e2e suite is `describe.skip` under CI so the real analyze/deploy/poll code (where B2/B3 live) never runs in CI. *Acceptable for an experiment harness, but the analyze/poll path is the riskiest code and has no automated coverage.*

- [ ] **T6 — E02 e2e mock drops `ocrResponse`** (`experiment-02-...test.ts:156-159`); the unit test covers it, but the chain wiring that persists `ocrResponse` is only checked statically. Minor.

- [x] **W1 — temporal activity-registry test fixture is stale.** `apps/temporal/src/activity-registry.test.ts` `EXPECTED_ACTIVITY_TYPES` is missing E05's `azureOcr.readPlain` and `vlmOcrHybrid.extract` (and pre-existing `benchmark.flattenPredictionFromRefs`); its subset/`>=` assertions let the omission pass, so those activities have no registration-test coverage on the temporal side. Production wiring is correct in all three lists; the backend spec's exact `toHaveLength` check passes. *Fix: add the missing types to the fixture and tighten the size assertion to exact.* (Details in §1 "Wiring".)

### ✅ Verified clean / correct

- **#155 foundation is clean.** The new `azure-openai.controller.ts` follows the strict Swagger/DTO conventions exactly (specific decorators, dedicated DTO with `@ApiProperty`, `type`-referenced responses), is auth-guarded via `@Identity`, leaks no secrets (returns deployment **names** only), uses no `any`. `enrich-results.ts` correctly migrates to the OCR ref-port (`resolveOcrResultInput`/`toOcrResultPort`); its return-type change is safe because dispatch is dynamic. `GraphWorkflowInput.groupId` is an additive optional field. Test coverage is strong with real assertions. (Two cosmetic dead-condition nits, no defects.)
- **The `graph-workflow.ts` change in #165 is a genuine production bugfix worth upstreaming independently:** `redactCtxForQuery` crashed the `getStatus` query handler on any ctx key holding `undefined`, because `JSON.stringify(undefined)` returns `undefined` (not a string) and `.length` then threw. The fix guards `valueStr !== undefined`. This bug exists on `develop` today.
- **Engine wiring is consistent and correct** across all three registration points, with well-reasoned per-quota retry policies.
- **E02 conversion math, E03 schema builder, E04/E05 prompt builders, `ocr-to-markdown` core, and the engine `*-types.ts` files** were each traced and are correct.

### E09 HITL findings (frontend)

- [ ] 🔴 **H1 — Tab-navigation loses focus in overlay mode.** `ReviewWorkspacePage.tsx:661-665` relies on the next overlay's `autoFocus`, but `CanvasFieldOverlay` is rendered with **no per-field React `key`**, so React reuses the same input instance and `autoFocus` (mount-only) never re-fires. Keyboard-only review breaks after the first field. *Fix: `key={field.fieldKey}` on the overlay — this also fixes H2.*
- [ ] 🟡 **H2 — `isHovering` state leaks across fields** (`CanvasFieldOverlay.tsx:78`) — same root cause; the per-field `key` resolves it.
- [ ] 🟢 **H3 — Overlay lags the pan/zoom tween** (`AnnotationCanvas.tsx:330-362` vs `190-212`): overlay placement reads `pan`/`scale` state but `panTo` commits those only in `onFinish` (200ms later), so the overlay snaps after the animation. Self-corrects; visible glitch.
- [ ] 🟢 **H4 — Overlay placement ignores `rotation`** (`AnnotationCanvas.tsx:354-360`): no rotation transform though image/box layers rotate about center. Latent (current caller passes no rotation) but the new render-prop API invites rotated callers.
- [ ] 🟡 **H5 — Duplicated `measureTextWidth` + font constants** between `CanvasFieldOverlay.tsx:29-46` and `useFieldFocus.ts:39-47`; they must stay in lockstep for the zoom-to-fit math, so the duplication is a correctness hazard. *Extract a shared module.*
- ✅ Coordinate scaling is applied exactly once on each path (no double-scaling); confidence tiers are consistent across the three color variants; controlled-input wiring is correct; moving deselect to `onClick` correctly preserves selection during drag-pan.

### 🟢 Upstream (independent of the stack)

- [ ] **U1 — Cherry-pick the `graph-workflow.ts` `redactCtxForQuery` fix to `develop`.** `apps/temporal/src/graph-workflow.ts:75-80`
`redactCtxForQuery` crashes the `getStatus` query handler on any ctx key holding `undefined` (`JSON.stringify(undefined)` returns `undefined`, then `.length` throws) — **this bug exists on `develop` today**. The #165 fix guards `valueStr !== undefined`. *Land it on `develop` on its own, separate from the experiment stack's fate.*

> **Scope note — already-merged work, not stack changes (baseline correction):** an earlier pass mistakenly attributed several commits to the stack because the local `develop` ref was ~30 commits behind `origin/develop`. Verified against `origin/develop`, these are **already merged to develop via their own PRs** and are *not* experiment-stack contributions — they drop out when the stack rebases onto current `origin/develop`: `ephemeral-document cleanup janitor` (`7218ea05`), `cross-group isolation` (PR #202), and `conversion_failed`-in-failed-filter + `documents` list indexes (`4dba402e`). The genuinely experiment-stack shared changes (confirmed novel vs `origin/develop`) are only: the engine wiring (`activity-registry`/`activities`/`activity-types`), `worker.ts` dev-ergonomics, the `enrich-results` deployment-override param, the `schema-aware-evaluator`, and the `graph-workflow.ts` `redactCtxForQuery` fix (U1) — all additive/clean except the evaluator (E-1/E-2/R4 above) and U1.

---

## 6. Recommended priority

1. ⭐ **B7** (VLM-direct blank-field false review) — explicitly prioritized.
2. **B1** (E05 gate defeat) and **E-1/E-2** (evaluator nested/array) — these directly distort the benchmark conclusions the whole stack exists to produce.
3. **B2/B3** (E03 CU sync/poll paths) — the engine can silently never succeed on certain CU response shapes.
4. **H1** (HITL focus) — the only correctness bug in the actual client deliverable.
5. **B4/B5/B6, R1–R5, T1–T6** — robustness and maintainability; fix opportunistically before this pattern is copied into more engines.
6. **U1 — upstream the `graph-workflow.ts` `redactCtxForQuery` fix to `develop` on its own** — it's an unrelated live bug.

*#162, #164, and the dropped E09 harness commit contain no reviewable system code.*
