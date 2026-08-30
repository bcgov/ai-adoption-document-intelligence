# US-017: Backend save-time validator consumes the catalog

**As a** workflow author,
**I want** the backend save endpoint to reject workflows whose activity
parameters violate the catalog Zod schemas,
**So that** the catalog drift class the editor caught on 2026-05-23
(legacy flat `validateFields` shape) is impossible to save server-side
regardless of editor.

## Acceptance Criteria

- [x] **Scenario 1**: Backend validator wires the catalog adapter
    - **Given** `apps/backend-services/src/workflow/graph-schema-validator.ts`
    - **When** the module is imported
    - **Then** `validateGraphConfig` is invoked with `validateActivityParameters: createCatalogParameterValidator()` from `@ai-di/graph-workflow`

- [x] **Scenario 2**: `activity-parameter-schema-registry.ts` is removed
    - **Given** the backend workflow folder
    - **When** the file list is checked
    - **Then** `apps/backend-services/src/workflow/activity-parameter-schema-registry.ts` no longer exists, and no source file imports from it

- [x] **Scenario 3**: A previously-unvalidated activity now fails on bad params
    - **Given** a graph with `azureOcr.submit` and a parameter that violates the catalog schema (e.g. an unknown field where the schema is strict, or a missing required field)
    - **When** `validateGraphConfig` is called
    - **Then** an error is returned at `nodes.<id>.parameters.<field>` with `severity: "error"`

- [x] **Scenario 4**: Existing `data.transform` validation cases continue to fail
    - **Given** the existing spec cases (`fails when fieldMapping is not valid JSON`, `fails when xmlEnvelope is missing {{payload}}`, etc.)
    - **When** spec is re-run
    - **Then** validation still rejects those configs (the catalog tightening from US-016 ensures the same constraints — paths still match `nodes.t.parameters.<field>`)

- [x] **Scenario 5**: Valid workflows still pass
    - **Given** the existing spec's "valid simple linear graph passes" and "validates the standard OCR template" and "validates the multi-page report template"
    - **When** spec is re-run
    - **Then** all three still pass with zero errors

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- The current thin wrapper at `apps/backend-services/src/workflow/graph-schema-validator.ts` already accepts an `ValidateGraphConfigOptions` shape — swap the two callback fields and the file shrinks by one import.
- `isRegisteredActivityType` should keep using the local `activity-registry.ts` (the backend's "what activity types do I actually have a Temporal worker for?" check), NOT just `ACTIVITY_CATALOG.hasOwnProperty`. Those are subtly different: catalog presence ≠ runtime-registered.
- Spec test in `graph-schema-validator.spec.ts` will need its error-message substrings relaxed (Zod's "Invalid input" wording instead of the imperative validator's "must be one of: json, xml, csv"). Paths stay identical.

## Files modified

- `apps/backend-services/src/workflow/graph-schema-validator.ts` — swap `validateActivityParameters` source to `createCatalogParameterValidator()`.
- `apps/backend-services/src/workflow/activity-parameter-schema-registry.ts` — DELETED.
- `apps/backend-services/src/workflow/graph-schema-validator.spec.ts` — relax error-message substring assertions where they hard-coded the imperative validator's prose; paths stay the same.
