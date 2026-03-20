# US-009: AI pipeline activity for HITL feedback and tool recommendation

**As a** system,
**I want to** have a defined pipeline or activity that takes HITL-derived correction data as input, calls an AI service with a clear prompt/schema, and returns a structured recommendation (which tools, where, with what parameters),
**So that** a downstream step can apply the recommendation to produce a candidate workflow.

## Acceptance Criteria
- [ ] **Scenario 1**: Input is aggregated HITL data
    - **Given** aggregated correction data (e.g. from US-007) with field_key, original_value, corrected_value, action
    - **When** the pipeline or activity is invoked
    - **Then** it accepts this data as input (and optionally filters or limits)

- [ ] **Scenario 2**: AI service invoked with prompt and schema
    - **Given** the input and the tool manifest (US-008)
    - **When** the pipeline runs
    - **Then** it calls an AI service (e.g. LLM) with a clear prompt and output schema so the model analyzes patterns (repeated confusions, misspellings, format errors) and returns a structured recommendation

- [ ] **Scenario 3**: Machine-readable recommendation output
    - **Given** the AI response
    - **When** the pipeline returns
    - **Then** the output is a list of recommended tools with placement (e.g. after which node or edge) and parameters (e.g. field types, confusion map), in a machine-readable format (e.g. JSON schema); no placeholder outputs

- [ ] **Scenario 4**: Recommendation format documented
    - **Given** the pipeline is implemented
    - **When** a developer consumes the recommendation
    - **Then** the recommendation format is documented and non-ambiguous

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Step 3; requirements Section 5. Depends on US-007, US-008.
- **Recommendation service:** `AiRecommendationService` (`apps/backend-services/src/benchmark/ai-recommendation.service.ts`) and the Temporal activity `ai-tool-recommendation` use the manifest (including insertion points) and encode **preferred tool order** (`ocr.characterConfusion` and `ocr.normalizeFields` before confidence check; optional `ocr.enrich` after `postOcrCleanup`/before `checkConfidence` with `parameters.documentType`; `ocr.spellcheck` after confidence check, before review). See [docs-md/OCR_IMPROVEMENT_PIPELINE.md](../../../docs-md/OCR_IMPROVEMENT_PIPELINE.md).
- **Enrichment steering:** When the model recommends **`ocr.enrich`** with **`enableLlmEnrichment: true`**, it may set **`parameters.llmPromptAppend`** with brief, pattern-based instructions (from HITL analysis). That string is appended to the enrichment LLM user prompt in **`enrichment-llm.ts`** / **`enrich-results.ts`**; it does not apply to other correction activities.
