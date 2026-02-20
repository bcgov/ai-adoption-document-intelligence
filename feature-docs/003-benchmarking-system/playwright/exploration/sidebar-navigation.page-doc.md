# Page: Sidebar Navigation
**URL Pattern**: All pages (persistent navigation)
**Purpose**: Primary navigation for accessing all application features including benchmarking section

## Key Elements

### Header
- **App Title**: "Document intelligence" with "Live OCR" badge
- **User Info**: Displays user name and email
- **User Avatar**: Shows first letter of user name
- **Logout Button**: `[data-testid="logout-btn"]` - Red button to logout

### Sidebar Controls
- **Collapse/Expand Toggle**: `[data-testid="sidebar-toggle-btn"]` - Located on right edge of sidebar
  - Shows chevron left icon when expanded
  - Shows chevron right icon when collapsed

### Main Navigation Items
- **Upload**: Navigate to upload page
- **Processing queue**: Navigate to queue page
- **Training Labels**: Navigate to labeling page
- **HITL Review**: Navigate to review page
- **Workflows**: Navigate to workflows page
- **Settings**: Navigate to settings page

### Benchmarking Section
- **Parent Nav Item**: `[data-testid="benchmarking-nav"]` (expanded) or `[data-testid="benchmarking-nav-collapsed"]` (collapsed)
  - Label: "Benchmarking"
  - Description: "Benchmark management"
  - Icon: Chart bar icon
  - Expandable/collapsible when sidebar is expanded
  - Single icon button when sidebar is collapsed

### Benchmarking Sub-Items
- **Datasets Link**: `[data-testid="datasets-nav-link"]`
  - Label: "Datasets"
  - Description: "Manage benchmark datasets"
  - Route: `/benchmarking/datasets`

- **Projects Link**: `[data-testid="projects-nav-link"]`
  - Label: "Projects"
  - Description: "Benchmark projects"
  - Route: `/benchmarking/projects`

- **Runs Link**: `[data-testid="runs-nav-link"]`
  - Label: "Runs"
  - Description: "Benchmark runs"
  - Route: `/benchmarking/runs`

## State Behaviors
- **Active Route Highlighting**:
  - Benchmarking parent nav item is highlighted (blue/light variant) when on any `/benchmarking/*` route
  - Child nav items show filled variant when exactly matching the current route
  - Non-benchmarking nav items are highlighted when on their respective routes

- **Sidebar Collapse State**:
  - Expanded: Shows labels and descriptions for all nav items
  - Collapsed: Shows only icons with tooltips on hover
  - State persists across navigation

- **Benchmarking Section Expansion**:
  - Auto-expands when navigating to any benchmarking route
  - Can be manually collapsed/expanded when sidebar is in expanded mode
  - Hidden when sidebar is collapsed (only icon shown)

## Navigation Flows
- **Expand Benchmarking**: Click on "Benchmarking" parent item to expand/collapse sub-items
- **Navigate to Datasets**: Click "Datasets" in benchmarking section
- **Navigate to Projects**: Click "Projects" in benchmarking section
- **Navigate to Runs**: Click "Runs" in benchmarking section
- **Toggle Sidebar**: Click collapse/expand button to toggle sidebar width
- **Logout**: Click "Logout" button to sign out

## Notes
- Sidebar is responsive and can be collapsed to save screen space
- All benchmarking routes maintain the benchmarking section highlighting
- Navigation items include both icons and text descriptions when expanded
- Tooltips provide context when sidebar is collapsed
