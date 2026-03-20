# Step 3: AI processing of HITL feedback and tool selection

**Parent:** [OCR Correction and Agentic SDLC Requirements](../../docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md) — Section 5  
**Implementation order:** 3  
**Depends on:** Step 2 (OCR correction tools must exist so the AI can recommend from the set of registered tools).

---

## Goal

Use AI to process HITL feedback and output a structured recommendation: which OCR correction tools/nodes to add to the workflow, where, and with what parameters. The output must be machine-readable so a downstream step (e.g. workflow update or benchmark run) can apply it.

## Inputs

- **Aggregated HITL feedback** from `FieldCorrection` and review sessions (see [HITL_ARCHITECTURE.md](../../docs/HITL_ARCHITECTURE.md)): e.g. `field_key`, `original_value`, `corrected_value`, `action` (e.g. corrected, flagged). The existing `getReviewAnalytics` and per-session APIs do not expose per-field original/corrected pairs. The system SHALL provide a **query or API** that returns aggregated correction data (e.g. all corrections in a time window or for a document type) in a shape suitable for the AI (list of { field_key, original_value, corrected_value, action }). This may be a new endpoint, a new service method used by an activity, or an activity that queries the database with the needed filters.

## Requirements

- An **AI component** (e.g. LLM) analyzes patterns in corrections (repeated confusions, misspellings, format errors) and outputs a **structured recommendation**: which correction tools/nodes to add, where in the workflow, and with what parameters (e.g. which field types, which confusion map).
- The system SHALL allow the AI to **pick from the set of registered OCR correction tools** (Step 2) and optionally suggest ordering or parameters.
- The **output format** SHALL be machine-readable (e.g. JSON schema) so a downstream step can apply it.
- The pipeline SHALL **expose the list of registered tools and their parameter schemas** to the AI (e.g. via a registry extension that adds parameter metadata, a manifest file, or a dedicated schema). The AI prompt or API SHALL receive tool names and parameter names/types so recommendations are valid and unambiguous.

**As implemented:** Tool metadata and **safe insertion points** (`afterNodeId` / `beforeNodeId`) are supplied from the shared manifest (see `apps/temporal/src/correction-tool-registry.ts` and `apps/backend-services/src/hitl/tool-manifest.service.ts`). The AI recommendation step includes **ordering guidance** so candidates prefer **`ocr.characterConfusion` → `ocr.normalizeFields`** in the early segment (after `extractResults`, before `checkConfidence`), may use **`ocr.enrich`** between **`postOcrCleanup`** and **`checkConfidence`** (with required `parameters.documentType`), and apply **`ocr.spellcheck`** later (after `checkConfidence`, before `reviewSwitch`), consistent with the manifest.

For **`ocr.enrich`**, the manifest also documents optional **`llmPromptAppend`**. When recommending enrichment with **`enableLlmEnrichment: true`**, the correction agent may set **`parameters.llmPromptAppend`** to short, actionable instructions inferred from aggregated HITL corrections; that text is appended to the enrichment LLM user prompt (not the spellcheck or deterministic tools). See [docs-md/OCR_IMPROVEMENT_PIPELINE.md](../../docs-md/OCR_IMPROVEMENT_PIPELINE.md) § “Current intended correction order” and the troubleshooting notes for **`ocr.enrich`**.

## Acceptance criteria

- [ ] There is a **defined pipeline or activity** that: (1) takes HITL-derived correction data as input, (2) calls an AI service with a clear prompt/schema, (3) returns a list of recommended tools and placement/parameters.
- [ ] The **recommendation format** is documented and non-ambiguous (no "placeholder" outputs).
- [ ] An **aggregation path** for HITL correction data is implemented (query/API/activity) and documented so the pipeline can pass per-field correction data to the AI.
- [ ] The **mechanism for exposing registered tools to the AI** is documented (e.g. how the pipeline provides tool names and parameter schemas to the prompt or API).

## References

- [docs/HITL_ARCHITECTURE.md](../../docs/HITL_ARCHITECTURE.md) — `ReviewSession`, `FieldCorrection` in Prisma schema
- Step 2: [step-02-ocr-correction-tools-and-nodes.md](./step-02-ocr-correction-tools-and-nodes.md) — registered tools the AI can recommend
- [docs-md/OCR_IMPROVEMENT_PIPELINE.md](../../docs-md/OCR_IMPROVEMENT_PIPELINE.md) — backend orchestration and prompt/ordering notes
