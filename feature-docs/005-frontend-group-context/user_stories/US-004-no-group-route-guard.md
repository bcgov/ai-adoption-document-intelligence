# US-004: Block Navigation for Users with No Group Membership

**As a** non-admin user with no group memberships,
**I want to** be redirected to the membership request page when I try to reach any main app page,
**So that** I cannot access resources I have no group permission for.

## Acceptance Criteria
- [ ] **Scenario 1**: User with no groups is redirected
    - **Given** an authenticated, non-admin user whose `availableGroups` is empty
    - **When** they navigate to any main application route
    - **Then** they are redirected to `/request-membership`

- [ ] **Scenario 2**: Direct URL entry is blocked
    - **Given** an authenticated, non-admin user with no groups who enters a protected URL directly
    - **When** the route resolves after `GroupContext` has loaded
    - **Then** they are redirected to `/request-membership`

- [ ] **Scenario 3**: Guard does not flash during loading
    - **Given** `GroupContext` is still resolving auth and groups
    - **When** the page renders
    - **Then** the guard redirects only after loading is complete, with no premature redirect

- [ ] **Scenario 4**: System-admin is exempt from the guard
    - **Given** an authenticated system-admin user with no group memberships
    - **When** they navigate to any main application route
    - **Then** they are not redirected and the page renders normally

- [ ] **Scenario 5**: Guard lifts after user gains membership
    - **Given** a user who previously had no groups now has at least one group (after `/me` refresh)
    - **When** they navigate to a main route
    - **Then** they are no longer redirected and can access the application normally

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The guard should be implemented as a route-level wrapper/HOC or inside the router configuration, consuming `GroupContext`.
- Redirect must happen only after `GroupContext` loading state is resolved.
- System-admin flag should be sourced from `AuthContext`.
- Frontend tests should cover redirect and non-redirect scenarios.
