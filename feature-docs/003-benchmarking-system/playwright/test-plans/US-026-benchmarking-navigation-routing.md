# Test Plan: US-026 - Benchmarking Navigation & Routing

**Source**: `user-stories/US-026-benchmarking-navigation-routing.md`
**Requirement Section**: Section 10.4 (Navigation)
**Priority**: High

## User Story
**As a** user,
**I want to** access benchmarking features from the application sidebar,
**So that** I can navigate to dataset management, projects, and runs views.

## Acceptance Criteria
- Benchmarking section in sidebar
- Dataset route is configured
- Dataset detail route is configured
- Projects route is configured
- Project detail route with definitions and runs
- Run detail route is configured
- Active route is highlighted in sidebar

## Test Scenarios

### Scenario 1: Sidebar Navigation Structure
- **Type**: Happy Path
- **Priority**: High

**Given**: User is logged into the application
**When**: The application loads and renders the sidebar
**Then**:
- A "Benchmarking" section is visible in the sidebar
- The section contains sub-items: "Datasets", "Projects", and "Runs"
- All navigation items are clickable

**Affected Pages**: All pages with sidebar (App.tsx)
**Data Requirements**: Authenticated user session
**Prerequisites**: User logged in with valid credentials

### Scenario 2: Navigate to Dataset List
- **Type**: Happy Path
- **Priority**: High

**Given**: User is on any page in the application
**When**: User clicks "Datasets" in the Benchmarking sidebar section
**Then**:
- URL changes to `/benchmarking/datasets`
- Dataset list page is rendered
- "Datasets" sidebar item is highlighted as active

**Affected Pages**: Sidebar navigation, Dataset list page
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 3: Navigate to Dataset Detail
- **Type**: Happy Path
- **Priority**: High

**Given**: User is on the dataset list page and datasets exist
**When**: User clicks on a dataset name or row
**Then**:
- URL changes to `/benchmarking/datasets/{datasetId}`
- Dataset detail page is rendered showing version list and sample preview
- "Datasets" sidebar item remains highlighted

**Affected Pages**: Dataset list, Dataset detail page
**Data Requirements**: At least one dataset with ID
**Prerequisites**: User logged in, dataset exists

### Scenario 4: Navigate to Projects List
- **Type**: Happy Path
- **Priority**: High

**Given**: User is on any page in the application
**When**: User clicks "Projects" in the Benchmarking sidebar section
**Then**:
- URL changes to `/benchmarking/projects`
- Projects list page is rendered
- "Projects" sidebar item is highlighted as active

**Affected Pages**: Sidebar navigation, Projects list page
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 5: Navigate to Project Detail
- **Type**: Happy Path
- **Priority**: High

**Given**: User is on the projects list page and projects exist
**When**: User clicks on a project name or row
**Then**:
- URL changes to `/benchmarking/projects/{projectId}`
- Project detail page is rendered showing definition list and run list
- "Projects" sidebar item remains highlighted

**Affected Pages**: Projects list, Project detail page
**Data Requirements**: At least one project with ID
**Prerequisites**: User logged in, project exists

### Scenario 6: Navigate to Run Detail
- **Type**: Happy Path
- **Priority**: High

**Given**: User is on a project detail page with runs
**When**: User clicks on a run from the run list
**Then**:
- URL changes to `/benchmarking/projects/{projectId}/runs/{runId}`
- Run detail page is rendered with metrics, artifacts, and links
- "Projects" sidebar item remains highlighted

**Affected Pages**: Project detail page, Run detail page
**Data Requirements**: Project with at least one run
**Prerequisites**: User logged in, project and run exist

### Scenario 7: Direct URL Navigation
- **Type**: Edge Case
- **Priority**: Medium

**Given**: User has a direct URL to a benchmarking page
**When**: User enters `/benchmarking/projects/{projectId}` in the browser
**Then**:
- The project detail page loads correctly
- Sidebar renders with "Projects" highlighted
- No navigation errors occur

**Affected Pages**: All benchmarking pages
**Data Requirements**: Valid entity IDs in URL
**Prerequisites**: User logged in, entities exist

### Scenario 8: Browser Back/Forward Navigation
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User has navigated through multiple benchmarking pages
**When**: User clicks browser back button
**Then**:
- Previous page is restored
- Sidebar active state updates correctly
- Page content matches the URL

**Affected Pages**: All benchmarking pages
**Data Requirements**: Navigation history with multiple pages
**Prerequisites**: User has visited multiple pages

### Scenario 9: Invalid Route Handling
- **Type**: Error Case
- **Priority**: Medium

**Given**: User navigates to a non-existent benchmarking route
**When**: User enters `/benchmarking/invalid-route` in the browser
**Then**:
- 404 or not-found page is displayed
- Sidebar still renders correctly
- User can navigate to valid routes from error page

**Affected Pages**: Error page, Sidebar
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 10: Lazy Loading Verification
- **Type**: Happy Path
- **Priority**: Low

**Given**: Benchmarking pages are configured for lazy loading
**When**: User first navigates to a benchmarking page
**Then**:
- Page loads without errors
- Loading indicator appears during code splitting
- Page renders completely after load

**Affected Pages**: All benchmarking pages
**Data Requirements**: None
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (all main navigation flows)
- ✅ Edge cases covered (direct URLs, browser navigation)
- ✅ Error handling covered (invalid routes)
- ⚠️ Missing: Performance testing for lazy loading
- ⚠️ Missing: Accessibility testing for keyboard navigation
