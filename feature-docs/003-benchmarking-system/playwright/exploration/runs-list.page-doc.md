# Page: Runs List (Informational)
**URL Pattern**: `/benchmarking/runs`
**Purpose**: Inform users that runs are organized by project and provide navigation to projects

## Key Elements

### Header Section
- **Page Title**: "Benchmark Runs" (h2)
- **Page Description**: "View all benchmark runs across projects"

### Content

#### Informational Alert
- **Alert Box**: `[data-testid="runs-info-alert"]`
  - Color: Blue
  - Icon: Info circle
  - **Alert Title**: "Runs are organized by project"
  - **Alert Description**: "Benchmark runs are currently viewed within their respective project pages. Navigate to a project to view its runs, start new runs, and track progress."
  - **View Projects Button**: `[data-testid="view-projects-btn"]`
    - Variant: Light
    - Size: Small
    - Navigates to `/benchmarking/projects` on click

#### Placeholder Message
- **Message**: `[data-testid="runs-placeholder-message"]`
  - Text: "A unified runs view across all projects will be implemented in a future user story."
  - Style: Dimmed, small size

## State Behaviors
- **Active Navigation**: "Runs" nav item is highlighted when on this page
- **Benchmarking Section**: Parent "Benchmarking" nav item remains highlighted
- **Button Click**: "View Projects" button navigates to projects list page

## Navigation Flows
- **From Sidebar**: Click "Runs" in benchmarking section → Load this page
- **To Projects**: Click "View Projects" button → Navigate to `/benchmarking/projects`

## Architecture Notes
- **Design Decision**: Runs are nested within projects rather than having a global runs view
  - Primary access: Project detail pages show runs for that project
  - Run details: Accessed via `/benchmarking/projects/{id}/runs/{runId}`
  - This page serves as a wayfinding/informational page

- **Backend API**:
  - `useRuns(projectId)` hook requires a project ID
  - No global "all runs" endpoint exists currently
  - Future implementation would need new backend endpoint for cross-project runs query

## Implementation Details
- Uses informational Alert component from Mantine
- Includes navigation helper button to guide users
- Clear messaging about current architecture
- Sets user expectations for future features

## Notes
- **Status**: Implemented as informational/wayfinding page
- Route is properly configured and accessible
- Provides better UX than a simple placeholder message
- Guides users to the correct location for viewing runs (project pages)
- Sets expectations that a unified view may come in the future
