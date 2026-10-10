# Workflow Builder — Node Restructure Design

**Status:** Draft
**Companion:** [NODE_RESTRUCTURE_DESIGN_ANNEX.md](NODE_RESTRUCTURE_DESIGN_ANNEX.md) — activity matrix, code findings, migration analysis, engineering criteria

---

## The problem

The current palette has 12 categories. Most of them describe how the system works internally, not
what someone building a workflow is trying to accomplish.

A user who wants to extract text from a document has to know to look in `OCR (Azure)` or
`OCR (Mistral)` — two separate categories for the same task. A user who wants to clean up the
output has to choose between `OCR Cleanup & Correction` and `OCR Quality`, terms that mean nothing
to someone unfamiliar with the underlying pipeline.

This restructure reorganises the palette around what users are trying to do.

---

## The new palette: 9 categories

| Category | What a user uses it for |
|---|---|
| **Input** | Bring a document into the workflow — via upload or an API trigger. |
| **Extract Text** | Turn a document into machine-readable text and, when configured, structured fields. |
| **Document Handling** | Classify, split, reorder, orient, or select pages from a document. |
| **Post-processing** | Clean up, normalise, or enrich what was extracted. |
| **Validation** | Check extracted fields against required formats, values, or business rules. |
| **Data Transformation** | Reshape or reformat extracted results. |
| **Reference Data** | Look up a supporting value from a reference table. |
| **Flow Control** | Decide what happens next, loop over items, wait for a response, or hand off to a person. |
| **Save Results** | Persist accepted results to a destination. |

Today's 12 categories collapse into these 9. The main moves:

- **File upload** and **API endpoint** already sit under **SOURCES** at the top of the palette.
  Only the category label changes — `SOURCES` → `Input` — and the position stays the same.

- `OCR (Azure)` and `OCR (Mistral)` merge into **Extract Text** — the provider is a setting inside
  the node, not a separate category to hunt through.
- `OCR Cleanup & Correction` and `OCR Quality` merge into **Post-processing** — both improve
  extraction output; the internal split between "cleanup" and "quality" isn't meaningful to a user.
- `File Handling` dissolves — the one node that was genuinely user-facing (`file.prepare`) moves
  inside the Extract Text composite; the rest drop to Advanced. "File Handling" and "Document
  Handling" sound like near-synonyms to a user — both could mean "working with a document."
  The technical distinction (File Handling operated on raw bytes in storage; Document Handling
  works on pages and content) was meaningful to the engineers who built the pipeline, not to
  users using it. Dissolving the category removes a label that was never user-meaningful
  to begin with.
- `Data Transformation` + `Reference Data` keep their names and stay as separate categories —
  reshaping data and looking up a reference table are distinct user actions, the same way
  Validation is kept as its own single-node category.

The palette also has a **Custom** section, where users create their own nodes with the
**"+ New custom node"** button. That section is out of scope for this restructure — it stays exactly
as it is today. The 9 categories above cover the built-in nodes; Custom sits alongside them, unchanged.

---

## No more provider hunting

Today, a user who wants to extract text must first decide: Azure or Mistral? Then find the
matching category. Then find the right node within it.

After the restructure, there is one **Extract Text** node. Inside it, a **Provider** selector offers
Azure Document Intelligence or Mistral — like choosing a language in a dropdown. The user makes
one decision: "I want to extract text." The provider choice follows naturally inside the node.

This also means the palette name never needs to change when a new provider is added.

---

## Three places where multiple nodes become one

Three groups of technical steps that currently appear as separate nodes will be presented as single
blocks. The underlying steps still execute; users just see a simpler surface. Detailed view always
shows the individual steps for users who need them.

### Extract Text

Today: up to four nodes in a fixed sequence — **Prepare File**, then **Submit OCR**, then **Wait for
OCR Result** (a polling loop until the job finishes), then **Extract OCR Result**. With Mistral the
sequence is shorter — **Prepare File** then **Process with Mistral OCR** — because Mistral processes
synchronously. Either way, a user placing these has to know the sequence, know that the wait step
is a loop not a single call, and wire everything together in the right order.

After: one **Extract Text** block. The provider preset determines which steps run underneath.

### Classify Document

Today: two nodes in sequence — **Submit Classify**, then **Poll Classify** (waiting until the
classifier job completes). A user has to place both and wire them together.

After: one **Classify Document** block. Primary setting: which classifier to use.

### Process Extracted Text

Today: up to five nodes — **Cleanup**, then optionally **Spellcheck**, **Character Confusion Fix**,
or **Normalize Fields** in any combination, then **Check Confidence** as the final step. A user
has to decide which optional steps are needed, place each one, and know that Check Confidence
belongs at the end.

After: one **Process Extracted Text** block. The optional correction steps are toggles inside it.

---

## Naming philosophy

Two rules drive every name:

1. **Name the user's goal, not the system's mechanism.** "Extract Text" not "OCR (Azure)".
   "Save Results" not "Storage". "Process Extracted Text" not "OCR Cleanup & Correction".
2. **Provider names belong inside a node, not in the palette menu.** The palette answers
   "what do I want to do?" — the node's settings answer "with which provider?".

In practice this means:
- Every node name is a short, verb-first phrase or a recognisable noun.
- No internal IDs, port names, API terms, or pipeline jargon appear in user-facing copy.
- The same default name appears in the palette, the settings panel heading, and the canvas label.
  Users can rename nodes on the canvas; the default is a clean starting point.

---

## Node mapping by new category

Every node grouped by where it ends up. **Currently called** shows the real name in the app today. **Previously in** shows its current category. Nodes marked *new composite* don't exist in the palette today.

### Input
| Visibility | Currently called | Previously in |
|---|---|---|
| Default | File upload | SOURCES (label changes to `Input`) |
| Default | API endpoint | SOURCES (label changes to `Input`) |

### Extract Text
| Visibility | Currently called | Previously in |
|---|---|---|
| Default | **Extract Text** *(new composite)* | — |
| Advanced | Prepare File | FILE HANDLING |
| Advanced | Submit OCR | OCR (AZURE) |
| Advanced | Wait for OCR Result | OCR (AZURE) |
| Advanced | Extract OCR Result | OCR (AZURE) |
| Advanced | Process with Mistral OCR | OCR (MISTRAL) |

### Document Handling
| Visibility | Currently called | Previously in |
|---|---|---|
| Default | **Classify Document** *(new composite)* | — |
| Default | Split & Classify | DOCUMENT HANDLING |
| Default | Select Classified Pages | DOCUMENT HANDLING |
| Default | Flatten Classified Documents | DOCUMENT HANDLING |
| Default | Correct Orientation | DOCUMENT HANDLING |
| Advanced | Submit Classify | OCR (AZURE) |
| Advanced | Poll Classify | OCR (AZURE) |
| Advanced | Split Document | DOCUMENT HANDLING |
| Advanced | Classify Document | DOCUMENT HANDLING |
| Advanced | Extract Page Range | DOCUMENT HANDLING |
| Advanced | Combine Segment Result | DOCUMENT HANDLING |
| Advanced | Read Blob | FILE HANDLING |
| Advanced | Extract Page to Blob | FILE HANDLING |

### Post-processing
| Visibility | Currently called | Previously in |
|---|---|---|
| Default | **Process Extracted Text** *(new composite)* | — |
| Default | Enrich OCR Results | OCR QUALITY |
| Advanced | Cleanup | OCR CLEANUP & CORRECTION |
| Advanced | Normalize Fields | OCR CLEANUP & CORRECTION |
| Advanced | Character Confusion Fix | OCR CLEANUP & CORRECTION |
| Advanced | Spellcheck | OCR CLEANUP & CORRECTION |
| Advanced | Check Confidence | OCR QUALITY |

### Validation
| Visibility | Currently called | Previously in |
|---|---|---|
| Default | Validate Fields | VALIDATION |

### Data Transformation
| Visibility | Currently called | Previously in |
|---|---|---|
| Default | Generic Data Transform | DATA TRANSFORMATION |

### Reference Data
| Visibility | Currently called | Previously in |
|---|---|---|
| Default | Reference Data Lookup | REFERENCE DATA |

### Flow Control
| Visibility | Currently called | Previously in |
|---|---|---|
| Default | Branch by condition | FLOW CONTROL |
| Default | Run for each item | FLOW CONTROL |
| Default | Collect results | FLOW CONTROL |
| Default | Wait until condition | FLOW CONTROL |
| Default | Wait for approval | FLOW CONTROL |
| Default | **Review by Confidence** *(new composite)* | — |
| Default | Sub-workflow | FLOW CONTROL |

### Save Results
| Visibility | Currently called | Previously in |
|---|---|---|
| Default | Store OCR Results | STORAGE |
| Advanced | Update Document Status | STORAGE |
| Advanced | Store Rejection | STORAGE |

---

## What stays visible vs. what moves to Advanced

Not every node belongs in the main palette. The test for staying visible: would its absence block a
common authoring task? If yes, it stays. If it is a granular step, a specialised utility, or usually
assembled inside a composite, it moves to a collapsed **"Show advanced"** section — still fully
usable, just not the first thing a user sees.

**Moves to Advanced** (available, not prominent):

- Individual OCR steps: Submit OCR, Wait for OCR Result, Extract OCR Result, Process with Mistral OCR, Prepare File
- Classifier steps: Submit Classify, Poll Classify
- Correction steps: Cleanup, Normalize Fields, Character Confusion Fix, Spellcheck, Check Confidence
- Low-level document utilities: Split Document, Classify Document, Extract Page Range, Combine Segment Result
- Blob and image utilities: Read Blob, Extract Page to Blob
- Branch-specific storage: Update Document Status, Store Rejection

**Never shown** — Benchmarking activities support internal testing infrastructure and are never
user tools; they stay hidden as they are today.

---

## Before and after — what users see

The simplification is measured by what a user encounters when they open the palette.

| | Today | After restructure |
|---|---|---|
| **Entries visible by default** | **37** | **21** |
| Category labels | 12 (technical names) | 9 (intent-based names) |
| Entries behind "Show advanced" | 0 | 20 |
| Total authorable nodes | 37 | 41 |

Users opening the palette see **21 entries across 9 clearly-named categories**, down from 37
entries across 12 technically-named sections. The 20 nodes moved to Advanced stay fully usable — they
are just not the first thing a user sees. The total rises from 37 to 41 only because four new
composite nodes are added (Extract Text, Classify Document, Process Extracted Text, Review by
Confidence); nothing is removed.

These counts cover the built-in nodes only. The separate **Custom** section (user-created nodes) is
unchanged by this restructure and is not included in the figures above.

---

## What happens to existing workflows

**No existing workflow file changes, and nothing a user has already built is altered.**

The category names and node names live in the palette configuration, not in saved workflow files.
Renaming a category or a node has no effect on anything already saved. If a user has renamed a
node on their own canvas, that custom name is stored separately and is left untouched.

The composites are a *presentation* layer. The individual steps still exist and still run underneath;
the composite is just a simpler way to see and add them. In simplified view, when a workflow's nodes
match one of the composite patterns, they can be shown as a single block — otherwise the individual
steps stay visible exactly as they are now. Detailed view always shows the full underlying structure.

---

## Follow-on stories

Once this design is settled, the following stories can be scoped against it:

1. **Reconcile the activity catalog** — verify every activity has a confirmed category and exposure.
2. **Catalog recategorisation** — apply the new category metadata (no workflow data changes).
3. **Display-name pass** — apply the naming rules to every node across palette, settings, and canvas.
4. **Input category** — rename `SOURCES` to `Input` (nodes and position unchanged).
5. **Extract Text provider preset** — single node with Azure / Mistral selector.
6. **Composite authoring model** — the add/configure/delete/validate behaviour for composite nodes.
7. **Process Extracted Text composite** — the cleanup/correction block with optional toggles.
8. **Review by Confidence composite** — confidence-based routing and optional human review.
9. **Advanced palette section** — collapsed, searchable, fully authorable.
10. **Simplified-view recognition** — recognised activity chains collapse to composite chips.
11. **Compatibility test harness** — confirm existing templates load and display correctly.
12. **Sample-workflow authoring** (the gated epic) — build sample pipelines against the stable taxonomy.

Technical detail for each story — activity IDs, composite behaviour contracts, migration analysis,
engineering acceptance criteria — is in [NODE_RESTRUCTURE_DESIGN_ANNEX.md](NODE_RESTRUCTURE_DESIGN_ANNEX.md).

---

## Related documents

- [NODE_RESTRUCTURE_DESIGN_ANNEX.md](NODE_RESTRUCTURE_DESIGN_ANNEX.md) — technical companion
- [ACTIVITY_PARAMETERS_AUDIT.md](ACTIVITY_PARAMETERS_AUDIT.md)
- [WORKFLOW_SIMPLIFIED_VIEW_GUIDE.md](WORKFLOW_SIMPLIFIED_VIEW_GUIDE.md)
- [WORKFLOW_NODE_CATALOG.md](WORKFLOW_NODE_CATALOG.md)
