# US-026: Benchmarking Navigation & Routing

**As a** user,
**I want to** access benchmarking features from the application sidebar,
**So that** I can navigate to dataset management, projects, and runs views.

## Acceptance Criteria
- [ ] **Scenario 1**: Benchmarking section in sidebar
    - **Given** the existing sidebar navigation in `apps/frontend/src/App.tsx`
    - **When** the application loads
    - **Then** a "Benchmarking" section is visible in the sidebar with sub-items for Datasets, Projects, and Runs

- [ ] **Scenario 2**: Dataset route is configured
    - **Given** the React Router configuration
    - **When** the user navigates to `/benchmarking/datasets`
    - **Then** the dataset list page is rendered

- [ ] **Scenario 3**: Dataset detail route is configured
    - **Given** the React Router configuration
    - **When** the user navigates to `/benchmarking/datasets/:id`
    - **Then** the dataset detail page is rendered with version list and sample preview

- [ ] **Scenario 4**: Projects route is configured
    - **Given** the React Router configuration
    - **When** the user navigates to `/benchmarking/projects`
    - **Then** the projects list page is rendered

- [ ] **Scenario 5**: Project detail route with definitions and runs
    - **Given** the React Router configuration
    - **When** the user navigates to `/benchmarking/projects/:id`
    - **Then** the project detail page is rendered with definition list and run list

- [ ] **Scenario 6**: Run detail route is configured
    - **Given** the React Router configuration
    - **When** the user navigates to `/benchmarking/projects/:id/runs/:runId`
    - **Then** the run detail page is rendered with metrics, artifacts, and links

- [ ] **Scenario 7**: Active route is highlighted in sidebar
    - **Given** the user is on a benchmarking page
    - **When** the sidebar renders
    - **Then** the corresponding sidebar item is highlighted as active

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Modify: `apps/frontend/src/App.tsx` (sidebar navigation and route configuration)
- Uses existing React Router setup
- Benchmarking pages are lazy-loaded for code splitting
- See Requirements Section 10.4 (Navigation)
- Sub-views: Datasets, Projects, Definitions (nested under Projects), Runs (nested under Projects), Results (nested under Runs)
