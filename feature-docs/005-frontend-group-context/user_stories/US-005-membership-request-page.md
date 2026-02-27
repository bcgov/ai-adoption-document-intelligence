# US-005: Group Membership Request Page

**As a** user with no group memberships,
**I want to** browse available groups and submit a membership request,
**So that** I can gain access to the application while awaiting admin approval.

## Acceptance Criteria
- [ ] **Scenario 1**: Page lists all available groups
    - **Given** an authenticated user with no group memberships visits `/request-membership`
    - **When** the page loads
    - **Then** a list of all groups (from `GET /api/groups`) is displayed for the user to choose from

- [ ] **Scenario 2**: User can submit a membership request
    - **Given** the user has selected a group from the list
    - **When** they submit the request
    - **Then** `POST /api/groups/request` is called with the selected group's ID

- [ ] **Scenario 3**: Success state is shown after submission
    - **Given** the API request succeeds
    - **When** the response is received
    - **Then** the page displays a confirmation message indicating the request is pending admin approval

- [ ] **Scenario 4**: Error state is shown on failure
    - **Given** the API request fails
    - **When** the response is received
    - **Then** the page displays an appropriate error message

- [ ] **Scenario 5**: Page is accessible to any authenticated user
    - **Given** any authenticated user (with or without groups)
    - **When** they navigate to `/request-membership`
    - **Then** the page renders without being blocked by the group route guard

- [ ] **Scenario 6**: Page is linked from the header empty-groups message
    - **Given** a user with no groups views the header
    - **When** they click the "No groups — request membership" message
    - **Then** they are navigated to `/request-membership`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Uses `GET /api/groups` to fetch the list of groups.
- Uses the existing `POST /api/groups/request` endpoint.
- `/request-membership` must be excluded from the no-group route guard (US-004).
- Frontend tests should cover loading state, successful submission, and error handling.
