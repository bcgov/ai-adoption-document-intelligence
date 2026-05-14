# US-002: Create local UI adapter layer and compatibility matrix

**As a** frontend developer,
**I want to** import shared UI through local adapter components,
**So that** the application can migrate from Mantine to the B.C. Design System incrementally without broad product-code churn.

## Acceptance Criteria

- [ ] **Scenario 1**: UI adapter folder exists
    - **Given** the frontend source tree
    - **When** this story is implemented
    - **Then** `apps/frontend/src/ui/` contains local wrapper exports for common UI used by the reference implementation

- [ ] **Scenario 2**: B.C. Design System components are preferred
    - **Given** a wrapper has a suitable B.C. Design System replacement
    - **When** the wrapper is implemented
    - **Then** it uses the B.C. Design System React component rather than Mantine

- [ ] **Scenario 3**: Mantine fallbacks are explicit
    - **Given** a component lacks a suitable B.C. Design System replacement
    - **When** Mantine is retained
    - **Then** the wrapper is documented as a `Mantine fallback` and styled with B.C. Design System tokens where practical

- [ ] **Scenario 4**: Product code uses adapters for migrated UI
    - **Given** the Processing Queue reference implementation
    - **When** it uses migrated common UI
    - **Then** it imports those elements from `apps/frontend/src/ui/` rather than directly from Mantine or B.C. Design System packages

- [ ] **Scenario 5**: Compatibility matrix is created
    - **Given** the migration documentation
    - **When** this story is complete
    - **Then** `docs-md/BC_DESIGN_SYSTEM_MIGRATION.md` includes a compatibility matrix for the adapters introduced in this story

## Priority

- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Do not create unused wrappers for future use.
- Only wrap components required by the reference implementation or immediate migration work.
- Wrapper APIs should be typed and should avoid `any`.
