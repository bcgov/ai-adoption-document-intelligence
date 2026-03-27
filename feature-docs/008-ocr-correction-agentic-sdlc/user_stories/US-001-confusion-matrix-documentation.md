# US-001: Document confusion matrix concept and format

**As a** developer or operator,
**I want to** have the confusion-matrix concept, format, and intended use documented in `/docs`,
**So that** correction tools and benchmarking can consistently use ground-truth-vs-OCR data for analysis and tuning.

## Acceptance Criteria
- [ ] **Scenario 1**: Concept and definition documented
    - **Given** the OCR correction and agentic SDLC feature
    - **When** a reader opens the confusion-matrix documentation in `/docs`
    - **Then** the document defines a confusion matrix (rows = ground truth, columns = OCR output; cells = counts or rates) and its use for error analysis, correction rules, and benchmarking

- [ ] **Scenario 2**: Format and derivation path documented
    - **Given** the documentation
    - **When** a reader needs to derive or ingest confusion data
    - **Then** the doc describes the data format and how it can be derived from ground truth vs OCR (e.g. from benchmark or HITL data)

- [ ] **Scenario 3**: Ingestion path documented if implemented
    - **Given** ingestion or derivation is implemented in this or a later story
    - **When** the implementation exists
    - **Then** the data format and API or storage for ingestion are documented so correction tools can optionally consume it

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Step 1 deliverable; no dependency on other 004 stories.
- Reference: `apps/temporal/src/activities/enrichment-rules.ts` (`fixCharacterConfusion`, `CONFUSION_MAP`).
- docs/OCR_CORRECTION_AND_AGENTIC_SDLC_REQUIREMENTS.md Section 2.
