# US-014: Add Groups Link to Sidebar Navigation

**As an** authenticated user,
**I want to** see a single Groups link in the sidebar navigation,
**So that** I can access group management and my request history from one place.

## Acceptance Criteria
- [ ] **Scenario 1**: Groups link is visible to all authenticated users
    - **Given** any authenticated user
    - **When** the sidebar is rendered
    - **Then** a `Groups` navigation link is shown that routes to `/groups`

- [ ] **Scenario 2**: Clicking Groups navigates to `/groups`
    - **Given** the sidebar is rendered
    - **When** the user clicks the `Groups` link
    - **Then** the application navigates to `/groups`

- [ ] **Scenario 3**: The Groups link is active when on any `/groups` route
    - **Given** the user is on `/groups` or `/groups/:groupId`
    - **When** the sidebar is rendered
    - **Then** the `Groups` link is shown in its active/highlighted state

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use the existing Mantine sidebar/navigation component pattern.
- The link should be active-state-aware for both `/groups` and `/groups/:groupId` routes.
- Only the `/groups` route (and its child `/groups/:groupId`) needs to be registered; there is no separate `/my-requests` route.
- Remove any previously planned separate `My Requests` sidebar entry.
