# US-018: Implement Document Classify Activity

**As a** developer,
**I want to** have a `document.classify` Temporal activity that classifies document segments using rule-based heuristics,
**So that** workflow graphs can automatically identify document types (e.g., invoice, receipt, SDPR report) based on OCR text and layout patterns.

## Acceptance Criteria
- [ ] **Scenario 1**: Rule-based classification matches patterns
    - **Given** a classification rule checking for "contains" on the text field with value "INVOICE"
    - **When** the OCR result text contains "INVOICE"
    - **Then** the classifier returns the rule's `resultType` (e.g., "invoice") with a confidence score and the matched rule name

- [ ] **Scenario 2**: Multiple pattern operators supported
    - **Given** classification rules using `contains`, `matches` (regex), and `startsWith` operators
    - **When** each rule is evaluated against OCR results
    - **Then** the correct operator logic is applied for each pattern

- [ ] **Scenario 3**: Multiple rules evaluated in order
    - **Given** multiple classification rules
    - **When** the classifier runs
    - **Then** rules are evaluated in order and the first matching rule determines the segment type

- [ ] **Scenario 4**: No match returns unknown type
    - **Given** OCR results that match no classification rules
    - **When** the classifier runs
    - **Then** the result includes a `segmentType` of "unknown" or similar with low confidence

- [ ] **Scenario 5**: Custom rules via parameters
    - **Given** the activity is called with custom `rules` in the parameters
    - **When** classification runs
    - **Then** the provided custom rules are used instead of (or in addition to) default rules

- [ ] **Scenario 6**: Output conforms to ClassifyDocumentOutput
    - **Given** any classification result
    - **When** the output is inspected
    - **Then** it includes `segmentType` (string), `confidence` (number), and optionally `matchedRule` (string)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/activities/classify-document.ts`
- Registered in the activity registry as `document.classify`
- Input/output interfaces defined in Section 6.3
- Only rule-based classification is in scope; ML-based classification is a non-goal (Section 2)
- Pattern matching checks OCR text, titles, key-value pair keys, and structural signatures
- The `ClassificationRule` interface supports checking multiple fields (`text`, `title`, `keyValuePair.key`, etc.)
- Tests should verify correct classification for known document types
