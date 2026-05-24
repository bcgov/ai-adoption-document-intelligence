# Visual Workflow Builder — Working Notes

**Status:** Living document. Append as new context arrives; don't synthesise away the original framing.
**Companion:** [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) is the actionable phased plan; this file is the context / vision / research scratchpad behind it.
**Last updated:** 2026-05-23.

## Where each vision thread lives in the plan

A 2026-05-23 gap analysis surfaced that the original IMPLEMENTATION_PLAN.md treated several vision threads as "Phase 8+ polish" when they were actually load-bearing for the AI-builder phase. The plan was re-sequenced; this table is the authoritative cross-reference from each §1 thread to the phase that delivers it. **Update both this table and the plan when a thread moves.**

| Vision thread (§ below) | Delivered by | Status |
|---|---|---|
| §1.1 Typed connections (`Document` / `Segment` hierarchy) | **Phase 3** — see [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md) | Designed; not yet started |
| §1.2 Adjustable types (literal vs reference) | Phase 1A — `VariablePicker` | Shipped |
| §1.3 Workflow-as-API | **Phase 2** (moved from "Phase 8+") | Filed |
| §1.4 Try-in-place without separate deploy | **Phase 4** (renamed from old Phase 3) | Designed in plan |
| §1.5 Per-node previews (ComfyUI inspiration) | **Phase 4** — plus cached re-execution, the half of ComfyUI the previous plan revision missed | Designed in plan |
| §1.6 Dynamic nodes (Windmill) | **Phase 6** | Filed |
| §1.7 AI-built workflows + feedback loop | **Phase 7** — depends on Phase 2 (libraries), Phase 3 (typed I/O), Phase 6 (dynamic nodes) | Filed; dependency graph explicit |
| §1.8 Segmentation node pack | **Phase 5** — produces `Segment[]` artifacts typed by Phase 3 | Researched; filed |
| §1.9 Taxonomy curiosity | §3 below; informed phase ordering | Research-only |
| §2 Designer feedback | Mostly Phase 1A (✓); hover-extend, node-type swap, label review **moved to Phase 1B** | Phase 1B filed |
| §4 Segmentation research | Phase 3 (Segment type) + Phase 5 (the nodes) | Filed |
| §5 Frontend reality (existing components) | Phase 1A used as foundation | Shipped |
| §7 Things to circle back | Mostly Phase 1B closeout items | Most still open |

---

## 1. User vision (the walking notes)

Captured as the original verbal stream of consciousness, lightly organised. Treat the bullets as the source — don't paraphrase them away.

### 1.1 Typed connections between nodes

> *"The workflow system should be driven by nodes that connect through standard types. So for example, clearly you have document, and you could have a document source — for example SharePoint or API input. Document could be single page or multi page. You can put a multi-page document through a splitter, so it generates single page documents. You could potentially then segment documents — that produces essentially document fragments. Nodes themselves are the units that do work. Nodes can be permissive in the sense that we establish clear class structures — so for example multipage document and single page document are both documents."*

Implication 1 — **typed connections**: we eventually want a typed-artifact hierarchy on connections — `Document` as a base, `MultiPageDocument | SinglePageDocument` below it, `Segment` as a fragment, etc. The current engine doesn't honour this (data is blackboard, untyped), so this is a UI-layer assertion: colored/labelled handles + reject type-mismatched draws. **The concrete design is now committed in [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md); delivered in Phase 3 of the post-1A plan.**

Implication 2 — **document sources as nodes**: the quote names "SharePoint or API input" as concrete examples of source-typed nodes that sit at the top of a graph and produce `Document` artifacts. This half of the vision was originally orphaned — the post-1A plan only carried through the type-hierarchy implication. It's now reclaimed as **Phase 8 — Sources** (see [IMPLEMENTATION_PLAN.md §5](IMPLEMENTATION_PLAN.md#phase-8--sources-document-intake-as-nodes)). Until Phase 8 lands, source-style intake is handled either via the workflow-as-API endpoint (Phase 2 Track 2) or — for upload-from-canvas — via Phase 4's try-in-place "Input" affordance, neither of which is a first-class node in the graph.

### 1.2 Some types are adjustable (literal vs reference)

> *"Some types are adjustable, for example integer — you can set it to a fixed value or connect some integer source into it."*

The catalog's `PortDescriptor` + the frontend variable picker handle this: every input slot is either bound to a ctx key (reference) or filled by a static parameter (literal). The settings panel exposes both options where appropriate.

### 1.3 Workflow-as-API

> *"You should be deploying a workflow so you don't talk to the app just through the API. The API allows you to interact with the workflows, so it's a workflow that has an API."*

Largely true today — Temporal exposes the workflow as a runnable entity. What's missing is the editor-side surfacing of *how* to invoke a given workflow externally (the run URL, the input shape, a sample `curl`). **Phase 2** — moved up from the old "Phase 8+" bucket because Phase 7's AI agent + Phase 4's try-in-place both need it.

### 1.4 Impossible to try without deploying — try-in-place

> *"It should be impossible to try workflows without deploying them, so you just launch it and try it out. There should be ways of interacting with that while you are trying it out — for example, I should be able to have an upload node where I can apply the document right through the workflow interface."*

The editor deploys the workflow as a draft on open, and the canvas itself is the test surface. **Phase 3.**

### 1.5 Per-node previews (ComfyUI inspiration)

> *"I should also be able to, for example, output documents into little preview windows that also display right inside the workflow editor — for example being able to see the result of the splitter, page through the documents, or see what some preprocessing is doing."*

> *"I am being inspired by ComfyUI."*

Per-node preview widgets, configurable per node type:
- Split → paginated thumbnail strip (with paging controls)
- OCR → structured fields preview
- Cleanup → before/after comparison
- Switch → highlight active path
- Activity → key-value last-run output

**Phase 3.**

### 1.6 Dynamic nodes (Windmill inspiration)

> *"Can we have dynamic nodes, or basically nodes that you define at runtime, like Windmill?"*

User authors a small TS or Python script with a declared signature → signature drives the form via the same JSON Schema renderer → script becomes a palette entry. **Phase 6.**

### 1.7 AI-built workflows + feedback loop

> *"It would be nice to be able to instruct an AI agent to build these workflows for you on the fly by porting scripts into Windmill and turning them into nodes and activities."*

> *"Have it work in a feedback loop where it sets up the pipeline and tests it, and if something is not working it tweaks the code, reruns it until it delivers what the user asked for."*

> *"We can pass to the activity of this agent by running it here inside of Claude Code, so it's possible to build this agent by modifying an instruction file and then run it as the sub agent from the current conversation."*

The agent is a Claude Agent SDK sub-agent with a constrained tool allowlist:
- read catalog → know what activities exist
- read library workflows → know what reusable units exist
- write workflow JSON → propose a workflow
- deploy + run on sample document → test it
- read results, diff against expected → revise

When the agent needs a custom node, it writes a Windmill-style script (Phase 6), which automatically becomes a palette entry. **Phase 7.**

Likely consumes the existing `@ai-di/graph-insertion-slots` package (Dylan's earlier work) as the contract for "where in this workflow can the agent splice nodes?"

### 1.8 Segmentation curiosity

> *"I am also curious about segmentation. I know Azure Content Understanding somehow does segmentation, and some of the services do as well. Can you look up how they do it and different products that do it, how can we implement it ourselves? For example I want to be able to extract the segment out of a document and then pass it to a particular OCR or VLM."*

See §4 below for research findings.

### 1.9 Taxonomy curiosity

> *"In fact, determine the full taxonomy of things that I would need. What are all the building blocks to this thing? Does this collection of building blocks have a formal name in workflow systems? If so, what is it, and what models for this already exist out there that we can borrow from?"*

See §3 below.

---

## 2. Designer conversation outcomes

From two design conversations. Decisions worth carrying forward:

- **Drop generic "Activity" node with a dropdown.** Expose distinct activity types directly in the palette/menu, with search. the designer: *"activity does not say anything to me as a user… probably something like extraction or something."* Alex: *"activity is kind of like a high level concept which people don't need to be aware of."* → Decision in [IMPLEMENTATION_PLAN.md §3.2](IMPLEMENTATION_PLAN.md#32-one-distinct-palette-entry-per-activity-type).
- **Click-to-add + hover-to-extend.** No drag-from-palette as primary; chosen pattern is click `+` → menu → select → node placed near the originating node. Drag still supported as alternative.
- **Config in a popup on click**, not always-on (ComfyUI-style). the designer: *"I'm hoping the user is not very tech savvy… we would probably want less visual noise."*
- **Allow node-type swap** (change a node's type in place, preserving overlapping config). the designer's specific request: *"I created this activity, but then I need to change it to some other… I just have to delete this and then create another one and re-link those again."*
- **User-friendly labels over engineering terms.** the designer mapped Alex's `loop / map / switch / wait-retry` to *"Document upload / OCR processing / AI extraction / Conditional human reviews / Export"*. Decision: keep engineering primitives in the schema; surface user-friendly display names in the palette + on the node.
- **Simplify config field labels.** the designer: *"Activity type and label is fine, but then what is the retry count?"* → either rename, or add inline help text. The schema-driven renderer uses `.describe()` text as help.
- **Typed multi-handle ports (ComfyUI-style) — the designer pushed back.** Position: prefer single-purpose nodes (one input, one output, doing one thing) over multi-typed connectors. Multiple wires into one node is fine; multiple *typed* connectors is what they'd avoid. Alex's "noodles problem" observation reinforces. Net effect: aligns with the I/O model decision doc (Model A); typed-artifact handles are deferred and treated as a *UI hint*, not engine semantics.
- **ComfyUI inspiration accepted partially.** Per-node previews + cached re-execution: yes. Always-on dense node UIs with many typed handles: no.
- **AI-built workflows confirmed as the long-term primary creation path.** Alex: *"If you just talk to a chat and it kind of builds the workflow for you… AI has that capability."* The visual editor is for inspection and manual edits, not the primary creation path.

---

## 3. Workflow system taxonomy (research)

**What we're building:** a typed, visual *dataflow programming* environment over a DAG — specifically a *Flow-Based Programming (FBP)* style editor, compiled to a durable workflow execution engine (Temporal).

Formal terms:

- **Dataflow Programming (DFP)** — umbrella paradigm: programs as graphs of operations connected by data-carrying edges
- **Flow-Based Programming (FBP)** — J. Paul Morrison, 1971 — async subclass with named ports, bounded buffers, back-pressure
- **Visual Programming Languages (VPLs) / Dataflow Visual Programming Languages (DFVPLs)** — UI-layer term
- **Kahn Process Networks (KPN)** — async, blocking reads / non-blocking writes, deterministic — closest match for streaming documents between nodes
- **Synchronous Dataflow (SDF)** — fixed token rates per firing; too rigid for variable per-page output
- **Dataflow Process Networks (Lee/Parks)** — KPN with discrete "firings" — what ComfyUI effectively implements
- **Pipes-and-filters** — the architectural-style cousin; weaker (linear, untyped)

Since the backend runs Temporal, the full system is **an FBP/DPN authoring surface compiled to a durable orchestrator** — hybrid of visual dataflow (design time) and durable workflow execution (runtime).

### Established systems we borrow from

| System | Ports typed? | Sync vs async | Sub-workflows | Live preview | Dynamic nodes | AI assist | Killer concept |
|---|---|---|---|---|---|---|---|
| **ComfyUI** | Yes (strong types, color-coded) | Sync DAG, lazy eval w/ cache | Groups + node packs | Yes (per-node) | Yes (custom_nodes load at runtime) | Community workflows | Cached re-execution of an immutable typed DAG |
| **n8n** | Loose (JSON items) | Async | Yes ("Execute Workflow" node) | Per-node output panel | Yes (Code/HTTP nodes) | AI nodes | Item-array data model + JS/Python escape hatches |
| **Make.com** | Loose | Async, scenario | Routers/iterators, not true sub-flows | Run inspector | No | Limited | Visual iterators/aggregators on a canvas |
| **Zapier** | None | Async, linear | No | Test step | No | Yes | Trigger→action simplicity |
| **Airflow** | No (XCom blobs) | Async | SubDAGs/TaskGroups | Logs only | TaskFlow API | Limited | Scheduled DAGs-as-code |
| **Prefect** | Typed via Python | Async, dynamic | Subflows | Logs | Runtime graph | Limited | Pythonic dynamic graphs |
| **Dagster** | **Yes** (software-defined *assets*) | Async | Asset groups | Asset materializations | Some | No | Asset-centric lineage |
| **Windmill** | Typed (TS/Python signatures) | Async | Flows-of-scripts | Per-step output | Yes (any script) | Yes | Script ↔ node duality, Rust scheduler |
| **Temporal** | Typed (code) | Async, durable | Child workflows | None | Code | No | Event-sourced determinism / replay |
| **Node-RED** | Loose (msg objects) | Async | Subflows | Debug node | Custom nodes | Limited | IoT message-passing flows |
| **Power Automate / Logic Apps** | Schema'd | Async | Yes | Run history | Connectors | Copilot | Enterprise connector library |
| **LangFlow / Flowise** | Typed (LangChain components) | Async | Yes | Playground | Custom Python/JS | Native | LLM components 1:1 to nodes |
| **LabVIEW / Simulink** | **Strongly typed**, colored/shaped wires | Sync dataflow | VIs / subsystems | Yes (probes) | Limited | No | Color-coded typed wires + data-availability execution |
| **KNIME / Alteryx / RapidMiner** | **Yes** — port-shape enforces "data→data, model→model" | Sync | Metanodes/components | Per-node preview | Limited | Some | Typed-port discipline for analytics |
| **Houdini / Blender Geometry Nodes** | Yes (typed, colored sockets) | Lazy procedural | HDA / node groups | Viewport | Yes (HDAs) | Limited | Pure procedural recompute |

### Closest analogs to copy from

1. **ComfyUI** — strong typing, per-node previews, runtime-registered custom nodes, cached re-execution. The closest visual+execution model overall.
2. **Dagster** — typed *asset / lineage* concept so that "an OCR result for page 3 region 2" is a first-class versioned artifact, not an opaque XCom.
3. **LabVIEW / KNIME** — typed-port shape/color enforcement so users can't wire `PDFPage[]` into a `TableRegion` input.

**Honourable mention:** Windmill as the script-as-node escape hatch model for power users.

Sources:
- [Devopedia — Dataflow Programming](https://devopedia.org/dataflow-programming)
- [Ptolemy — Dataflow Process Networks](https://ptolemy.berkeley.edu/publications/papers/95/processNets/)
- [Kahn Process Network — ScienceDirect](https://www.sciencedirect.com/topics/computer-science/kahn-process-network)
- [Python Wiki — FBP](https://wiki.python.org/moin/FlowBasedProgramming)
- [ComfyUI Workflow docs](https://docs.comfy.org/development/core-concepts/workflow)
- [Workflows: Windmill vs n8n vs Langflow vs Temporal](https://dev.to/frederic_zhou/workflows-windmill-vs-n8n-vs-langflow-vs-temporal-choosing-the-right-tool-for-the-job-23h5)

---

## 4. Document segmentation (research)

Per the user's prompt: *"how does Azure Content Understanding do segmentation? How can we implement it ourselves? For example I want to be able to extract the segment out of a document and then pass it to a particular OCR or VLM."*

### How existing tools segment

| Tool | Segmentation kind | Output | How to grab a sub-region |
|---|---|---|---|
| **Azure Content Understanding** | Semantic chunks that **span pages**, Markdown-structured, headings as boundaries, images + tables extracted with location metadata | Markdown chunks + image refs + bboxes | Chunk objects carry location metadata; pass that region to downstream model |
| **Azure Document Intelligence (Layout)** | Region-level: paragraphs, tables, selection marks, figures, reading order; **page-bounded** | `boundingRegions` (page + polygon) per element; tables w/ cell refs | Crop by polygon → send to VLM |
| **Unstructured.io** | Region elements (Title, NarrativeText, Table, Image) via `hi_res` (Detectron2/YOLOX/layout_v1.1) or text-only `fast` | Element list with coordinates + type | Filter by type/page, crop coords |
| **LayoutParser / Detectron2** | Region: Text / Title / List / Table / Figure via PubLayNet, PrimaLayout | `(x1,y1,x2,y2)` + class + score | Crop, feed to OCR/VLM |
| **Marker** (Surya) | Page-aware layout, reading order, tables | Markdown + JSON with blocks | Block-level slicing |
| **Nougat** | Full-page academic OCR with math/tables | `.mmd` Markdown | Page-only, no fine regions |
| **Mathpix** | STEM-focused full-page + equations | LaTeX / MMD | Page-only |
| **IBM Docling** | Region segmentation via RT-DETR on DocLayNet (11 classes incl. headings, tables, figures), reading order, semantic structure → Markdown | Bounding boxes + logical hierarchy + Markdown | Element ID → bbox → crop |
| **pdfplumber / pdfminer.six** | Char/line/word/rect primitives, no semantic types | Coordinates per token | Manual rules |
| **Mistral OCR** | Page array → Markdown + image bboxes + tables + headers/footers + dimensions; "Annotations" API attaches schemas to regions and returns bboxes | JSON pages with Markdown + image/table placeholders + bboxes | Page index + bbox → crop |
| **LangChain `RecursiveCharacterTextSplitter`** | Pure text, separators `["\n\n", "\n", " ", ""]` | Text chunks | N/A (post-OCR only) |
| **LlamaIndex `SemanticSplitterNodeParser`** | Embedding-similarity breakpoints between sentences | Text chunks | N/A (post-OCR only) |
| **Sub-document boundary** (LandingAI ADE Split, Extend, Sensible, Docsumo) | Detects "doc A ends, doc B begins" within one PDF via rules or LLM classification | Page-range groupings + classification labels | Slice PDF by page range → route by class |

### Recommended segmentation architecture (Phase 5)

A **three-tier segmentation stack as composable typed nodes**, each producing a first-class `Segment` artifact (`{ parentDocId, pageRange, polygon, type, confidence }`):

1. **Sub-document splitter node** — LLM-based or rules-based splitter classifies+splits a bundle into logical documents (LandingAI ADE Split / Sensible pattern). Output: `Document[]` with page ranges + class.
2. **Layout segmenter node** — Docling (RT-DETR on DocLayNet) or Azure DI Layout as a swappable backend. Output: `Region[]` with bbox + class (text / table / figure) per page.
3. **Semantic chunker node** — for post-OCR text, LlamaIndex `SemanticSplitterNodeParser` or Azure Content Understanding's cross-page Markdown chunker.

Plus a `segment.crop` node that extracts a region as a new single-page `Document` for downstream specialised OCR / VLM.

Every `Segment` carries `(parentDocId, pageRange, polygon, type)` so any downstream typed node (Mistral OCR, table-specific VLM, signature classifier) can accept `Segment<Table>`, `Segment<Figure>`, etc. — enforceable in the canvas once Phase 4 typed handles land.

Sources:
- [MS Learn — Content Understanding skill](https://learn.microsoft.com/en-us/azure/search/cognitive-search-skill-content-understanding)
- [MS Learn — semantic chunking](https://learn.microsoft.com/en-us/azure/search/search-how-to-semantic-chunking)
- [MS Learn — Document Intelligence Layout model](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout?view=doc-intel-4.0.0)
- [Unstructured.io — Partitioning](https://docs.unstructured.io/open-source/core-functionality/partitioning)
- [LayoutParser docs](https://layout-parser.readthedocs.io/en/latest/api_doc/models.html)
- [IBM Docling — arXiv](https://arxiv.org/html/2501.17887v1) / [DocLayNet](https://huggingface.co/datasets/ds4sd/DocLayNet)
- [Mistral OCR docs](https://docs.mistral.ai/studio-api/document-processing/basic_ocr) / [Annotations](https://docs.mistral.ai/capabilities/document_ai/annotations)
- [LandingAI ADE Split](https://landing.ai/blog/splitting-multi-document-pdfs-at-scale-with-ade-split)
- [Sensible — splitting multi-document PDFs](https://www.sensible.so/blog/splitting-multi-document-pdfs-with-llms)
- [LlamaIndex semantic chunker](https://developers.llamaindex.ai/python/examples/node_parsers/semantic_chunking/)

---

## 5. Frontend reality (what we're building on)

What already exists in `apps/frontend/` that the new editor builds on, rather than replaces:

- **[GraphVisualization.tsx](../../apps/frontend/src/components/workflow/GraphVisualization.tsx)** (47KB, sophisticated, read-only) — keep and make interactive:
  - All 7 node shapes (rotated-square diamond Switch, Map container with dashed border, child-workflow with `IconCornerDownRight` + workflow ID, `data.transform` showing "JSON → XML" pills)
  - **Node groups → simplified-view collapsing** — already implemented when `viewMode === "simplified"`
  - Map containers framing their body nodes, body-layer computation via BFS
  - Switch-edge auto-labelling from condition with **staggered positioning** so siblings don't overlap
  - Error highlighting via validator output
  - Dagre auto-layout, mini-map, group icons
- **[GraphConfigFormEditor.tsx](../../apps/frontend/src/components/workflow/GraphConfigFormEditor.tsx)** (28KB) — old JSON-driven editor. Salvage:
  - The four inline forms for `switch / map / join / pollUntil / humanGate / childWorkflow` (these are usable as starting points for the new control-flow node panels)
  - The accordion + ctx editor pattern (move into the new workflow-settings drawer)
  - **Do not** salvage the activity-side: only 3 of 25 activities have custom forms (`azureClassify.submit`, `document.selectClassifiedPages`, `document.flattenClassifiedDocuments`); the rest fall through to a generic catch-all
- **[AzureClassifySubmitForm.tsx](../../apps/frontend/src/components/workflow/AzureClassifySubmitForm.tsx)** — the canonical "override the generic renderer when you need an API call" pattern (queries classifier list via `useClassifier`, shows a Mantine `Select`)
- **[mantine-form-zod-resolver](../../apps/frontend/src/features/tables/components/RowForm.tsx) + [build-row-zod-schema.ts](../../apps/frontend/src/features/tables/utils/build-row-zod-schema.ts)** — existing pattern in the tables feature that proves "dynamic Zod schema → Mantine form" works in this codebase
- **`useCreateWorkflow` / `useUpdateWorkflow` hooks** — wire save/load through these unchanged

---

## 6. Shared package status

`packages/graph-workflow` (`@ai-di/graph-workflow`) — Dylan's consolidation, sitting on `origin/AI-1192`, not yet merged to develop. Contents on the branch we're working from:

- `src/types.ts` — `GraphWorkflowConfig`, all node interfaces (the schema)
- `src/validator/validator.ts` — save-time / execute-time schema validator
- `src/validator/context-utils.ts` — `doc.*` / `segment.*` namespace rewriting

What we add (Phase 1A):

- `src/catalog/types.ts` — `ActivityCatalogEntry`, `PortDescriptor`, `CatalogCategory`
- `src/catalog/activities/<activity>.ts` — one file per activity type, exports a catalog entry + Zod parameter schema
- `src/catalog/index.ts` — `ACTIVITY_CATALOG`, `getActivityCatalogEntry()`, `getActivityParametersJsonSchema()`, `listActivityTypes()`

See [../SHARED_PACKAGES.md](../SHARED_PACKAGES.md) for Dylan's convention.

---

## 7. Things to circle back on

- Decide on the metadata vocabulary for `.meta({ ... })`: current convention `x-widget`, `x-options`, `x-default` — formalise once a few activities are in.
- Drop the floating `ContextVariablesPanel` from the designer's prototype; merge its content into the workflow-settings drawer.
- Investigate `apps/frontend/src/pages/WorkflowPage.tsx` and `WorkflowEditPage.tsx` (alongside the JSON `WorkflowEditorPage.tsx`) to confirm what's still in active use — three workflow pages is one too many.
- Confirm Tabler icon mapping for the catalog's `iconHint` field.
- When AI-1192 lands, merge develop in and resolve any conflicts.
