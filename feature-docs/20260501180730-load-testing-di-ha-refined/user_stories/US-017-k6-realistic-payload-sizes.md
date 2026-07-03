# US-017: k6 realistic document payload sizes

**As a** performance engineer,
**I want to** parameterize upload-related scenarios by file size tier,
**So that** body limits, normalization cost, and bandwidth reflect production-like stress.

## Acceptance Criteria
- [x] **Scenario 1**: Size tiers are env-configurable
    - **Given** small/medium/large byte targets (or file paths to generated fixtures)
    - **When** operators set env vars documented for the scenario
    - **Then** k6 generates or loads payloads matching those tiers within Nest `BODY_LIMIT` constraints.

- [x] **Scenario 2**: No proprietary fixtures by default
    - **Given** FR-13 licensing constraint
    - **When** scenarios need binary bodies
    - **Then** default path uses generated buffers or openly licensed minimal PDFs only if checked in with clear license.

- [x] **Scenario 3**: Document interaction with normalization/OCR paths
    - **Given** uploads may trigger PDF normalization or downstream OCR
    - **When** docs describe the scenario
    - **Then** expected backend stages and mock modes (`DOCUMENT_INTELLIGENCE_MODE`, `MOCK_AZURE_OCR`) are stated.

- [x] **Scenario 4**: Root script or npm alias
    - **Given** FR-4 conventions
    - **When** developers run from repo root
    - **Then** an npm script (or documented command) invokes the payload-size scenario consistently with other k6 scripts.

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Implements FR-13 item 5 (realistic document payload sizes). May extend US-013/US-014 scenarios rather than duplicate scripts if a single parameterized script satisfies multiple acceptance criteria.
