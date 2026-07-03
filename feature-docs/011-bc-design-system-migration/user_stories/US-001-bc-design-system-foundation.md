# US-001: Install and configure B.C. Design System foundations

**As a** frontend developer,
**I want to** install and configure B.C. Design System packages, tokens, and BC Sans,
**So that** the application has a stable foundation for incremental component migration.

## Acceptance Criteria

- [x] **Scenario 1**: B.C. Design System dependencies are installed
    - **Given** the frontend package manifest
    - **When** this story is implemented
    - **Then** `@bcgov/design-system-react-components`, `@bcgov/design-tokens`, and `@bcgov/bc-sans` are added as pinned frontend dependencies

- [x] **Scenario 2**: BC Sans is loaded for end users
    - **Given** the application starts in a browser
    - **When** text is rendered
    - **Then** BC Sans is available through imported font-face declarations and does not depend on the developer having the font installed locally

- [x] **Scenario 3**: B.C. Design System tokens are available globally
    - **Given** application styles are loaded
    - **When** CSS references B.C. Design System token variables
    - **Then** those variables resolve from the installed token package

- [x] **Scenario 4**: Mantine theme aligns with B.C. foundations
    - **Given** Mantine components remain in the app
    - **When** they render
    - **Then** the Mantine provider uses BC Sans and token-aligned colors, spacing, and radii where practical

- [x] **Scenario 5**: Existing app behaviour remains intact
    - **Given** the app is built and tested
    - **When** type check, lint, and relevant frontend tests run
    - **Then** they pass without introducing broad UI regressions

## Priority

- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Do not remove `MantineProvider` in this story.
- Do not introduce Tailwind CSS.
- Prefer imports recommended by the B.C. Design System documentation.
- The current frontend entry point is `apps/frontend/src/main.tsx`.
