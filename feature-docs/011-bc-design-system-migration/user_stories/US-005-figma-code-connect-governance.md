# US-005: Establish Figma component classification and Code Connect mappings

**As a** designer or developer,
**I want to** know which Figma components map to which code components,
**So that** designs and implementation stay aligned as the UI system evolves.

## Acceptance Criteria

- [ ] **Scenario 1**: Components are classified
    - **Given** a shared UI component is introduced or migrated
    - **When** it is documented
    - **Then** it is classified as `BC DS native`, `BC DS styled wrapper`, `Mantine fallback`, or `Application-specific`

- [ ] **Scenario 2**: Figma naming guidance is documented
    - **Given** application-specific components are needed in Figma
    - **When** designers create or update them
    - **Then** documentation describes the naming pattern, including examples like `App / DataTable`, `App / StatCard`, and `App / ProcessingQueueCard`

- [ ] **Scenario 3**: Code Connect scope is defined
    - **Given** Code Connect mappings are considered
    - **When** a component is already covered by official B.C. Design System mappings
    - **Then** the app should reuse that mapping rather than duplicate it

- [ ] **Scenario 4**: App-specific mappings are created where practical
    - **Given** the Processing Queue reference implementation uses local app-specific components
    - **When** matching Figma components exist
    - **Then** Code Connect mappings connect those Figma components to the local code components

- [ ] **Scenario 5**: Sync workflow is documented
    - **Given** a designer or developer changes a component
    - **When** the change affects Figma or code
    - **Then** the migration documentation explains how to update the mapping and compatibility matrix

## Priority

- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- The official B.C. Design System repository already contains Code Connect mappings for some components.
- This story should not block foundations or the Processing Queue reference implementation if Code Connect setup needs additional team decisions.
