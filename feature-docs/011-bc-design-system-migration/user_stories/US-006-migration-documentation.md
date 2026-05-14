# US-006: Document migration rules, fallbacks, and implementation guidance

**As a** developer joining the project,
**I want to** understand how to choose between B.C. Design System, local wrappers, React Aria, and Mantine,
**So that** new UI follows the migration path without adding inconsistent patterns.

## Acceptance Criteria

- [ ] **Scenario 1**: Migration document exists
    - **Given** the repo documentation
    - **When** this story is implemented
    - **Then** `docs-md/BC_DESIGN_SYSTEM_MIGRATION.md` describes the migration strategy, architecture, and decision rules

- [ ] **Scenario 2**: Compatibility matrix is complete for migrated components
    - **Given** components are used by the reference implementation
    - **When** the documentation is reviewed
    - **Then** the matrix documents current usage, target component, interim approach, and classification

- [ ] **Scenario 3**: Fallback rules are clear
    - **Given** a developer needs a component that B.C. Design System does not provide
    - **When** they read the documentation
    - **Then** they know when to use a styled Mantine fallback, React Aria primitive, or application-specific component

- [ ] **Scenario 4**: Verification guidance is included
    - **Given** a migration story changes frontend code
    - **When** a developer completes the work
    - **Then** the documentation lists the expected type-check, lint, unit test, and visual verification steps

- [ ] **Scenario 5**: Open questions are tracked
    - **Given** unresolved design-system decisions remain
    - **When** the migration documentation is updated
    - **Then** it lists open questions for dark mode, sidebar navigation, component library ownership, and Code Connect location

## Priority

- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Keep this document concise enough to stay maintainable.
- Update this document whenever a new adapter or fallback is introduced.
