---
name: test-generator
description: Generates Playwright test code from test plans and exploration data
---

# Playwright Test Generator

Generate production-ready Playwright tests from test plans and page exploration data.

## Input
- Feature directory (e.g., `feature-docs/003-benchmarking-system/`)

## Process
1. Read all test plan files from `{feature-dir}/playwright/test-plans/` directory (all .md files except README.md)
2. Check `{feature-dir}/playwright/test-generation/generation-progress.md` for already completed test plans
3. **Process ONE test plan at a time** (first uncompleted one)
4. Read all `*.page-doc.md` and `*.selectors.md` files from `{feature-dir}/playwright/exploration/` relevant to that test plan
5. For each test scenario in that test plan:
   - Create TypeScript test file in `tests/e2e/{feature-name}/`
   - Generate Page Object Models in `tests/e2e/pages/`
   - Use documented selectors from exploration
   - Include proper waits and assertions
6. **Reset and seed database** before running tests (see Database Management section)
7. **Run the generated tests** to verify they work
8. **If tests fail**, fix the issues (see Test Verification & Fixing section)
9. Mark test plan as complete in `{feature-dir}/playwright/test-generation/generation-progress.md` (do not add any other information, just mark as complete)
10. Confirm with user before proceeding to next test plan

## Database Management

**CRITICAL**: Reset and seed the database before running tests to ensure consistent starting state.

### Reset & Seed Process

Before running any tests, execute these commands:

```bash
# From apps/backend-services directory
cd apps/backend-services

# Reset database (drops all data)
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes" npx prisma migrate reset --force

# Run migrations
npm run db:migrate

# Seed test data
npm run db:seed
```

**OR** use the combined reset command:
```bash
cd apps/backend-services && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes" npx prisma migrate reset --force && npm run db:seed
```

NOTE: switch back to project root after resetting database.


### Seed Data Requirements

1. **Verify seed file**: Read `apps/shared/prisma/seed.ts` to understand available test data
2. **Check coverage**: Ensure seed data covers all scenarios in the test plan
3. **Document IDs**: Note the seed data IDs used in tests (e.g., `seed-project-id`, `seed-dataset-invoices`)
4. **If seed data is missing**:
   - Update `apps/shared/prisma/seed.ts` to add needed test entities
   - Use descriptive IDs with `seed-` prefix
   - Create entities in various states (draft/published, pending/completed, etc.)
   - Include realistic sample data and relationships
   - Run `npm run db:seed` to populate

## Progress Tracking

Create/update `{feature-dir}/playwright/test-generation/generation-progress.md`:

```markdown
# Test Generation Progress

- [x] US-001.md - Completed 2026-02-15
- [x] US-003.md - Completed 2026-02-15
- [ ] US-004.md - In progress
- [ ] US-006.md
- [ ] US-008.md

**Status**: 2/5 test plans generated
**Last Updated**: 2026-02-15 3:42 PM
```

## Key Design Principles

To run Playwright tests in parallel without interference, you need to ensure **test isolation** – each test must run independently without sharing state. Playwright creates separate browser contexts for each test by default, but tests can still interact if they share external resources like databases, files, or API state.[^1][^2][^3]


**Ensure Complete Test Independence**
Each test should have its own:

- Browser context (provided automatically by Playwright)[^2]
- Test data (unique usernames, email addresses, etc.)
- Storage state (cookies, local storage, session storage)[^1]
- External resources (separate database records, unique file paths)

**Avoid Shared State**
Common causes of test interference include:

- Tests modifying the same database records
- Sharing login sessions or authentication tokens
- Writing to the same files or directories
- Depending on execution order
- Using hardcoded test data that multiple tests reference[^4]


## Configuration Options

**Control Specific Test Groups**
For tests that must run sequentially (like database setup/teardown):

```typescript
// Mark specific files to run sequentially
test.describe.configure({ mode: 'serial' });

test('Test 1', async ({ page }) => { /* ... */ });
test('Test 2', async ({ page }) => { /* ... */ });
```


## Best Practices

- **Use unique identifiers**: Generate random IDs, timestamps, or UUIDs for test data to prevent collisions[^4]
- **Isolate test environments**: Use separate test databases or API mocking for each test
- **Leverage browser contexts**: Each test automatically gets a fresh context – don't share pages between tests[^3]
- **Clean up properly**: Use `afterEach()` hooks to remove test data, but prefer starting fresh over cleanup[^3]
- **Run in headless mode**: Reduces resource consumption during parallel execution[^4]
- **Limit workers**: Set workers based on available CPU/memory to prevent resource exhaustion[^4]


## Output Structure

### Page Object Model: `tests/e2e/pages/{PageName}Page.ts`
```typescript
import { Page, Locator } from '@playwright/test';

export class EventCreationPage {
  readonly page: Page;
  readonly createButton: Locator;
  readonly eventNameInput: Locator;
  readonly submitButton: Locator;
  readonly successToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.locator('button:has-text("Create Event")');
    this.eventNameInput = page.locator('input[name="eventName"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.successToast = page.locator('.toast-success');
  }

  async createEvent(name: string, date: string) {
    await this.createButton.click();
    await this.eventNameInput.fill(name);
    await this.page.locator('[data-testid="date-picker"]').fill(date);
    await this.submitButton.click();
    await this.successToast.waitFor({ state: 'visible' });
  }
}
```

### Test File: `tests/e2e/{feature-name}/{scenario-name}.spec.ts`
```typescript
import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from '../helpers/auth';
import { EventCreationPage } from '../pages/EventCreationPage';

test.describe('Event Creation - Happy Path', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  let eventPage: EventCreationPage;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test.beforeEach(async ({ page }) => {
    // Setup authentication (both frontend and backend)
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    eventPage = new EventCreationPage(page);
  });

  test('should create event with valid data', async ({ page }) => {
    // Given: User is on dashboard
    await expect(page).toHaveURL(/dashboard/);

    // When: User creates an event
    await eventPage.createEvent('Team Meeting', '2026-03-15');

    // Then: Event is created successfully
    await expect(eventPage.successToast).toBeVisible();
    await expect(page.locator('[data-testid="event-row"]')).toContainText('Team Meeting');

    // Take screenshot for verification
    await page.screenshot({
      path: 'test-results/event-creation-success.png',
      fullPage: true,
    });
  });

  test('should show error for empty event name', async ({ page }) => {
    // Given: User is on event creation form
    await eventPage.createButton.click();

    // When: User submits without entering name
    await eventPage.submitButton.click();

    // Then: Error message is displayed
    await expect(page.locator('.error-message')).toContainText('Event name is required');
  });
});
```

## Required Test Patterns (from WRITING_TESTS.md)

### Authentication Setup
**CRITICAL**: Every test MUST use the authentication helper:

```typescript
await setupAuthenticatedTest(page, {
  apiKey: TEST_API_KEY!,
  backendUrl: BACKEND_URL,
  frontendUrl: FRONTEND_URL,
});
```

This helper:
- Sets up request interception to add `x-api-key` header for backend API calls
- Navigates to the frontend
- Injects mock auth tokens into localStorage
- Reloads the page so the app sees the tokens
- Waits for the page to be ready

### Common Testing Patterns to Follow

#### Pattern 1: Testing a Page Load
```typescript
test('should load the workflows page', async ({ page }) => {
  await setupAuthenticatedTest(page, {
    apiKey: TEST_API_KEY!,
    backendUrl: BACKEND_URL,
    frontendUrl: FRONTEND_URL,
  });

  // Click navigation item
  await page.getByText('Workflows').click();
  await page.waitForLoadState('networkidle');

  // Verify page loaded
  const heading = page.getByRole('heading', { name: /workflows/i });
  await expect(heading).toBeVisible();
});
```

#### Pattern 2: Testing a List of Items
```typescript
test('should display workflow list', async ({ page }) => {
  await setupAuthenticatedTest(page, {
    apiKey: TEST_API_KEY!,
    backendUrl: BACKEND_URL,
    frontendUrl: FRONTEND_URL,
  });

  await page.getByText('Workflows').click();
  await page.waitForLoadState('networkidle');

  // Verify specific item exists
  const workflow = page.getByText('Standard OCR Workflow').first();
  await expect(workflow).toBeVisible();

  // Or check for multiple items
  const workflows = page.getByRole('listitem');
  await expect(workflows).toHaveCount(3); // or .toBeGreaterThan(0)
});
```

#### Pattern 3: Testing Navigation Between Pages
```typescript
test('should navigate from list to detail page', async ({ page }) => {
  await setupAuthenticatedTest(page, {
    apiKey: TEST_API_KEY!,
    backendUrl: BACKEND_URL,
    frontendUrl: FRONTEND_URL,
  });

  // Go to list page
  await page.getByText('HITL Review').click();
  await page.waitForLoadState('networkidle');

  // Click on an item
  await page.getByText('Review Session #1').click();
  await page.waitForLoadState('networkidle');

  // Verify detail page loaded
  const detailHeading = page.getByRole('heading', { name: /review session #1/i });
  await expect(detailHeading).toBeVisible();
});
```

#### Pattern 4: Testing Forms and Interactions
```typescript
test('should create a new project', async ({ page }) => {
  await setupAuthenticatedTest(page, {
    apiKey: TEST_API_KEY!,
    backendUrl: BACKEND_URL,
    frontendUrl: FRONTEND_URL,
  });

  await page.getByText('Training Labels').click();
  await page.waitForLoadState('networkidle');

  // Click create button
  await page.getByRole('button', { name: /new project/i }).click();

  // Fill in form
  await page.getByLabel('Project Name').fill('My Test Project');
  await page.getByLabel('Description').fill('Test description');

  // Submit
  await page.getByRole('button', { name: /create/i }).click();

  // Verify success
  await expect(page.getByText('My Test Project')).toBeVisible();
});
```

## Best Practices

### ✅ DO
- **Reset and seed database before running tests** to ensure consistent state
- Use the `setupAuthenticatedTest` helper for consistency
- Wait for `networkidle` after navigation
- Use `.first()` when multiple elements match
- Take screenshots for visual verification
- Use semantic selectors (role, label, text) over CSS selectors
- Make tests independent (don't rely on test order)
- Include Given/When/Then comments for clarity
- Add requirement traceability comments (e.g., `// REQ-003: User can create events`)
- **Run tests after generation** to verify they work
- **Fix broken features** if tests correctly identify implementation issues

### ❌ DON'T
- Don't hardcode URLs (use environment variables)
- Don't test without API key setup (backend will return 403)
- Don't forget to wait for loading states
- Don't use `page.locator('#id')` unless necessary
- Don't commit test screenshots to git
- **Don't skip database reset** - tests may fail due to stale data
- **Don't mark tests complete without running them** - always verify they pass

## File Naming Convention
```
tests/e2e/
  {feature-name}/
    {feature-name}.spec.ts           # Main feature test
    {feature-name}-details.spec.ts   # Detail page test
    {feature-name}-forms.spec.ts     # Form interactions
```

## Workflow

**Process one test plan at a time**:

1. Read next uncompleted test plan from `generation-progress.md`
2. Read corresponding exploration files (`*.page-doc.md` and `*.selectors.md`)
3. Generate test files and Page Object Models for that test plan only
4. Reset and seed database
5. Run tests to verify they work
6. Fix any failures (see Test Verification & Fixing section)
7. Mark test plan as complete in `generation-progress.md` (do not add any other information, just mark as complete)
8. Confirm with user before proceeding to next test plan

## Test Verification & Fixing

After generating tests, **ALWAYS verify they work** by running them.

### Running Tests

```bash
# Run specific test file
npx playwright test tests/e2e/{feature-name}/{test-file}.spec.ts

# Run all tests for a feature
npx playwright test tests/e2e/{feature-name}/

# Run with UI mode for debugging
npx playwright test --ui

# Run in headed mode to see browser
npx playwright test --headed
```

### Handling Test Failures

When tests fail, identify the root cause:

#### 1. **Selector Issues**
- **Symptom**: Element not found, timeout waiting for element
- **Cause**: Selector changed, `data-testid` missing, element not rendered
- **Fix**:
  - Check if element exists in the page (use Playwright inspector or headed mode)
  - Verify selector in exploration files is still accurate
  - Update selector in Page Object Model if needed
  - Add missing `data-testid` to source component if needed

#### 2. **Missing Test Data**
- **Symptom**: Empty lists, "Not found" pages, missing entities
- **Cause**: Seed data doesn't exist or doesn't match test expectations
- **Fix**:
  - Update `apps/shared/prisma/seed.ts` to add required test data
  - Run `cd apps/backend-services && npm run db:seed`
  - Re-run tests

#### 3. **Broken Feature Implementation**
- **Symptom**: Test correctly identifies that feature doesn't work as expected
- **Cause**: Feature is not implemented, partially implemented, or has bugs
- **Fix**:
  - Read `{feature-dir}/requirements.md` to understand expected behavior
  - Read corresponding user story from `{feature-dir}/user-stories/`
  - Fix the implementation in frontend/backend code:
    - Update React components if UI is missing/broken
    - Fix API endpoints if backend calls fail
    - Add missing functionality
    - Follow existing code patterns
  - Add `data-testid` attributes if missing
  - Re-run tests to verify fix

#### 4. **Timing/Race Condition Issues**
- **Symptom**: Intermittent failures, "element is not visible", "element is detached"
- **Cause**: Test interacts with elements before they're ready, async state updates
- **Fix**:
  - Add proper waits: `await page.waitForLoadState('networkidle')`
  - Wait for specific elements: `await element.waitFor({ state: 'visible' })`
  - Use Playwright auto-waiting: prefer `page.getByRole()` over `page.locator()`
  - Add waits after navigation or form submission

#### 5. **Authentication Issues**
- **Symptom**: 403 errors, redirects to login, unauthorized API calls
- **Cause**: `setupAuthenticatedTest` not called or not working correctly
- **Fix**:
  - Ensure `setupAuthenticatedTest` is called in `beforeEach`
  - Verify `TEST_API_KEY` environment variable is set
  - Check that auth helper is correctly setting up both frontend and backend auth
  - Verify backend API calls include `x-api-key` header

### Iterative Fix Process

1. **Reset database**: `cd apps/backend-services && PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes" npx prisma migrate reset --force && npm run db:seed`
2. **Run failing test**: `npx playwright test path/to/test.spec.ts`
3. **Identify root cause** from error message and test output
4. **Apply fix** (update test, add data, fix feature, etc.)
5. **Re-run test** to verify fix
6. **Repeat** until all tests pass

### When to Stop and Ask User

- If feature implementation requires significant architectural changes
- If requirements are unclear or contradictory
- If multiple test plans are failing for the same underlying issue
- If you've attempted 3+ fixes without success

## Important References
- **ALWAYS** refer to the feature's `requirements.md` when generating tests to ensure correct expected behavior
- Cross-reference `user-stories/` folder to verify acceptance criteria are tested
- If a test scenario doesn't match the requirements, flag it with a comment: `// ⚠️ TODO: Verify expected behavior with requirements.md`
- Include requirement IDs in test comments for traceability
