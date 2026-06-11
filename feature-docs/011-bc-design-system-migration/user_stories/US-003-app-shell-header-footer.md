# US-003: Migrate app shell header and footer pattern

**As an** authenticated user,
**I want to** see application chrome that follows the B.C. Design System,
**So that** the product feels consistent with B.C. government digital services.

## Acceptance Criteria

- [x] **Scenario 1**: Header uses B.C. Design System pattern
    - **Given** the app renders its root layout
    - **When** the header is displayed
    - **Then** it uses the B.C. Design System `Header` component or a documented local wrapper around it

- [x] **Scenario 2**: Skip link is available
    - **Given** a keyboard user opens the app
    - **When** they tab from the top of the page
    - **Then** a skip link allows moving directly to the main content region

- [x] **Scenario 3**: Footer follows B.C. Design System guidance
    - **Given** a page with enough vertical space
    - **When** the footer is displayed
    - **Then** it uses the B.C. Design System `Footer` component or a documented local wrapper with the required acknowledgement and copyright content

- [x] **Scenario 4**: Sidebar navigation remains usable
    - **Given** the app currently uses product-specific sidebar navigation
    - **When** the app shell is migrated
    - **Then** navigation labels, active states, collapsed states, and keyboard access continue to work

- [x] **Scenario 5**: Auth and group controls are preserved
    - **Given** an authenticated user has profile and group context
    - **When** the migrated header renders
    - **Then** logout, user identity, and group selector functionality remain available

## Priority

- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Existing shell code is in `apps/frontend/src/layouts/RootLayout.tsx`.
- If B.C. Design System does not provide an application sidebar component, keep sidebar navigation as an application-specific component styled with B.C. Design System tokens.
