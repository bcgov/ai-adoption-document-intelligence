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

## Authentication Setup

**For Playwright Exploration**:
1. **Navigate to app**: Go to the frontend URL (default: http://localhost:3000)
2. **Inject mock auth**: Use page.evaluate to inject fake JWT tokens into localStorage for frontend routing:

```javascript
await page.evaluate(() => {
  const createFakeJWT = (payload) => {
    const header = { alg: 'none', typ: 'JWT' };
    const base64UrlEncode = (obj) => {
      const json = JSON.stringify(obj);
      const base64 = btoa(json);
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    };
    return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.fake-signature`;
  };

  const fakeIdToken = createFakeJWT({
    name: 'Test User',
    preferred_username: 'testuser',
    email: 'test@example.com',
    sub: 'test-user',
  });

  const mockAuthTokens = {
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    id_token: fakeIdToken,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };

  localStorage.setItem('auth_tokens', JSON.stringify(mockAuthTokens));
});
```

3. **Reload page**: Reload so auth context picks up the tokens
4. **Wait for load**: Wait for networkidle state

## Process
1. Read test plans from `{feature-dir}/playwright/test-plans/` directory (all .md files except README.md)
2. Check `{feature-dir}/playwright/exploration/exploration-progress.md` for already completed test plans
3. **Process ONE test plan at a time** (first uncompleted one)
4. Extract page references and user flows from that test plan
5. Check if files for those pages already exist in `{feature-dir}/playwright/exploration/` (e.g., `dataset-list.page-doc.md`, `dataset-detail.page-doc.md`, etc.)
   - If they exist, skip exploration for that page and move to next one
   - If they don't exist, proceed to explore that page using Playwright MCP in headed mode
6. **Set up authentication** (see Authentication Setup section above)
7. For each unique page in that test plan:
   - Navigate using Playwright MCP in headed mode
   - Document all interactive elements with selectors
   - Identify elements lacking robust selectors (using only text, CSS classes, etc.)
   - **Add `data-testid` attributes to those elements in the source code**
   - Note async behaviors (loading states, animations, API calls)
   - Test navigation paths
8. Mark test plan as complete in `exploration/exploration-progress.md`
9. Confirm with user before proceeding to next test plan

## Progress Tracking

Create/update `{feature-dir}/playwright/exploration/exploration-progress.md`:

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

## Database Test Data

**BEFORE STARTING EXPLORATION**: Check if test data exists in the database for the pages you're exploring.

### Common Issues:
- **Detail pages showing "Not found"** - No test entities in database
- **List pages always empty** - No test data seeded
- **Pages can't be tested properly** - Missing related data (projects without runs, datasets without versions, etc.)

### Check & Seed Process:

1. **Check Prisma seed file**: Read `apps/shared/prisma/seed.ts` to see what test data is available
2. **Verify data matches your needs**: Ensure seed data covers all pages in the test plan
   - For dataset detail pages: Need datasets with versions and samples
   - For project detail pages: Need projects with definitions
   - For run detail pages: Need projects with definitions and runs
3. **If test data is missing or incomplete**:
   - Update `apps/shared/prisma/seed.ts` to add needed test data
   - Run `cd apps/backend-services && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes" npx prisma migrate reset --force` to reset database
   - Run `cd apps/backend-services && npm run db:seed` to populate database
   - Use consistent IDs (e.g., `seed-project-id`) for predictable testing
4. **Document the test data IDs** in your exploration notes for easy reference in tests

NOTE: switch back to project root after resetting database.

### Seed Data Best Practices:
- Use descriptive IDs with `seed-` prefix (e.g., `seed-dataset-invoices`)
- Create entities in various states (draft/published, pending/running/completed, etc.)
- Include realistic sample data (names, descriptions, metrics)
- Add relationships (projects with definitions, definitions with runs)

## Issue Detection & Fixing

When exploring a page, check if core functionality works as expected per requirements:
- Page doesn't load / shows errors
- Critical buttons/forms don't work or are missing
- Expected elements from requirements are absent
- Placeholder/stub pages (e.g., "Coming soon", "TODO", empty content)
- Broken navigation or 404s
- API calls failing that prevent page from working
- **Empty detail pages or "Not found" errors** - Check if test data exists (see Database Test Data section)
- **List pages always showing empty state** - Run db:seed to populate test data

**If issues detected**:

1. **Stop exploration** of that page
2. **Check database**: If it's a data issue, verify seed data exists and run `npm run db:seed` if needed
3. **Read requirements**: `{feature-dir}/requirements.md` or `{feature-dir}/REQUIREMENTS.md`
4. **Read user story**: The user story file from `{feature-dir}/user-stories/` for this page
5. **Fix the issue**:
   - If missing test data: Update seed file and run db:seed
   - If missing implementation: Create/update component files to meet requirements
   - Fix broken API calls or handlers
   - Implement missing functionality
   - Follow existing code patterns in the project
   - Add `data-testid` attributes from the start


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


### 3. Prioritize Selector Types

When exploring, prefer in this order:

1. **Existing `data-testid`** - Use as-is
2. **Semantic HTML** - `role`, `label`, `aria-*` attributes
3. **Add `data-testid`** - If above don't exist for critical elements
4. **Last resort** - CSS classes, text content (document as fragile)

## Output

For each page, create files in `{feature-dir}/playwright/exploration/`:

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

### 4. Updated source code files

Modified React/TypeScript component files with added `data-testid` attributes.

## Workflow

**Process one test plan at a time**:

1. Read next uncompleted test plan from exploration-progress.md
2. Extract pages from that test plan only
3. Identify elements needing selectors
4. Find and modify source files to add `data-testid`
5. Create page-doc.md and selectors.md
6. Mark test plan as complete in exploration-progress.md (do not add any extra information, just mark as complete)
7. Confirm with user before proceeding to next test plan

## Important References

- Consult the feature's `requirements.md` to understand what elements SHOULD exist on each page
- Refer to `user-stories/` folder to verify the page matches user story acceptance criteria
- If the page differs from requirements, document the discrepancy in the page-doc file
- When adding selectors, use the test plan files to understand which elements are critical for testing
