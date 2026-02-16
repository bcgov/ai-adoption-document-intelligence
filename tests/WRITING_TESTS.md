# Writing New Playwright Tests

This guide explains how to write new E2E tests for the AI OCR application.

## Quick Start - Copy This Template

```typescript
import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from './helpers/auth';

test.describe('Your Feature Name', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test('should do something amazing', async ({ page }) => {
    // Setup authentication (both frontend and backend)
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    // Now the app is loaded and authenticated!
    // Write your test here...

    // Navigate to your page
    await page.getByText('Your Menu Item').click();

    // Wait for data to load
    await page.waitForLoadState('networkidle');

    // Verify something
    const heading = page.getByRole('heading', { name: /your page title/i });
    await expect(heading).toBeVisible();

    // Take a screenshot (optional but helpful)
    await page.screenshot({
      path: 'test-results/your-feature.png',
      fullPage: true,
    });
  });
});
```

## Understanding the Auth Setup

### Why Do We Need Two Auth Mechanisms?

1. **Frontend Auth** (localStorage tokens):
   - The React app checks localStorage for auth tokens
   - Without tokens, it shows the login screen
   - We inject fake tokens to bypass SSO

2. **Backend Auth** (API key):
   - Backend APIs require authentication
   - We intercept requests and add the `x-api-key` header
   - This allows the frontend to fetch real data

### The Helper Function Does Both

```typescript
await setupAuthenticatedTest(page, {
  apiKey: TEST_API_KEY!,
  backendUrl: BACKEND_URL,
  frontendUrl: FRONTEND_URL,
});
```

This single function:
1. ✅ Sets up request interception to add `x-api-key` header
2. ✅ Navigates to the frontend
3. ✅ Injects mock auth tokens into localStorage
4. ✅ Reloads the page so the app sees the tokens
5. ✅ Waits for the page to be ready

## Common Testing Patterns

### Pattern 1: Testing a Page Load

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

### Pattern 2: Testing a List of Items

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

### Pattern 3: Testing Navigation Between Pages

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

### Pattern 4: Testing Forms and Interactions

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

## Advanced: Customizing Auth

### Custom User Profile

```typescript
await setupAuthenticatedTest(page, {
  apiKey: TEST_API_KEY!,
  backendUrl: BACKEND_URL,
  frontendUrl: FRONTEND_URL,
  userProfile: {
    name: 'Admin User',
    email: 'admin@example.com',
    sub: 'admin-user-id',
  },
});
```

### Manual Auth Setup (if you need more control)

```typescript
import { setupApiKeyAuth, injectMockAuth } from './helpers/auth';

test('manual auth setup', async ({ page }) => {
  // Set up API key first
  await setupApiKeyAuth(page, TEST_API_KEY!, BACKEND_URL);

  // Navigate
  await page.goto(FRONTEND_URL);

  // Custom auth logic here...

  // Then inject mock auth
  await injectMockAuth(page);

  await page.reload();
  await page.waitForLoadState('networkidle');
});
```

## Debugging Tips

### 1. Take Screenshots at Each Step

```typescript
await page.screenshot({ path: 'test-results/step-1-loaded.png' });
await page.getByText('Something').click();
await page.screenshot({ path: 'test-results/step-2-clicked.png' });
```

### 2. Log Network Requests

```typescript
page.on('request', request => {
  console.log('>>', request.method(), request.url());
});

page.on('response', response => {
  console.log('<<', response.status(), response.url());
});
```

### 3. Check for API Errors

```typescript
page.on('response', response => {
  if (response.status() >= 400) {
    console.error('API Error:', response.status(), response.url());
  }
});
```

### 4. Use Playwright Inspector

```bash
# Run test in debug mode
npx playwright test --debug tests/e2e/your-test.spec.ts

# Or use headed mode to see the browser
npx playwright test --headed tests/e2e/your-test.spec.ts
```

## Best Practices

### ✅ DO

- Use the `setupAuthenticatedTest` helper for consistency
- Wait for `networkidle` after navigation
- Use `.first()` when multiple elements match
- Take screenshots for visual verification
- Use semantic selectors (role, label, text) over CSS selectors
- Make tests independent (don't rely on test order)

### ❌ DON'T

- Don't hardcode URLs (use environment variables)
- Don't test without API key setup (backend will return 403)
- Don't forget to wait for loading states
- Don't use `page.locator('#id')` unless necessary
- Don't commit test screenshots to git

## File Naming Convention

```
tests/e2e/
  feature-name.spec.ts          # Main feature test
  feature-name-details.spec.ts  # Detail page test
  feature-name-forms.spec.ts    # Form interactions
```

## Running Your Tests

```bash
# Run your specific test
npx playwright test tests/e2e/your-feature.spec.ts

# Run in watch mode while developing
npx playwright test tests/e2e/your-feature.spec.ts --watch

# Run in UI mode (interactive)
npx playwright test tests/e2e/your-feature.spec.ts --ui

# Run in headed mode (see browser)
npx playwright test tests/e2e/your-feature.spec.ts --headed
```

## Example: Complete Test File

Here's a complete example testing the Benchmarking page:

```typescript
import { test, expect } from '@playwright/test';
import { setupAuthenticatedTest } from './helpers/auth';

test.describe('Benchmarking Datasets', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test('should display datasets page', async ({ page }) => {
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    // Navigate to Benchmarking
    await page.getByText('Benchmarking').click();

    // Click on Datasets submenu (if collapsed, may need to click twice)
    const datasetsLink = page.getByText('Datasets');
    if (await datasetsLink.isVisible()) {
      await datasetsLink.click();
    }

    await page.waitForLoadState('networkidle');

    // Verify page loaded
    const heading = page.getByRole('heading', { name: /datasets/i });
    await expect(heading).toBeVisible();

    // Take screenshot
    await page.screenshot({
      path: 'test-results/benchmarking-datasets.png',
      fullPage: true,
    });
  });

  test('should display dataset details', async ({ page }) => {
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });

    // Navigate directly to datasets page
    await page.goto(`${FRONTEND_URL}/benchmarking/datasets`);
    await page.waitForLoadState('networkidle');

    // Click on first dataset
    const firstDataset = page.getByRole('link').first();
    await firstDataset.click();
    await page.waitForLoadState('networkidle');

    // Verify detail page
    const detailPage = page.getByText(/dataset id/i);
    await expect(detailPage).toBeVisible();
  });
});
```

## Next Steps

1. Copy the template above
2. Rename the describe block and test names
3. Add your navigation and assertions
4. Run the test: `npx playwright test tests/e2e/your-test.spec.ts`
5. Check `test-results/` for screenshots
6. Iterate until passing!

## Need Help?

- Check existing tests in `tests/e2e/` for examples
- Read [Playwright documentation](https://playwright.dev/docs/intro)
- Ask in the team chat or open an issue
