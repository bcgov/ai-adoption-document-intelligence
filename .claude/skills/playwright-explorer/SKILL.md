***
name: playwright-explorer
description: Explores web application using Playwright MCP and documents pages for testing. Also adds/updates data-testid selectors in code.
allowed-tools: [mcp__playwright__*, Read, Glob, Grep, Edit, Write]
***

# Playwright Explorer

Systematically explore a web application to document its structure, elements, and interactions for test generation. Automatically adds `data-testid` attributes to improve test reliability.

## Input
- Feature directory (e.g., `feature-docs/003-benchmarking-system/`)
- Application URL (default: `http://localhost:3000`)
- Option to add selectors to code (default: `true`)

## Process
1. Read test plans from `{feature-dir}/playwright/test-plans/` directory (all .md files except README.md)
2. Check `{feature-dir}/playwright/exploration-progress.md` for already completed test plans
3. **Process ONE test plan at a time** (first uncompleted one)
4. Extract page references and user flows from that test plan
5. For each unique page in that test plan:
   - Navigate using Playwright MCP in headed mode
   - Take screenshot and save to `{feature-dir}/playwright/screenshots/{page-name}.png`
   - Document all interactive elements with selectors
   - Identify elements lacking robust selectors (using only text, CSS classes, etc.)
   - **Add `data-testid` attributes to those elements in the source code**
   - Note async behaviors (loading states, animations, API calls)
   - Test navigation paths
6. Mark test plan as complete in `exploration-progress.md`
7. Confirm with user before proceeding to next test plan

## Progress Tracking

Create/update `{feature-dir}/playwright/exploration-progress.md`:

```markdown
# Exploration Progress

- [x] US-001.md - Completed 2026-02-15
- [x] US-003.md - Completed 2026-02-15
- [ ] US-004.md - In progress
- [ ] US-006.md
- [ ] US-008.md

**Status**: 2/5 test plans explored
**Last Updated**: 2026-02-15 3:42 PM
```


## Adding Test Selectors to Code

For each interactive element without a robust selector:

### 1. Identify Element Location

- Use Playwright snapshot to find element text/role
- Use Grep to find the component file containing that element
- Read the component file to locate the exact element


### 2. Add `data-testid` Attribute

**Naming Convention**: Use kebab-case, descriptive names

- Buttons: `{action}-btn` (e.g., `create-benchmark-btn`, `submit-form-btn`)
- Inputs: `{field}-input` (e.g., `benchmark-name-input`, `email-input`)
- Links: `{destination}-link` (e.g., `datasets-link`, `home-link`)
- Containers: `{content}-container` (e.g., `benchmark-list-container`)
- List items: `{item-type}-item` (e.g., `benchmark-item`, `dataset-item`)
- Tables: `{name}-table`, rows: `{name}-row`

**Example Addition**:

```typescript
// Before
<button onClick={handleSubmit}>Submit</button>

// After
```

<button data-testid="submit-form-btn" onClick={handleSubmit}>Submit</button>

```
```


### 3. Document Changes

Create `{feature-dir}/playwright/selector-changes.md`:

```markdown
# Selector Changes

## File: apps/frontend/src/components/BenchmarkForm.tsx
**Line**: 42
**Element**: Submit button
**Change**: Added `data-testid="submit-benchmark-btn"`
**Reason**: No reliable selector existed (was using text match)

## File: apps/frontend/src/pages/Datasets.tsx
**Line**: 89
**Element**: Dataset list item
**Change**: Added `data-testid="dataset-item"`
**Reason**: Needed stable selector for list iteration
```


### 4. Prioritize Selector Types

When exploring, prefer in this order:

1. **Existing `data-testid`** - Use as-is
2. **Semantic HTML** - `role`, `label`, `aria-*` attributes
3. **Add `data-testid`** - If above don't exist for critical elements
4. **Last resort** - CSS classes, text content (document as fragile)

## Output

For each page, create files in `{feature-dir}/playwright/`:

### 1. `{page-name}.page-doc.md` (Human-readable documentation)

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


### 3. `selector-changes.md` (Code modifications log)

Documents all `data-testid` attributes added to source code during exploration.

### 4. Updated source code files

Modified React/TypeScript component files with added `data-testid` attributes.

## Workflow

**Process one test plan at a time**:

1. Read next uncompleted test plan from exploration-progress.md
2. Extract pages from that test plan only
3. For each page: Navigate with Playwright, take snapshot/screenshot
4. Identify elements needing selectors
5. Find and modify source files to add `data-testid`
6. Document changes in selector-changes.md
7. Create page-doc.md and selectors.md
8. Mark test plan as complete in exploration-progress.md
9. Confirm with user before proceeding to next test plan

## Important References

- Consult the feature's `requirements.md` to understand what elements SHOULD exist on each page
- Refer to `user-stories/` folder to verify the page matches user story acceptance criteria
- If the page differs from requirements, document the discrepancy in the page-doc file
- When adding selectors, use the test plan files to understand which elements are critical for testing
