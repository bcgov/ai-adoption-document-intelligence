***
name: test-generator
description: Generates Playwright test code from test plans and exploration data
allowed-tools: [Read, Glob, Grep, Edit, Write, Bash]
***

# Playwright Test Generator

Generate production-ready Playwright tests from test plans and page exploration data.

## Input
- Feature directory (e.g., `feature-docs/003-benchmarking-system/`)

## Process
1. Read all test plan files from `{feature-dir}/playwright/test-plans/` directory
2. Read all `*.page-doc.md` and `*.selectors.md` files from `{feature-dir}/playwright/`
3. Read `selector-changes.md` to understand which `data-testid` attributes were added
4. For each test scenario in the plan:
   - Create TypeScript test file in `tests/e2e/{feature-name}/`
   - Generate Page Object Models in `tests/e2e/pages/`
   - Use documented selectors from exploration
   - Include proper waits and assertions

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
- Use the `setupAuthenticatedTest` helper for consistency
- Wait for `networkidle` after navigation
- Use `.first()` when multiple elements match
- Take screenshots for visual verification
- Use semantic selectors (role, label, text) over CSS selectors
- Make tests independent (don't rely on test order)
- Include Given/When/Then comments for clarity
- Add requirement traceability comments (e.g., `// REQ-003: User can create events`)

### ❌ DON'T
- Don't hardcode URLs (use environment variables)
- Don't test without API key setup (backend will return 403)
- Don't forget to wait for loading states
- Don't use `page.locator('#id')` unless necessary
- Don't commit test screenshots to git

## File Naming Convention
```
tests/e2e/
  {feature-name}/
    {feature-name}.spec.ts           # Main feature test
    {feature-name}-details.spec.ts   # Detail page test
    {feature-name}-forms.spec.ts     # Form interactions
```

## Important References
- **ALWAYS** refer to the feature's `requirements.md` when generating tests to ensure correct expected behavior
- Cross-reference `user-stories/` folder to verify acceptance criteria are tested
- If a test scenario doesn't match the requirements, flag it with a comment: `// ⚠️ TODO: Verify expected behavior with requirements.md`
- Include requirement IDs in test comments for traceability
