***
name: playwright-explorer
description: Explores web application using Playwright MCP and documents pages for testing
allowed-tools: [mcp__playwright__*, Read, Glob, Grep, Edit, Write]
***

# Playwright Explorer

Systematically explore a web application to document its structure, elements, and interactions for test generation.

## Input
- Feature directory (e.g., `feature-docs/003-benchmarking-system/`)
- Application URL (default: `http://localhost:3000`)

## Process
1. Read test plans from `{feature-dir}/playwright/test-plans.md`
2. Extract all page references and user flows
3. For each unique page:
   - Navigate using Playwright MCP in headed mode
   - Take screenshot and save to `{feature-dir}/playwright/screenshots/{page-name}.png`
   - Document all interactive elements with selectors
   - Note async behaviors (loading states, animations, API calls)
   - Test navigation paths

## Output
For each page, create two files in `{feature-dir}/playwright/`:

### 1. `{page-name}.page-doc.md` (Human-readable)
```markdown
# Page: [Page Name]
**URL Pattern**: /dashboard/events
**Purpose**: [What this page does]

## Key Elements

### Navigation
- **Header**: `[data-testid="app-header"]`
- **Logo link**: `a[aria-label="Home"]`

### Forms
- **Event Name Input**: `input[name="eventName"]` (required)
- **Date Picker**: `[data-testid="date-picker"]`
- **Submit Button**: `button[type="submit"]`

### Interactive Elements
- **Create Button**: `button:has-text("Create Event")`
- **Delete Icons**: `[aria-label="Delete"]`

## State Behaviors
- **Loading state**: `.spinner` appears during save
- **Success message**: `.toast-success` appears on completion
- **Error validation**: `.error-message` under invalid fields

## Navigation Flows
- **From**: Dashboard → Click "Create Event"
- **To**: Event List → After successful creation
```

### 2. `{page-name}.selectors.md` (Machine-readable)
```markdown
# Selectors for [Page Name]

## Primary Actions
CREATE_BUTTON|button:has-text("Create Event")
SUBMIT_FORM|button[type="submit"]
CANCEL_BUTTON|button:has-text("Cancel")

## Form Fields
EVENT_NAME|input[name="eventName"]
EVENT_DATE|[data-testid="date-picker"]
ROLE_SELECT|select[name="role"]

## Validation & Feedback
ERROR_MESSAGE|.error-message
SUCCESS_TOAST|.toast-success
LOADING_SPINNER|.spinner

## Lists & Tables
EVENT_ROW|[data-testid="event-row"]
DELETE_BUTTON|[aria-label="Delete"]
EDIT_BUTTON|[aria-label="Edit"]
```

Work through pages systematically. Confirm with user after each page before proceeding to next.

## Important References
- Consult the feature's `requirements.md` to understand what elements SHOULD exist on each page
- Refer to `user-stories/` folder to verify the page matches user story acceptance criteria
- If the page differs from requirements, document the discrepancy in the page-doc file
