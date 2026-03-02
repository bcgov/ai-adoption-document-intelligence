# US-015: User Requests a New API Key for a Group

**As a** group member,
**I want to** request a new API key scoped to a group I belong to,
**So that** I can authenticate programmatically with access limited to that group's resources.

## Acceptance Criteria
- [x] **Scenario 1**: Member successfully requests an API key for their group
    - **Given** a requestor authenticated via JWT who is a member of group X
    - **When** they submit a request to generate a new API key for group X
    - **Then** a new `ApiKey` record is created with `group_id` = X and `user_id` set to the requesting user's ID
    - **And** the API key value is returned to the requestor

- [x] **Scenario 2**: Non-member cannot request an API key for a group
    - **Given** a requestor authenticated via JWT who is NOT a member of group Y
    - **When** they submit a request to generate an API key for group Y
    - **Then** the API returns `403 Forbidden` and no key is created

- [x] **Scenario 3**: Requesting a new key updates user_id on the existing record
    - **Given** a group X already has an existing `ApiKey` record
    - **When** a member of group X requests a new API key
    - **Then** the `user_id` on the `ApiKey` record is updated to reflect the requesting user
    - **And** a new key value is issued

- [x] **Scenario 4**: Unit tests cover the request flow
    - **Given** the API key request implementation
    - **When** unit tests are run
    - **Then** authorized request, unauthorized request, and user_id update cases are covered and pass

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Depends on US-005 (schema: group_id on ApiKey) and US-007 (authorization helper for membership validation)
- The endpoint must only be accessible to JWT-authenticated users (not API key auth)
- `user_id` serves as audit trail — records who last generated the key
- One API key per group is implied by the schema (group_id uniqueness); Confirmed. One key per group is desired for now.
