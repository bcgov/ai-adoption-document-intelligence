# Step 2: OCR correction tools and simple correction nodes

**Parent:** [OCR Correction and Agentic SDLC Requirements](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) — Sections 3 and 4  
**Implementation order:** 2  
**Depends on:** Step 1 (confusion matrices) — optional; tools may use confusion-derived mappings.

---

## Goal

Provide a set of OCR correction tools and expose them as graph workflow activities (and/or correction nodes) so they can be composed in workflows. These are **standalone** correction activities: the existing **ocr.enrich** remains the default, broad enrichment path; standalone tools allow workflows to be made more specific (e.g. add only spellcheck or character-confusion with a custom map). Workflows may use either default enrich or a sequence of standalone correction activities (or both in a defined order to avoid double-application).

## Requirements (tools)

- **Tools** are implementable as graph workflow **activities** (see [ADDING_GRAPH_NODES_AND_ACTIVITIES.md](../../docs/graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md)) and/or as **correction nodes** that operate on workflow context (e.g. `ctx` fields or OCR result structures).
- Each tool SHALL have a **well-defined input/output contract**. **Tools SHALL operate on the full OCR result shape** (e.g. the structure containing keyValuePairs, documents, or equivalent): inputs = full OCR result + optional parameters (field scope, language, confusion map); outputs = corrected OCR result and optional change metadata.
- Tools SHALL be **composable** in a workflow.

**Suggested initial tools (implement as specified, no placeholders):**

1. **Spellcheck correction:** Accept full OCR result and optional language/scope; return corrected OCR result and list of changes. Use an existing spellcheck library or API.
2. **Character-confusion correction:** Extend or reuse existing `fixCharacterConfusion` behavior (see `enrichment-rules.ts`) as a callable tool/activity that accepts the full OCR result and optional confusion-map override; return corrected OCR result and change metadata.
3. **At least one other deterministic correction:** e.g. trim/normalize whitespace, normalize digits/dates, operating on the full OCR result shape, with the same input/output conventions.

## Requirements (nodes)

- **Spellcheck:** A node/activity that performs spellcheck on the full OCR result (configurable scope, e.g. field keys, document type). Output: corrected OCR result and change summary (for HITL/audit).
- **Other simple nodes:** At least one additional correction type (e.g. character confusion, trim/normalize) as a first-class activity/node, operating on the full OCR result shape, with parameters and results written back to `ctx` or OCR result shape.

## Acceptance criteria

- [ ] **Three** correction tools are implemented and **registered** in the activity registry (backend + Temporal): (1) spellcheck, (2) character-confusion, (3) at least one other deterministic correction (e.g. trim/normalize whitespace or normalize digits/dates).
- [ ] **Spellcheck** is available as an activity (or node) in the graph workflow engine and is documented in `/docs`.
- [ ] At least **one other** simple correction node/activity (in addition to spellcheck) is implemented and wired into the graph (types, registry, validation per ADDING_GRAPH_NODES_AND_ACTIVITIES.md).
- [ ] Each tool is covered by **tests** and documented in `/docs`.

## References

- [docs/graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md](../../docs/graph-workflows/ADDING_GRAPH_NODES_AND_ACTIVITIES.md)
- [docs/ENRICHMENT.md](../../docs/ENRICHMENT.md)
- `apps/temporal/src/activities/enrichment-rules.ts` (`fixCharacterConfusion`, `CONFUSION_MAP`)
