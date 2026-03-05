# US-004: Exclude Soft-Deleted Groups from All Group Queries

**As a** user,
**I want to** only see and interact with active groups,
**So that** soft-deleted groups do not appear in listings or other group-related responses.

## Acceptance Criteria
- [x] **Scenario 1**: Soft-deleted groups are excluded from `GET /api/groups`
    - **Given** the database contains both active and soft-deleted groups
    - **When** `GET /api/groups` is called
    - **Then** only groups where `deleted_at IS NULL` are returned

- [x] **Scenario 2**: Soft-deleted groups are excluded from `GET /api/groups/user/:userId`
    - **Given** a user is a member of both an active and a soft-deleted group
    - **When** `GET /api/groups/user/:userId` is called
    - **Then** only the active group is returned

- [x] **Scenario 3**: Soft-deleted groups are excluded from the `/me` response group list
    - **Given** a user is a member of a soft-deleted group
    - **When** `GET /api/auth/me` is called
    - **Then** the soft-deleted group does not appear in the `groups` array

- [x] **Scenario 4**: Unit tests cover the soft-delete exclusion logic
    - **Given** the updated service/query layer
    - **When** unit tests are run
    - **Then** tests assert that soft-deleted groups are filtered out

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Add `WHERE deleted_at IS NULL` (or Prisma equivalent: `where: { deleted_at: null }`) to all group-listing queries.
- No changes are required to workflows, documents, API keys, or labeling projects at this stage — those resources remain untouched when a group is soft-deleted.
