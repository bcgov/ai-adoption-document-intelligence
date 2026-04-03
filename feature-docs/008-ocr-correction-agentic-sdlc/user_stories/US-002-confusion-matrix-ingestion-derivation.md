# US-002: Implement confusion-matrix ingestion or derivation (optional)

**As a** developer,
**I want to** optionally implement ingestion or derivation of confusion-matrix–style data (ground truth vs OCR),
**So that** correction tools (e.g. character-confusion) can consume confusion-derived mappings or weights.

## Acceptance Criteria
- [ ] **Scenario 1**: Data format and storage/API defined
    - **Given** the confusion-matrix documentation (US-001)
    - **When** ingestion or derivation is implemented
    - **Then** the data format and API or storage are documented and correction tools (Step 2) can optionally consume the data

- [ ] **Scenario 2**: Derivation from benchmark or HITL data
    - **Given** ground truth and OCR output (e.g. from benchmark runs or HITL corrections)
    - **When** derivation is implemented
    - **Then** the system can produce confusion-matrix–style data (e.g. character-pair counts or rates) for analysis and tuning

- [ ] **Scenario 3**: No placeholder implementation
    - **Given** this story is implemented
    - **When** the feature is delivered
    - **Then** the implementation is real (no stubs); if scope is deferred, only documentation is required per US-001

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Optional for Step 1; may be deferred to Step 2 when a correction tool needs it.
- Requirements Section 2: system SHALL support deriving or ingesting confusion-matrix–style data.
