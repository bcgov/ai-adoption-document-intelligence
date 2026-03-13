# US-008: Tool manifest or registry extension for AI (tool list + parameter schemas)

**As a** pipeline or activity that calls the AI for tool recommendations,
**I want to** expose the list of registered OCR correction tools and their parameter schemas to the AI (e.g. via a manifest, registry extension, or dedicated schema),
**So that** the AI can recommend from the actual available set with correct parameter names and types.

## Acceptance Criteria
- [ ] **Scenario 1**: Tool names exposed
    - **Given** the set of registered OCR correction activities (US-006)
    - **When** the AI pipeline builds the prompt or request
    - **Then** it has access to the list of tool identifiers (e.g. activity type strings) that the AI is allowed to recommend

- [ ] **Scenario 2**: Parameter schemas exposed
    - **Given** each correction tool has parameters (e.g. language, fieldScope, confusionMap)
    - **When** the AI pipeline provides context to the AI
    - **Then** the parameter names and types (or a JSON schema) for each tool are available so the recommendation format can be valid and unambiguous

- [ ] **Scenario 3**: Documented
    - **Given** the mechanism (registry extension, manifest file, or schema)
    - **When** a developer maintains or extends correction tools
    - **Then** the way tool metadata is exposed to the AI is documented

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Step 3; requirements Section 5. Backend has getRegisteredActivityTypeKeys() and REGISTERED_ACTIVITY_TYPES with descriptions; parameter metadata may need to be added or a separate manifest created.
