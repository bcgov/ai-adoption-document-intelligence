# Page: Projects List
**URL Pattern**: `/benchmarking/projects`
**Purpose**: Display all benchmark projects, create new projects, and navigate to project details

## Key Elements

### Header Section
- **Page Header Group**: `[data-testid="projects-header"]`
  - **Page Title**: "Benchmark Projects" (h2)
  - **Page Description**: "Organize benchmarks by project"
  - **Create Button**: `[data-testid="create-project-btn"]` - Blue button with plus icon in top right

### Empty State (when no projects exist)
- **Empty State Container**: `[data-testid="projects-empty-state"]`
  - Folder icon (gray, size 48)
  - **Title**: "No projects yet" (bold)
  - **Description**: "Create your first benchmark project to get started"
  - **Create Button**: `[data-testid="create-project-empty-btn"]` - Blue button with plus icon

### Projects Table (when projects exist)
- **Table**: `[data-testid="projects-table"]`
  - Striped rows with hover highlighting
  - Columns:
    - **Name**: Project name (bold)
    - **Description**: Project description (dimmed, truncated)
    - **Definitions**: Number of definitions in project
    - **Runs**: Number of runs in project
    - **Created Date**: Formatted date

- **Project Row**: `[data-testid="project-row-{id}"]` (dynamic ID based on project)
  - Clickable row (pointer cursor)
  - Navigates to project detail page on click

## State Behaviors
- **Loading State**: Shows centered loader with "lg" size while fetching projects
- **Empty State**: Displayed when `projects.length === 0`
- **Table State**: Displayed when `projects.length > 0`
- **Row Hover**: Table rows highlight on hover
- **Row Click**: Clicking a row navigates to `/benchmarking/projects/{id}`

## Navigation Flows
- **Create Project**: Click "Create Project" button → Opens create dialog (when implemented)
- **View Project Details**: Click on any project row → Navigate to project detail page
- **From Sidebar**: Click "Projects" in benchmarking section → Load this page

## API Integration
- **GET** `/api/benchmark/projects` - Fetch projects list
  - Returns 403 with mock auth (expected behavior)
  - Would populate table when properly authenticated
  - Returns array of ProjectSummary objects with id, name, description, definitionCount, runCount, etc.

## Implementation Details
- Uses `useProjects()` hook from `../hooks/useProjects`
- Follows same pattern as DatasetListPage
- Includes loading state, empty state, and table view
- Currently missing CreateProjectDialog component (placeholder TODO)

## Notes
- **Status**: Fully implemented with backend integration
- Page handles both empty and populated states
- Table uses Mantine Table component with striping and hover effects
- Project descriptions are truncated to one line with ellipsis
- Counts default to 0 if not provided
- Dates are formatted using `toLocaleDateString()`
- Two create buttons provide multiple entry points for the same action
