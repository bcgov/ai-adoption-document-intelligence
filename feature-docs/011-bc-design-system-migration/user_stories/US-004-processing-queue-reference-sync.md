# US-004: Sync Processing Queue screen with Figma reference

**As a** product team member,
**I want to** use the Processing Queue as the first synced Figma-to-code screen,
**So that** the migration has a concrete reference implementation for future screens.

## Acceptance Criteria

- [x] **Scenario 1**: Page structure matches the Figma reference
    - **Given** the Figma frame `Processing Queue — 1440`
    - **When** the Processing Queue page renders at desktop width
    - **Then** the page includes the header/sidebar context, page heading, date badge, queue card, stat cards, search input, status select, table, and row actions represented in the design

- [x] **Scenario 2**: Copy matches the Figma reference where appropriate
    - **Given** the page renders
    - **When** the user views headings, descriptions, stat labels, filters, and table headings
    - **Then** the text matches the Figma design unless the implementation requires more accurate live-data wording

- [x] **Scenario 3**: Migrated primitives use the UI adapter layer
    - **Given** Processing Queue common UI has an adapter equivalent
    - **When** the screen is updated
    - **Then** it imports those components from `apps/frontend/src/ui/`

- [x] **Scenario 4**: Table remains functional
    - **Given** documents are loaded
    - **When** the user searches, filters, opens, refreshes, or deletes documents
    - **Then** existing behaviour remains intact

- [x] **Scenario 5**: Responsive behaviour is retained
    - **Given** the page is viewed on desktop and smaller screens
    - **When** layout constraints change
    - **Then** controls and table content remain usable without overlapping or unreadable text

- [x] **Scenario 6**: Tests and checks pass
    - **Given** frontend validation commands are run
    - **When** this story is complete
    - **Then** type check, lint, and relevant component tests pass

## Priority

- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions

- Figma file: `https://www.figma.com/design/xQXAh8qWoKZqEVkIyVzBlv/BC-Gov---New-Frame?node-id=120-249&p=f&t=mB4SNoipE4qmHnfl-0`.
- Relevant code includes `apps/frontend/src/pages/QueuePage.tsx` and `apps/frontend/src/components/queue/ProcessingQueue.tsx`.
- Do not add document-specific logic for the sample form images; the screen must remain generic for arbitrary workloads.
