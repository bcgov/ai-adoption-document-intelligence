# Workflow Builder — Node Restructure: Technical Annex

**Audience:** Engineering, Product
**Status:** Draft — companion to [NODE_RESTRUCTURE_DESIGN.md](NODE_RESTRUCTURE_DESIGN.md)

This document contains the technical detail behind the node restructure design: the activity-catalog
matrix, code-inspection findings, migration options analysis, composite behaviour contract, and
engineering acceptance criteria. Read the narrative design doc first.

---

## 1. Purpose

Define the user-facing information architecture for the Workflow Builder node palette, so that
sample workflows and follow-on features are built once against a stable taxonomy.

This document specifies:

- the target user-facing categories and what each means to a user (Section 5)
- category and node **naming rules** (Section 6)
- the **exposure model** — Default / Advanced / Internal (Section 7)
- which activities become **composite** nodes and how composites behave (Section 8, Section 9)
- the complete **node-disposition matrix** for every catalog activity (Appendix A)
- how existing **saved workflows stay compatible** (Section 10, Section 11)
- the recommendations this design makes and the open questions (Section 13), and the follow-on stories (Section 14)
- the **story completion criteria** (Section 15)

One item remains to confirm before implementation begins: the engineering assumptions still open
in Section 3.3 items 5–7. The Appendix A matrix has already been reconciled against the live catalog
(Section A.5) — every catalog activity appears exactly once, and the only activities found in saved
workflows but absent from the catalog are six research-experiment or SDPR-specific custom nodes that
are out of scope for this restructure (listed in Section A.5). See Section 15 for the full completion
checklist.

## 2. Why this gates the sample-workflow epic

Sample workflows are authored from the palette's categories, node names, settings, and composition
model. Building samples before those stabilise causes rework — e.g. a sample built from the four
granular Azure OCR activities must be rebuilt once they are presented as one **Extract Text**
composite. The taxonomy and composition model must therefore be settled before samples are treated
as final.

---

## 3. Scope and technical grounding

### 3.1 In scope

Palette categories and ordering; category descriptions; node display names; Default/Advanced/Internal
exposure; composite-node definitions; simplified/detailed view behaviour; saved-workflow
compatibility; provider selection within Extract Text; follow-on implementation scope.

### 3.2 Out of scope

Runtime activity behaviour; renaming `activityType` identifiers; execution semantics; visual styling
of palette controls; a full settings-panel redesign; new OCR providers; workflow JSON schema changes
(unless Section 3.3 validation proves one is required); the **Custom** palette section (user-created
dynamic nodes) — it is unchanged by this restructure and sits alongside the eight built-in categories.

### 3.3 Technical grounding

Items 1–4 are based on **code inspection of the current repository**, with sources linked. They are
treated as strong working assumptions. Items 5–7 are **unconfirmed assumptions** whose validation is
an acceptance criterion of the relevant story.

**Verified (with source):**

1. **A saved node references a stable `activityType`, plus an independent user-editable `label`.**
   See [`standard-ocr-workflow.json`](templates/standard-ocr-workflow.json) — each node has
   `"activityType": "…"` and its own `"label": "…"`.
2. **`displayName` and `category` are catalog metadata, not workflow structure.** A catalog entry is
   `{ activityType, displayName, category, description, … }` — see
   [`file-prepare.ts`](../../packages/graph-workflow/src/catalog/activities/file-prepare.ts). Saved
   workflow JSON stores no category and does not store the catalog `displayName`.
3. **On that basis, recategorising or renaming in the catalog is not expected to rewrite saved
   workflows or overwrite a user's per-node `label`** (code-inspection basis: items 1 + 2).
   Compatibility tests must confirm that load and save paths do not normalise or overwrite stored
   labels or structure.
4. **Today's simplified view projects user-defined `nodeGroups` into chips — it does not detect
   activity chains.** See
   [`group-projection.ts`](../../apps/frontend/src/features/workflow-builder/canvas/group-projection.ts).
   Structural recognition of a composite subgraph (Section 9, Section 11) is therefore **new capability**, not an
   existing behaviour.

**Assumptions requiring engineering validation:**

5. A composite's optional steps can be toggled by adding/removing the underlying activity without
   leaving a hidden executable step (Section 9 "Optional step").
6. A recognised subgraph can be projected as one composite deterministically, with an unambiguous
   granular fallback (Section 11).
7. Advanced activities remain fully addable to new and existing graphs, and Internal activities never
   need to be user-addable (Section 7).

### 3.4 Source material

Builds on and, where they conflict, supersedes with a recorded recommendation:

- [ACTIVITY_PARAMETERS_AUDIT.md](ACTIVITY_PARAMETERS_AUDIT.md) — parameter-level exposure policy.
- [WORKFLOW_SIMPLIFIED_VIEW_GUIDE.md](WORKFLOW_SIMPLIFIED_VIEW_GUIDE.md) — first merge/demotion sketch.
- [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md) — field/widget-level node spec.
- The live activity catalog and `CATEGORY_ORDER`
  ([`catalog-utils.ts`](../../apps/frontend/src/features/workflow-builder/catalog-utils.ts)).

**Current state (code):** twelve categories today — `Flow Control`, `File Handling`, `OCR (Azure)`,
`OCR (Mistral)`, `OCR Cleanup & Correction`, `OCR Quality`, `Document Handling`, `Validation`,
`Storage`, `Data Transformation`, `Reference Data`, and `Benchmarking` (already hidden). Plus
`source` entry nodes not currently in `CATEGORY_ORDER` (Section 5.3).

---

## 4. Design principles

1. **Organise around user intent**, not provider, runtime mechanism, or internal implementation.
2. **Simplification changes prominence, not capability** — activities that are implementation-only
   details may move to Internal when Engineering confirms users never need to add them directly;
   everything else stays authorable in Advanced at minimum.
3. **Presentation never rewrites a saved workflow** — projections are read-only and reversible; an
   unrecognised graph keeps its granular form (Section 11).
4. **Clarity over brevity** — a longer unambiguous name beats a short unclear one.

---

## 5. Target category set

Nine user-facing **task** categories. **Input** is the first, covering how documents enter a
workflow; the remaining seven cover processing, control, and persistence. Advanced is an exposure
tier, not a category (Section 7); Internal activities never appear in the palette.

| Order | Category | What it means to a user | Absorbs (current categories) |
|---|---|---|---|
| 1 | **Input** | Bring a document into the workflow — via direct upload or an API trigger. | `source` (currently not in `CATEGORY_ORDER`) |
| 2 | **Extract Text** | Turn a document into machine-readable text and, when configured, structured fields. | `OCR (Azure)`, `OCR (Mistral)`, OCR-setup part of `File Handling` |
| 3 | **Document Handling** | Classify, split, reorder, orient, or select parts of a document. | `Document Handling` |
| 4 | **Post-processing** | Clean up, normalise, or enrich extracted content. | `OCR Cleanup & Correction`, `OCR Quality` |
| 5 | **Validation** | Check extracted fields against required formats, values, or business rules. | `Validation` |
| 6 | **Data Transformation** | Reshape or reformat extracted results. | `Data Transformation` |
| 7 | **Reference Data** | Look up a supporting value from a reference table. | `Reference Data` |
| 8 | **Flow Control** | Decide, branch, loop, wait, retry, or require human input. | `Flow Control` |
| 9 | **Save Results** | Persist accepted or processed results to a destination. | `Storage` |

**Recommendation: adopt these nine.**

### 5.1 Category-boundary rules (to keep them distinguishable)

- **Extract Text vs. Advanced OCR utilities** — a node that only prepares a file, reads a blob, or
  runs a low-level extraction step is Advanced, not Extract Text.
- **Post-processing vs. Validation** — Post-processing *improves* content (cleanup, normalise, enrich,
  confidence); Validation *judges* content against an explicit rule. Confidence-based **routing** is
  Flow Control (Section 9.4), not Post-processing.
- **Document Handling vs. Data Transformation** — Document Handling changes the *document/pages*; Data
  Transformation changes the *result data structure*.

### 5.2 Terminology — open question

Three labels are worth pressure-testing: `Post-processing` (may read as system-oriented — **Refine
Results** is an alternative), and `Save Results` (plain-language alternative to `Storage`).

### 5.3 Input category

The catalog contains entry nodes `source.upload` and `source.api` (current category `source`, not in
today's `CATEGORY_ORDER`). They are how a document enters a workflow and belong in the palette as
first-class authorable nodes, not hidden as trigger-level configuration. **Input** is therefore the
first of the eight categories. The Appendix A.3 matrix records their dispositions.

---

## 6. Naming rules

### 6.1 Category names

Intent-based; Title Case; one–three words; **no provider/vendor/product/port/payload/runtime terms**;
mutually distinct; each carries a one-sentence description and inclusion/exclusion rule (Section 5, Section 5.1).
E.g. **Extract Text** not `OCR (Azure)`; **Save Results** not `Storage Operations`.

### 6.2 Node display names

Action-oriented, verb-first for actions (a concise noun phrase only for recognised control
constructs); two–four words; **no `activityType`, operation, port, context, or payload terms**;
provider named only when the provider itself is the object of the action; the **same** default name in
palette, settings heading, and initial canvas label.

Examples: **Extract Text**, **Classify Document**, **Validate Fields**, **Generic Data Transform**,
**Reference Data Lookup**,
**Look Up Table Value**, **Wait & Retry**, **Run Sub-workflow**, **Require Human Review**,
**Save Results**.

### 6.3 Descriptions

Sentence case; explain the outcome in plain language; no "activity/context/payload", raw port names,
or internal IDs; state important scope limits; never promise fields, formats, or providers the node
does not support.

### 6.4 Internal identifiers are frozen

`activityType` identifiers are **out of scope** and unchanged; a user-facing rename is a catalog
display change only. Any future identifier change is a separate decision requiring an old→new alias at
load time, tests against existing workflows, and no silent destructive rewrite (Section 11.6).

---

## 7. Exposure model

Category and exposure are **independent** attributes. Conceptually each activity carries:

- `taskCategory`: `input | extractText | documentHandling | postProcessing | validation | transformData | flowControl | saveResults`
- `exposure`: `default | advanced | internal`

**Default** — appears in its task category when the palette opens; a meaningful standalone user
action. **Advanced** — authorable but collapsed by default, still searchable, still in detailed view;
granular/specialised/usually-part-of-a-composite. Advanced is **not** a task category. **Internal** —
never in the palette or either authoring view; may support system behaviour (e.g. benchmarking).

Today's `HIDDEN_CATEGORIES` (Benchmarking) is the current implementation of Internal; this model
generalises it from a hidden *category* to a per-activity *exposure* value.

---

## 8. Proposed default palette

```text
Input
  - Upload Document
  - Receive via API

Extract Text
  - Extract Text           (provider preset: Azure Document Intelligence / Mistral)

Document Handling
  - Classify Document      (composite)
  - Split & Classify
  - Select Classified Pages
  - Flatten Classified Documents
  - Correct Orientation

Post-processing
  - Process Extracted Text (composite)
  - Enrich Results

Validation
  - Validate Fields

Data Transformation
  - Generic Data Transform

Reference Data
  - Reference Data Lookup

Flow Control
  - Switch
  - Loop
  - Collect
  - Wait & Retry
  - Require Human Review
  - Review by Confidence   (composite)
  - Run Sub-workflow

Save Results
  - Save Results
```

**Default-visibility test** — a node stays default-visible when it represents a user-recognisable
outcome, can be configured standalone, appears across multiple supported patterns, needs no knowledge
of internal plumbing, and whose absence would materially block common authoring. Existing membership
in a category is **not** a reason to keep a node visible.

---

## 9. Composite-node model

A composite is a **simplified authoring representation of a supported subgraph** of runtime
activities. It does **not** create a new runtime activity. Subject to Section 3.3-5/6, composites follow this
behaviour contract:

- **Add / Duplicate / Delete** — add creates the defined activities, edges, and defaults; duplicate
  copies the whole subgraph and its settings; delete removes only what the composite owns, warning (or
  declining) when an internal activity has an external dependency.
- **Configure** — each composite setting maps to a documented parameter on an underlying activity;
  unmapped settings are not exposed. Connections expose only user-relevant ports.
- **Optional step** — toggling adds/removes the underlying activity, never leaving a hidden executable
  step (Section 3.3-5).
- **Detailed ↔ simplified** — detailed view exposes the underlying authorable activities; simplified
  re-collapses only if the subgraph still matches a recognised pattern (Section 11). Switching is
  non-destructive.
- **Validate** — surfaces any underlying activity's error/warning against the affected setting or
  step, without requiring raw-JSON inspection.
- **Save** — persists the existing runtime graph; the projection introduces no undocumented
  transformation.

Per-composite specifications use the template in Appendix B.

### 9.1 Extract Text (category: Extract Text)

**Outcome:** extract text and, where supported, configured fields.
**Provider presets:** Azure Document Intelligence · Mistral.
**Underlying patterns** (verify sequence/IDs during implementation):
`file.prepare → azureOcr.submit → pollUntil(azureOcr.poll) → azureOcr.extract` (Azure);
`file.prepare → mistralOcr.process` (Mistral).
**Provider behaviour:** provider-specific settings appear only after selection; a provider change must
not silently discard configured values — warn if settings can't be mapped; existing workflows retain
their current chain; provider/permission errors surface without auto-substituting a provider.
Final settings come from the Activity Parameters Audit, not inferred here.

### 9.2 Classify Document (category: Document Handling)

**Outcome:** apply a configured classifier. **Pattern:** `azureClassify.submit → azureClassify.poll`.
**Primary setting:** Classifier. Operation IDs and raw classifier payloads stay hidden.

### 9.3 Process Extracted Text (category: Post-processing)

**Outcome:** improve and normalise extracted content after extraction.
**Pattern:** `ocr.cleanup → [optional correction] → ocr.checkConfidence`, optional correction steps
drawn from `ocr.spellcheck`, `ocr.characterConfusion`, `ocr.normalizeFields`.
**Boundary:** improves or assesses extracted content only — business-rule checks belong to
**Validate Fields**.

**Confidence assessment and confidence routing are separate concerns.** `ocr.checkConfidence`
calculates and outputs an average confidence score; it belongs here as the final step of this
composite and as a standalone Advanced activity. Review by Confidence (Section 9.4) *consumes* that
confidence result to make a routing decision — it is a Flow Control composite that reads
`ocr.checkConfidence`'s output, not a wrapper around it.

### 9.4 Review by Confidence (category: Flow Control) — kept separate

**Outcome:** route low-confidence results to an alternative or human-review path.
**Conceptual pattern:** `confidence result → switch → [optional human review] → continue/save`.
Kept out of Process Extracted Text because it changes execution flow and may add a human decision. The
implementation story must define inputs, branch outputs, confidence-threshold ownership, whether human
review is intrinsic or optional, whether terminal storage is included (recommended: **not** included
unless intended as a terminal step), no-confidence-value behaviour, and branch-label presentation.

### 9.5 Kept as separate nodes

Select Classified Pages and Flatten Classified Documents (opposing operations); Split & Classify
(already a single runtime activity `document.splitAndClassify`); Correct Orientation; Generic Data Transform;
Reference Data Lookup;
Look Up Table Value; Enrich Results; Switch; Loop; Collect; Wait & Retry; Require Human Review; Run
Sub-workflow; Save Results.

---

## 10. Saved-workflow compatibility — summary

Existing supported workflows must continue to resolve and execute unless a separate, intentional
breaking change says otherwise, and the restructure must not silently rewrite stored structure. Because of the code-inspection findings in Section 3.3 items 1–3:

- **Recategorisation** and **display-name changes** require **no** JSON migration and do not overwrite
  user labels. These are catalog-metadata edits. (Confirm via the test corpus, Section 12.)
- **Composites are presentational.** The runtime graph is unchanged; composites are projection + a
  new authoring surface.

The only genuinely new, risk-bearing behaviour is **structural composite recognition** for *existing*
graphs (Section 3.3-4/6). It is specified in Section 11 and gated behind strict matching with a granular fallback.

## 11. Composite recognition and fallback

### 11.1 Migration strategy options

Four approaches exist for how existing granular graphs relate to the new composites:

| Option | Existing workflows | Complexity | Visual consistency | Risk |
|---|---|---|---|---|
| **A — Preserve granular** | Stay granular indefinitely | Low | Old and new graphs look different | Low |
| **B — User-initiated conversion** | User explicitly converts a graph | Low–Medium | Gradual; user-controlled | Low |
| **C — Read-time recognition (recommended)** | Recognised patterns collapse at read time | Medium | Consistent across old and new | Medium |
| **D — Persisted composite marker** | Only explicitly tagged graphs collapse | Medium | Partial (new graphs only) | Low–Medium |

**Recommendation: Option C — read-time recognition with strict matching and granular fallback.**

Rationale: the existing `nodeGroups` projection already proves read-time projection is safe and
non-destructive. Extending it with structural recognition means that both newly authored composite
workflows and existing template-based workflows using the same chains present consistently — which
is critical for the sample-workflow epic (sample pipelines are composites; existing workflows built
from the same activity chains should look the same). Option A produces a permanent two-tier visual
until every user migrates. Option B requires user action for no user benefit. Option D leaves
most existing workflows inconsistent.

The strict matching rules in Section 11.2 and the granular fallback in Section 11.3 bound the risk.
The `nodeGroups` code path (Section 3.3 item 4) confirms the projection model is already in place
and non-mutating.

### 11.2 Recognise-then-collapse (read-time only)

In simplified view, project a recognised subgraph as one composite chip **at read time only** — never
writing to stored JSON; detailed view continues to show the granular activities.

### 11.3 A subgraph may collapse only when

it contains a supported sequence (or an explicitly supported optional variation); required activities
are connected in the expected direction with compatible parameters; internal activities are not shared
with an unrelated structure; no unsupported activity interrupts the sequence; no branch out of the
subgraph would be concealed; it matches exactly one composite; and collapsing hides no user-defined
structural distinction.

### 11.4 Fallback when a graph does not match unambiguously

Preserve the granular representation; do not modify the stored graph; do not discard settings; do not
insert missing activities; do not force it into the nearest composite; where useful, explain why it
cannot be shown as the expected composite.

### 11.5 Custom labels inside a recognised subgraph

Detailed view preserves them; simplified view must not imply they were deleted. Preferred: use an
explicitly stored composite label if present, otherwise the composite's default display name, without
overwriting underlying labels.

### 11.6 View switching is non-destructive

Switching simplified ↔ detailed must not remove activities, edges, configuration, or labels, and
opening simplified view must not mutate the saved graph.

### 11.7 Future identifier aliases

This restructure does not authorise renaming `activityType`. If one is ever required: maintain an
old→new alias at load time; test workflows containing the old identifier; report an unresolved
identifier as an actionable error; never silently substitute different behaviour; treat any persisted
normalisation as a separate, optional, deliberate operation (Section 6.4).

---

## 12. Acceptance criteria

The implementation is acceptable when:

1. Every template in the agreed corpus (start:
   [`docs-md/workflows/templates/`](templates/)) loads with no unresolved-activity error.
2. Category and display-name changes rewrite no workflow structure and no user labels.
3. Recognition, fallback, and view-switching behave as specified in Section 11.3–11.6 (recognised patterns
   collapse; ambiguous ones stay granular; no saved-graph mutation or data loss).
4. Every Default and Advanced activity stays authorable and searchable in detailed view; Internal is
   never a standalone authoring choice; provider-specific workflows retain their provider and settings.
5. The build records unsupported patterns and test failures rather than normalising them silently.

---

## 13. Recommendations and open questions

### 13.1 Recommendations in this design

| # | Recommendation | Section |
|---|---|---|
| 1 | Adopt the nine task categories | Section 5 |
| 2 | Terminology: `Post-processing` / `Save Results` (`Refine Results` as a fallback for the first) | Section 5.2 |
| 3 | **Input** is the first of eight palette categories; `source.*` nodes belong there, not as trigger-level config | Section 5.3 |
| 4 | Full default-visible palette incl. the optional standalone nodes | Section 8 |
| 5 | Extract Text = Azure/Mistral **provider presets**, no vendor in names | Section 6, Section 9.1 |
| 6 | Keep **Review by Confidence** separate from Process Extracted Text | Section 9.3–9.4 |
| 7 | Read-time composite recognition with strict matching + granular fallback | Section 11 |
| 8 | Freeze `activityType`; alias only if a future rename is forced | Section 6.4, Section 11.6 |
| 9 | Switch conditions inside composites are template-fixed in simplified mode, editable in detailed view; standalone Switch nodes remain directly configurable | Section 9, composite behaviour contract |

### 13.2 Open questions

- **Category terminology** — do `Post-processing` and `Save Results` read clearly,
  or is `Refine Results` better than `Post-processing`? (Section 5.2)

---

## 14. Follow-on stories

| Story | Design source | Outcome | Depends on | Acceptance focus |
|---|---|---|---|---|
| Catalog inventory reconciliation | Appendix A | Every catalog activity has a verified disposition | — | No unmapped/obsolete activities |
| Catalog recategorisation | Section 5, Section 7, App. A | Activities get their `category` + `exposure` metadata | Inventory reconciliation | Metadata matches matrix; no JSON rewrite |
| Display-name pass | Section 6, App. A | Consistent names across palette/heading/canvas | Section 6 naming rules | Names align; user labels intact |
| Input category (or trigger disposition) | Section 5.3 | `source.*` placed per Section 13.1-3 | Section 13.1-3 | Source nodes reachable per recommendation |
| Extract Text provider preset | Section 9.1 | Single extraction node with Azure/Mistral presets | Provider mapping validated | Switching, settings retention, outputs defined |
| Composite authoring model | Section 9 | Add/edit/duplicate/delete/validate a composite safely | Section 3.3-5/6 | Full contract met |
| Process Extracted Text composite | Section 9.3 | Cleanup/correction as one outcome | Composite model | Optional-step behaviour explicit |
| Review by Confidence composite | Section 9.4 | Confidence routing/review consistent | Section 9.4 open items resolved | Inputs, branches, storage boundary defined |
| Advanced palette | Section 7, App. A | Advanced discoverable + authorable | Exposure metadata | Collapsed, searchable, addable |
| Existing-graph recognition | Section 11 | Recognised graphs collapse without mutation | Section 13.1-7 | Strict match, ambiguity fallback, no data loss |
| Compatibility test harness | Section 12 | Systematic corpus tests | Corpus agreed | Load/save/view-switch/providers/labels |
| Documentation update | whole design | Catalog/guides/templates use the new terminology | Implementation | No obsolete names/categories |
| Sample-workflow authoring (gated epic) | this design | Samples on the stable taxonomy | Blocking stories complete | No deprecated names/unsupported structures |

---

## Appendix A — Node-disposition matrix

This matrix has been reconciled against the live catalog (Section A.5): every `activityType`
registered in `ACTIVITY_CATALOG` appears exactly once with a settled target category, exposure, and
composite participation. Each `activityType` has one primary task category and one exposure; composite
participation may reference more than one composite only where ownership rules are explicitly
defined. A review of all saved workflows found six activity types outside the catalog — all in
research-experiment or SDPR-specific custom workflows — which are out of scope for this palette
restructure (see Section A.5).

The **Current display name** column is verified against the live catalog `displayName` values and
matches the mapping table in the narrative design doc. The **Proposed display name** column is the
target for the display-name pass follow-on story — it is a recommendation, not the name shown today.

### A.1 Activities

| `activityType` | Current category | Current display name | Proposed display name | Target category | Exposure | Composite |
|---|---|---|---|---|---|---|
| `file.prepare` | File Handling | Prepare File | Prepare File | Extract Text | Advanced | Extract Text |
| `azureOcr.submit` | OCR (Azure) | Submit OCR | Submit Azure Extraction | Extract Text | Advanced | Extract Text (Azure) |
| `azureOcr.poll` | OCR (Azure) | Wait for OCR Result | Check Azure Extraction | Extract Text | Advanced | Extract Text (Azure) |
| `azureOcr.extract` | OCR (Azure) | Extract OCR Result | Read Azure Results | Extract Text | Advanced | Extract Text (Azure) |
| `mistralOcr.process` | OCR (Mistral) | Process with Mistral OCR | Extract with Mistral | Extract Text | Advanced | Extract Text (Mistral) |
| — | — | — | **Extract Text** | Extract Text | Default | composite entry |
| `azureClassify.submit` | OCR (Azure) | Submit Classify | Submit Classification | Document Handling | Advanced | Classify Document |
| `azureClassify.poll` | OCR (Azure) | Poll Classify | Check Classification | Document Handling | Advanced | Classify Document |
| — | — | — | **Classify Document** | Document Handling | Default | composite entry |
| `document.splitAndClassify` | Document Handling | Split & Classify | Split & Classify | Document Handling | Default | — |
| `document.selectClassifiedPages` | Document Handling | Select Classified Pages | Select Classified Pages | Document Handling | Default | — |
| `document.flattenClassifiedDocuments` | Document Handling | Flatten Classified Documents | Flatten Classified Documents | Document Handling | Default | — |
| `document.normalizeOrientation` | Document Handling | Correct Orientation | Correct Orientation | Document Handling | Default | — |
| `document.split` | Document Handling | Split Document | Split Document | Document Handling | Advanced | — |
| `document.classify` | Document Handling | Classify Document | Classify Segment | Document Handling | Advanced | — |
| `document.extractPageRange` | Document Handling | Extract Page Range | Extract Page Range | Document Handling | Advanced | — |
| `segment.combineResult` | Document Handling | Combine Segment Result | Combine Segment Result | Document Handling | Advanced | — |
| `ocr.cleanup` | OCR Cleanup & Correction | Cleanup | Clean Extracted Text | Post-processing | Advanced | Process Extracted Text |
| `ocr.normalizeFields` | OCR Cleanup & Correction | Normalize Fields | Normalise Fields | Post-processing | Advanced | Process Extracted Text (optional) |
| `ocr.characterConfusion` | OCR Cleanup & Correction | Character Confusion Fix | Correct Confused Characters | Post-processing | Advanced | Process Extracted Text (optional) |
| `ocr.spellcheck` | OCR Cleanup & Correction | Spellcheck | Check Spelling | Post-processing | Advanced | Process Extracted Text (optional) |
| `ocr.checkConfidence` | OCR Quality | Check Confidence | Check Confidence | Post-processing | Advanced | Process Extracted Text (final step) |
| `ocr.enrich` | OCR Quality | Enrich OCR Results | Enrich Results | Post-processing | Default | — |
| — | — | — | **Process Extracted Text** | Post-processing | Default | composite entry |
| `document.validateFields` | Validation | Validate Fields | Validate Fields | Validation | Default | — |
| `data.transform` | Data Transformation | Generic Data Transform | Transform Data | Data Transformation | Default | — |
| `tables.lookup` | Reference Data | Reference Data Lookup | Look Up Table Value | Reference Data | Default | — |
| `ocr.storeResults` | Storage | Store OCR Results | Save Results | Save Results | Default | — |
| `document.updateStatus` | Storage | Update Document Status | Update Document Status | Save Results | Advanced | — |
| `document.storeRejection` | Storage | Store Rejection | Save Rejected Document | Save Results | Advanced | — |
| `blob.read` | File Handling | Read Blob | Read Blob | Document Handling | Advanced | — |
| `document.extractToBase64` | File Handling | Extract Page to Blob | Extract Page to Blob | Document Handling | Advanced | — |

> Note: `blob.read` and `document.extractToBase64` are currently **File Handling**; since that
> category dissolves, both move to **Document Handling / Advanced**. `document.extractToBase64` slices
> a PDF page range (document manipulation) and `blob.read` loads file bytes — both are file-handling
> utilities rather than text extraction, so they sit with the other document/blob utilities.

### A.2 Control-flow node types (structural — not activities)

| Node type | Current display name | Proposed display name | Target category | Exposure |
|---|---|---|---|---|
| `switch` | Branch by condition | Switch | Flow Control | Default |
| `map` | Run for each item | Loop | Flow Control | Default |
| `join` | Collect results | Collect | Flow Control | Default |
| `pollUntil` | Wait until condition | Wait & Retry | Flow Control | Default |
| `humanGate` | Wait for approval | Require Human Review | Flow Control | Default |
| `childWorkflow` | Sub-workflow | Run Sub-workflow | Flow Control | Default |

### A.3 Source / entry nodes (Section 5.3)

| `activityType` | Current category | Current display name | Proposed display name | Target category | Exposure |
|---|---|---|---|---|---|
| `source.upload` | source | File upload | Upload Document | Input | Default |
| `source.api` | source | API endpoint | Receive via API | Input | Default |

### A.4 Internal (never user-facing)

| `activityType` | Target | Exposure |
|---|---|---|
| all `benchmark.*` | — | Internal |
| `getWorkflowGraphConfig` | — | Internal |

### A.5 Reconciliation rule

This reconciliation has been performed for this design. Against the live catalog, every registered
activity is present exactly once and no identifier is obsolete. A scan of all saved workflow
templates found six activity types not registered in the catalog:

- `vlmOcrHybrid.extract`, `vlmDirect.extract`, `azureContentUnderstanding.analyze` — research-experiment
  workflows (experiment-03 / 04 / 05 / 07 / 08).
- `document.persistReviewPlan`, `hitl.applyReviewCriteria`, `ocr.recoverNumericZerosFromCheckboxes` —
  the SDPR-specific custom workflow (standard-ocr-workflow-sdpr).

These are experimental or workflow-specific custom nodes, not standard palette activities, and are
out of scope for this restructure. Engineering re-runs this scan before implementation to catch any
activity added after this design was written.

---

## Appendix B — Composite specification template

Each composite story completes:

- **Identity** — display name, category, user outcome, description.
- **Structure** — required activities; required sequence; supported optional activities; supported
  branches; composite input/output ports.
- **Settings mapping** — table of `composite setting → underlying activity → parameter → default → validation`.
- **Authoring behaviour** — add, connect, configure, enable/disable optional steps, duplicate, delete,
  open detailed, return simplified, error handling (per Section 9 contract).
- **Recognition** — exact supported patterns; optional variations; disqualifying changes; ambiguity
  handling; custom-label behaviour (Section 11).
- **Compatibility** — example existing graphs; expected simplified projection; expected detailed
  representation; confirmation the projection does not mutate the saved graph.

---

## 15. Story completion criteria

This design is complete when all of the following are true:

- [x] Appendix A reconciled against the live catalog (Section A.5) — every catalog activity mapped; six out-of-catalog nodes in saved workflows identified as out of scope.
- [ ] Engineering has confirmed or revised the unconfirmed assumptions in Section 3.3 items 5–7.
- [ ] Nine-category set and category descriptions reviewed by Design; terminology open question (Section 5.2) resolved.
- [ ] Default, Advanced, and Internal dispositions reviewed by Design and Engineering.
- [ ] Composite definitions (Section 9) reviewed; Appendix B templates completed for each composite story.
- [ ] Migration strategy (Section 11.1 Option C) confirmed by Engineering as feasible with the current projection model.
- [ ] All open questions in Section 13.2 resolved or explicitly moved to a blocking follow-on story.
- [ ] Follow-on stories from Section 14 created (or linked) with acceptance criteria traced to this document.
- [ ] Document status updated from Draft to the version reviewed.

Until these are complete, this document must not be treated as an implementation source of truth.

---

## Related documents

- [ACTIVITY_PARAMETERS_AUDIT.md](ACTIVITY_PARAMETERS_AUDIT.md)
- [WORKFLOW_SIMPLIFIED_VIEW_GUIDE.md](WORKFLOW_SIMPLIFIED_VIEW_GUIDE.md)
- [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md)
- [GRAPH_TYPES.md](GRAPH_TYPES.md)
- [KIND_TAXONOMY_REFINEMENT_DESIGN.md](KIND_TAXONOMY_REFINEMENT_DESIGN.md)
