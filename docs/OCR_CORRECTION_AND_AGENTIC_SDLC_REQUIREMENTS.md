# OCR Correction Tools and Agentic SDLC — Requirements

**Context:** Agentic SDLC. This document is the single source of requirements for automatic development. Implement in dependency order; each section may be split into user stories or tasks.

**Feature split:** Requirements are implemented in two features. **Feature 004** (OCR Correction Tools and Benchmark Comparison) covers Sections 1–6 and Section 10: confusion matrices, correction tools, AI HITL processing, workflow modification utility, and benchmark integration so you can **run the baseline, make corrections, and have AI review the results**; design decisions can be made from there. **Feature 005** (Agentic SDLC Workflow Replacement and Feedback Loop) covers Sections 7–9: conditional workflow replacement, the full Temporal feedback loop, and AI-generated nodes exploration; it is implemented later. See [feature-docs/004-ocr-correction-agentic-sdlc/](../feature-docs/004-ocr-correction-agentic-sdlc/) and [feature-docs/005-agentic-sdlc-workflow-replacement/](../feature-docs/005-agentic-sdlc-workflow-replacement/).

**Benchmarking:** Sections 6–8 build on the existing **benchmarking system** (feature 003). That system already provides: benchmark projects and definitions, versioned datasets with ground truth (DVC-backed), benchmark runs via Temporal, schema-aware and black-box evaluators, baseline promotion, regression comparison with configurable thresholds, scheduled runs, and regression reporting. OCR/Agentic SDLC requirements use that system for "current workflow" vs "candidate workflow" comparison and degradation detection; no separate benchmark implementation is required.

**Related docs:** [ENRICHMENT.md](./ENRICHMENT.md), [HITL_ARCHITECTURE.md](./HITL_ARCHITECTURE.md), [graph-workflows/DAG_WORKFLOW_ENGINE.md](./graph-workflows/DAG_WORKFLOW_ENGINE.md), [graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md](./graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md), [benchmarking/BENCHMARKING_GUIDE.md](./benchmarking/BENCHMARKING_GUIDE.md), [feature-docs/003-benchmarking-system/REQUIREMENTS.md](../feature-docs/003-benchmarking-system/REQUIREMENTS.md).

**Step-by-step implementation:** **Feature 004** (steps 1–4): [feature-docs/004-ocr-correction-agentic-sdlc/](../feature-docs/004-ocr-correction-agentic-sdlc/) — confusion matrices, correction tools, AI HITL processing, benchmark integration. **Feature 005** (steps 1–3): [feature-docs/005-agentic-sdlc-workflow-replacement/](../feature-docs/005-agentic-sdlc-workflow-replacement/) — conditional replacement, feedback loop, AI-generated nodes exploration. See each feature’s README for implementation order and step docs.

---

## 1. Scope and goals

- **OCR correction tools:** A set of tools (activities and/or correction nodes) that can correct OCR errors in extracted text/fields.
- **HITL-driven augmentation:** Use AI to process HITL feedback and let AI choose which tools to add to the workflow to address those issues.
- **Safe rollout:** Run new workflow tests in the background and compare to current workflow benchmarks; if no degradation is detected, replace the current workflow with the new one that incorporates HITL-derived corrections.
- **Correction building blocks:** Simple correction nodes (e.g. spellcheck), confusion-matrix–aware corrections, and exploration of AI-generated custom correction nodes.
- **Enrich vs standalone correction:** The existing **ocr.enrich** activity remains the default, broad enrichment path (field schema, built-in rules including character confusion, optional LLM). Standalone correction activities (spellcheck, character-confusion, normalize) are an **alternative composition model**: they operate on the full OCR result shape and allow workflows to be made more specific (e.g. add only spellcheck for a document type, or insert character-confusion with a custom map). Workflows may use either the default enrich or a sequence of standalone correction activities, or both in a defined order to avoid double-application.

---

## 2. Confusion matrices (reference)

**Definition:** A confusion matrix for OCR records, per character (or token), how often the **true** character was recognized as each **recognized** character. Rows = ground truth, columns = OCR output (or vice versa). Cells = counts or rates.

**Use in this system:**

- **Error analysis:** Identify which character pairs are most often confused (e.g. `0`/`O`, `1`/`l`, `5`/`S`) to prioritize and tune correction rules.
- **Correction rules:** Feed confusion statistics into rule-based or learned correctors (e.g. `fixCharacterConfusion` in `apps/temporal/src/activities/enrichment-rules.ts`) and into any character-level or word-level correction nodes.
- **Benchmarking:** Compare OCR output vs ground truth (e.g. from HITL corrections) to compute accuracy and per-character error rates; optionally maintain/update confusion matrices from production data. The existing benchmarking system (see Section 11) provides runs, evaluators, and metrics for this; schema-aware or black-box evaluators can emit field-level and character-level metrics as needed.

**Requirements:**

- The system SHALL support deriving or ingesting confusion-matrix–style data (ground truth vs OCR) for analysis and tuning.
- Correction tools MAY use confusion-matrix–derived mappings or weights to apply character-level corrections (aligned with existing `fixCharacterConfusion` and future correction nodes).

---

## 3. OCR correction tools (set of tools)

**Requirement:** Provide a set of tools that can correct OCR errors.

**Details:**

- **Tools** are implementable as graph workflow **activities** (see ADDING_GRAPH_NODES_AND_ACTIVITIES.md) and/or as **correction nodes** that operate on workflow context (e.g. `ctx` fields or OCR result structures).
- Each tool SHALL have a well-defined input/output contract. **For this feature, tools SHALL operate on the full OCR result shape** (e.g. the structure containing keyValuePairs, documents, or equivalent): inputs = full OCR result (and optional parameters such as field scope, language, confusion map); outputs = corrected OCR result and optional change metadata. Operating on the full shape keeps composition simple and aligns with how `ocr.enrich` works; per-field or per-string tools may be considered in a later iteration.
- Tools SHALL be composable in a workflow (e.g. after post-OCR cleanup, before or after confidence check, and consistent with `ocr.enrich` placement in ENRICHMENT.md).

**Suggested initial tools (to be implemented as specified, not as placeholders):**

1. **Spellcheck correction:** Given a string (or field value) and optional language/domain, return a corrected string and list of changes (e.g. word → correction). May use an existing spellcheck library or API; no placeholder implementations.
2. **Character-confusion correction:** Extend or reuse existing `fixCharacterConfusion` behavior (see `enrichment-rules.ts`) as a callable tool/activity usable in graph workflows, with optional confusion-map override (e.g. from confusion matrix data).
3. **Simple correction nodes (additional):** At least one other deterministic correction (e.g. trim/normalize whitespace, normalize digits/dates) exposed as a graph activity or node with the same input/output conventions.

**Acceptance:**

- At least two distinct correction tools are implemented and registered in the activity registry (backend + Temporal).
- Each tool is covered by tests and documented in `/docs`.

---

## 4. Simple correction nodes

**Requirement:** Implement simple correction nodes that can be used in graph workflows.

**Details:**

- **Spellcheck:** A node/activity that performs spellcheck on the full OCR result (with configurable scope, e.g. field keys or document type). Output: corrected OCR result and change summary (for HITL/audit).
- **Other simple nodes:** At least one additional correction type (e.g. character confusion, trim/normalize) as a first-class activity/node, operating on the full OCR result shape, with parameters (e.g. field types to which it applies) and results written back to `ctx` or OCR result shape.

**Acceptance:**

- Spellcheck is available as an activity (or node) in the graph workflow engine and is documented.
- At least one other simple correction node/activity is implemented and wired into the graph (types, registry, validation per ADDING_GRAPH_NODES_AND_ACTIVITIES.md).

---

## 5. AI processing of HITL feedback and tool selection

**Requirement:** Use AI to process HITL feedback and let AI choose tools to add to the workflow to correct the issues reflected in that feedback.

**Details:**

- **Inputs:** Aggregated HITL feedback (e.g. from `FieldCorrection` and review sessions — see HITL_ARCHITECTURE.md): field_key, original_value, corrected_value, action (e.g. corrected, flagged). The system SHALL provide a **query or API** that returns this aggregated correction data (e.g. all corrections in a time window or for a document type), not only high-level analytics counts. The existing `getReviewAnalytics` and per-session correction APIs do not expose per-field original/corrected pairs; an aggregation path (new endpoint, service method, or activity that queries `FieldCorrection` with the needed filters and shape) SHALL be implemented so the AI pipeline can consume it.
- **AI processing:** An AI component (e.g. LLM) analyzes patterns in corrections (repeated confusions, misspellings, format errors) and outputs a structured recommendation: which correction tools/nodes to add, where in the workflow, and with what parameters (e.g. which field types, which confusion map).
- **Tool selection:** The system SHALL allow the AI to pick from the set of registered OCR correction tools (Section 3) and optionally suggest ordering or parameters. The **pipeline SHALL expose the list of available tools and their parameter schemas** to the AI (e.g. via a registry extension, a manifest, or a dedicated schema)—so the AI can recommend from the actual set with correct parameter names and types. The output format SHALL be machine-readable (e.g. JSON schema) so a downstream step can apply it.

**Acceptance:**

- There is a defined pipeline or activity that: (1) takes HITL-derived correction data as input, (2) calls an AI service with a clear prompt/schema, (3) returns a list of recommended tools and placement/parameters.
- The recommendation format is documented and non-ambiguous (no "placeholder" outputs).

---

## 6. Automatic workflow tests and benchmark comparison

**Requirement:** Automatically run new workflow tests in the background and compare results to benchmarks from the current workflow.

**Details:**

- **Use the existing benchmarking system:** The platform already provides projects, definitions (dataset version + split + workflow + evaluator), runs, and baseline comparison. The "current" workflow SHALL be represented by a **baseline run** in that system (a promoted run for a benchmark definition that uses the current workflow and a fixed benchmark dataset). The benchmark dataset, ground truth, and metrics are defined via Benchmark Definition and Dataset/Dataset Version (see [BENCHMARKING_GUIDE.md](./benchmarking/BENCHMARKING_GUIDE.md)).
- **Workflow versioning (candidate vs baseline):** The system SHALL support **workflow versioning** so that iteration is over a single logical workflow. The "current" workflow is a designated workflow (e.g. by workflow id, or by name + active version). A **candidate** workflow is produced by applying the AI recommendation to the current workflow (see workflow modification utility below) and is persisted as a **new version** (e.g. a new `Workflow` record or a new version field). Benchmark runs SHALL be able to use the **same** benchmark definition for both the baseline and the candidate: e.g. the run-start API or workflow input accepts an optional **workflow override** (workflow id or version) so that the run executes with the candidate workflow config while still belonging to the same definition. Baseline comparison then compares runs within the same definition (baseline run vs candidate run); no separate definition or baseline promotion is required for the candidate.
- **Candidate workflow:** A candidate workflow (current workflow + AI-suggested correction nodes) is run on the same benchmark definition dataset/split, using the same definition with an optional workflow override so that baseline comparison applies. Runs execute asynchronously on the benchmark-processing queue.
- **Comparison:** The benchmarking system already compares each new run to the baseline run using configurable thresholds (absolute or relative per metric) and produces pass/fail and regression severity. The system SHALL use this comparison as the degradation signal: no degradation when the baseline comparison reports pass for all configured metrics.
- **Workflow modification utility:** Producing a candidate workflow requires a **workflow modification utility** that takes the current graph config and the AI recommendation (tools + placement + parameters) and returns a new graph config (and optionally persists a new workflow version). This is non-trivial: the graph is a DAG; inserting a node requires choosing an edge to split (e.g. between `ocr.extract` and `ocr.enrich`), removing that edge, adding the new node, and wiring two new edges with correct port bindings; `ctx` declarations may need to be updated. The utility SHALL be implemented and its constraints and behaviour documented (e.g. supported insertion points, handling of port bindings). Placeholder or partial implementations are not acceptable; the scope may be limited to a defined set of insertion points or recommendation shapes in the first iteration.
- **Evaluators:** If existing evaluators (schema-aware, black-box, field-accuracy) do not emit metrics suitable for OCR correction quality (e.g. character-level or field-level accuracy), the system SHALL support **adding new evaluator types**. See Section 10 (Design and implementation notes) for the mechanism.

**Acceptance:**

- OCR workflow comparison uses the existing benchmarking APIs and data model (benchmark project, definition, dataset version, split, baseline run, thresholds).
- A job or automation starts a benchmark run for the candidate workflow (same or new definition as appropriate) and waits for completion.
- The pass/fail (or degradation yes/no) result is taken from the existing baseline comparison result for that run; criteria are the thresholds configured when the baseline was promoted.

---

## 7. Conditional workflow replacement (no degradation)

**Requirement:** If no degradation is detected, replace the current workflow with the new one that corrects issues detected via HITL.

**Details:**

- **Trigger:** After a candidate workflow is tested (Section 6) and the benchmarking system's baseline comparison for that run reports no degradation (pass for all thresholds).
- **Workflow versioning and "current" workflow:** The system SHALL use **workflow versioning** so that there is a single notion of "current" production workflow (e.g. a designated workflow id, or a pointer such as "workflow name X, active version N" or a default workflow id used at upload time). Documents today get `workflow_config_id` at upload; that id SHALL resolve to the active workflow (e.g. the latest version of the designated workflow, or the workflow record that is marked as default). Implementation may use the existing `Workflow` model (e.g. new row per version with a separate "active" pointer or default workflow id in config/settings).
- **Action:** When the baseline comparison reports no degradation, the system SHALL set the **candidate workflow as the new current version** (e.g. update the active workflow pointer to the new workflow id or version). Replacement SHALL NOT overwrite the previous workflow record in place; it SHALL create or designate a new version so that history and rollback remain possible.
- **Safety:** Replacement SHALL occur only when the baseline comparison has explicitly reported no degradation. Rollback or versioning strategy (e.g. keep previous workflow as fallback) MAY be specified in a separate implementation note.

**Acceptance:**

- There is a defined process or automation that: (1) reads the baseline comparison result for the candidate run from the benchmarking system, (2) if no degradation, updates the current workflow to the candidate workflow in the runtime/config store, (3) persists the new config/version.
- No replacement occurs when degradation is detected or when the comparison has not been run.

---

## 8. AI feedback loop with benchmarking

**Requirement:** Set up an AI feedback loop with benchmarking.

**Details:**

- **Loop:** HITL corrections → AI analysis (Section 5) → suggested workflow changes (workflow modification utility) → start benchmark run for candidate workflow (Section 6, same definition with workflow override) → baseline comparison (existing) → if no degradation, replace workflow (Section 7) → (optional) collect new HITL data and repeat.
- **Orchestration:** The end-to-end loop SHALL be implemented as a **Temporal workflow** (or a Temporal schedule that starts such a workflow). This provides durability, visibility, and the ability to wait for the benchmark run to complete and then read the comparison result and conditionally replace. The loop workflow MAY call activities that: fetch aggregated HITL data, call the AI recommendation pipeline, run the workflow modification utility, start the benchmark run (e.g. via an activity that invokes the existing start-run path or starts the benchmark run as a child workflow), wait for run completion, read the baseline comparison from the run record, and perform the replacement when appropriate. Trigger (on-demand, schedule, or event) SHALL be documented.
- **Benchmarking:** The existing benchmarking system provides the metrics and comparison; baseline promotion and regression thresholds SHALL be the gate for promoting a new workflow. The same metrics are available for reporting and monitoring via run details, regression reports, and MLflow.

**Acceptance:**

- End-to-end flow is documented and implementable: HITL data in → AI recommendation → start candidate benchmark run → wait for run completion → read baseline comparison result → conditional replacement.
- Benchmark metrics and comparison are provided by the existing system; OCR/Agentic automation consumes them via the benchmarking APIs.

---

## 9. AI-generated custom correction nodes (exploration)

**Requirement:** Explore having AI generate custom correction nodes on the fly.

**Details:**

- **Exploration:** Investigate and document approaches where an AI (e.g. LLM) generates a correction node or rule (e.g. a small function, a config for an existing node type, or a structured rule set) from HITL patterns or from a natural language description.
- **Safety and validation:** Any generated node SHALL be validated (e.g. schema, sandbox, or review) before being used in a workflow; the requirements for that validation SHALL be documented.
- **Scope:** This is an exploration requirement: document options, constraints (e.g. determinism for Temporal), and recommend whether to implement "generate config" vs "generate code" vs hybrid; no placeholder implementations.

**Acceptance:**

- A short design/exploration document in `/docs` describes at least two approaches (e.g. AI-generated rule config vs AI-generated code), risks, and validation strategy.
- If one approach is implemented, it includes validation and is documented; otherwise only the exploration doc is required.

---

## 10. Design and implementation notes

- **Creating new evaluators:** The benchmarking system uses a pluggable evaluator registry (`EvaluatorRegistryService`). To add a new evaluator type (e.g. for OCR correction quality or character-level metrics): (1) implement the `BenchmarkEvaluator` interface (`type`, `evaluate(input: EvaluationInput): Promise<EvaluationResult>`); (2) register the evaluator in the benchmark module (e.g. in `BenchmarkModule.onModuleInit()` or via a provider that calls `evaluatorRegistry.register(evaluator)`); (3) document the evaluator type and its `evaluatorConfig` schema in `/docs`. The evaluator receives per-sample paths (input, prediction, ground truth) and metadata; it returns metrics (numeric key-value for aggregation), diagnostics, optional artifacts, and pass/fail. New evaluators can be added without changing the benchmark run workflow; the definition’s `evaluatorType` must match a registered type. See `apps/backend-services/src/benchmark/evaluator.interface.ts`, `evaluator-registry.service.ts`, and `benchmark.module.ts`.

---

## 11. Implementation order (for automatic development)

**Feature 004** (implement first — run baseline, make corrections, AI review results):

1. **Confusion matrices:** Document and, if applicable, implement ingestion/derivation of confusion-matrix–style data (Section 2).
2. **OCR correction tools:** Implement at least three correction tools and simple correction nodes, including spellcheck (Sections 3 and 4).
3. **AI HITL processing:** Implement AI processing of HITL feedback and tool-selection output (Section 5).
4. **Integrate with benchmarking system:** Use the existing benchmarking system for Section 6. Define (or reuse) a benchmark project and definition for the OCR workflow; support workflow versioning and an optional workflow override when starting a run so the candidate can be run under the same definition. Establish a baseline run for the current workflow. Implement the workflow modification utility (graph edit + optional persistence of new workflow version). Add automation (or Temporal activities) to start a run for the candidate (same definition, workflow override), wait for completion, and read the baseline comparison result. Add or register evaluators for OCR correction metrics if needed (Section 10).

**Feature 005** (implement later — after design decisions from 004):

5. **Conditional replacement:** Implement the automation that, when the baseline comparison reports no degradation, sets the candidate workflow as the new current version (Section 7). See [feature-docs/005-agentic-sdlc-workflow-replacement/](../feature-docs/005-agentic-sdlc-workflow-replacement/).
6. **Feedback loop:** Implement the loop as a Temporal workflow (or schedule + workflow) (Section 8).
7. **AI-generated nodes:** Complete exploration and, if chosen, implement with validation (Section 9).

---

## 12. Document and code references

| Topic | Location |
|-------|----------|
| Enrichment (rules, LLM, HITL summary) | `docs/ENRICHMENT.md` |
| HITL model and APIs | `docs/HITL_ARCHITECTURE.md`; `ReviewSession`, `FieldCorrection` in Prisma schema |
| Graph workflows, nodes, activities | `docs/graph-workflows/DAG_WORKFLOW_ENGINE.md`, `docs/graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md`, `docs/graph-workflows/GRAPH_TYPES.md` |
| Existing character confusion | `apps/temporal/src/activities/enrichment-rules.ts` (`fixCharacterConfusion`, `CONFUSION_MAP`) |
| Benchmarking system (requirements) | `feature-docs/003-benchmarking-system/REQUIREMENTS.md` |
| Benchmarking (operational guide) | `docs/benchmarking/BENCHMARKING_GUIDE.md` |
| Benchmark concepts (baseline, regression, definitions) | `docs/benchmarking/BENCHMARKING_GUIDE.md` § Workflow, § Establish a Baseline, § Regression Reports; `feature-docs/003-benchmarking-system` (user stories US-034, US-035, US-037) |
| Evaluator interface and registry | `apps/backend-services/src/benchmark/evaluator.interface.ts`, `evaluator-registry.service.ts`, `benchmark.module.ts` |
| Feature 005 (replacement, loop, exploration) | [feature-docs/005-agentic-sdlc-workflow-replacement/](../feature-docs/005-agentic-sdlc-workflow-replacement/) |
