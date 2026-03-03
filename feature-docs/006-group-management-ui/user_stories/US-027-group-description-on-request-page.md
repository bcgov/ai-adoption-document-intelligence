# US-027: Display Group Description on Request Membership Page

**As an** authenticated user browsing the Request Membership page,
**I want to** see a group's description alongside its name,
**So that** I have enough context to decide which group to request membership for.

## Acceptance Criteria
- [ ] **Scenario 1**: Group description is shown when available
    - **Given** one or more groups have a non-null `description` value
    - **When** the Request Membership page renders the group list
    - **Then** each group's description is displayed beneath or alongside its name

- [ ] **Scenario 2**: No description shown when the field is null
    - **Given** a group with no description set
    - **When** the Request Membership page renders
    - **Then** no description placeholder or empty string is shown for that group (the description section is omitted)

- [ ] **Scenario 3**: The API response for groups includes the description field
    - **Given** groups with descriptions in the database
    - **When** the frontend fetches groups for the Request Membership page
    - **Then** the API response includes the `description` field for each group

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Ensure the group-listing API response DTO includes the `description` field (update if currently omitted).
- Update the existing Request Membership page component; do not create a new page.
- Use Mantine text/typography components for consistent styling.
