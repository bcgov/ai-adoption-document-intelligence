# Playwright Workflow Configuration

## Directory Structure
```
project-root/
├── feature-docs/
│   ├── 001-graph-workflows/
│   │   ├── requirements.md
│   │   ├── user-stories/
│   │   │   ├── US-001.md
│   │   │   └── US-002.md
│   │   └── playwright/
│   │       ├── test-plans.md
│   │       ├── *.page-doc.md
│   │       ├── *.selectors.md
│   │       ├── screenshots/
│   │       ├── healing-log.md
│   │       └── test-results.md
│   ├── 002-better-template-labelling/
│   │   └── ...
│   └── 003-benchmarking-system/
│       └── ...
├── tests/
│   └── e2e/
│       ├── graph-workflows/
│       │   ├── create-workflow.spec.ts
│       │   └── execute-workflow.spec.ts
│       ├── benchmarking/
│       │   ├── create-benchmark.spec.ts
│       │   └── view-results.spec.ts
│       ├── pages/
│       │   ├── WorkflowPage.ts
│       │   └── BenchmarkPage.ts
│       └── helpers/
│           └── auth.ts
└── playwright.config.ts
```

## Application Settings
- **Frontend URL**: `http://localhost:3000` (override with `FRONTEND_URL` env var)
- **Backend URL**: `http://localhost:3002` (override with `BACKEND_URL` env var)
- **Test API Key**: Required in `TEST_API_KEY` environment variable

## Authentication Requirements
All tests MUST use the authentication helper from `tests/e2e/helpers/auth.ts`:

```typescript
import { setupAuthenticatedTest } from '../helpers/auth';

await setupAuthenticatedTest(page, {
  apiKey: TEST_API_KEY!,
  backendUrl: BACKEND_URL,
  frontendUrl: FRONTEND_URL,
});
```

This handles both:
1. **Backend API authentication** - Adds `x-api-key` header to all requests
2. **Frontend auth bypass** - Injects mock SSO tokens into localStorage

## Standards

### TypeScript & Testing
- Use TypeScript for all test files
- Follow Page Object Model pattern
- One test file per user flow
- Group related tests in `describe` blocks
- Use `data-testid` attributes where possible
- Always include requirement traceability comments

### Test Structure
```typescript
test.describe('Feature Name', () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
  const TEST_API_KEY = process.env.TEST_API_KEY;

  test.beforeAll(() => {
    if (!TEST_API_KEY) {
      throw new Error('TEST_API_KEY environment variable is not set');
    }
  });

  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedTest(page, {
      apiKey: TEST_API_KEY!,
      backendUrl: BACKEND_URL,
      frontendUrl: FRONTEND_URL,
    });
  });

  test('should do something', async ({ page }) => {
    // Given: [Initial state]
    // When: [User action]
    // Then: [Expected outcome]
  });
});
```

### Selectors Priority
1. **Preferred**: `data-testid` attributes
2. **Good**: Semantic selectors (role, label, text)
3. **Acceptable**: ARIA labels
4. **Last resort**: CSS selectors

### File Naming
- Test files: `{feature-name}-{scenario}.spec.ts`
- Page objects: `{PageName}Page.ts`
- All in PascalCase for classes, kebab-case for files

## Workflow Usage

### Step 1: Generate Test Plans
```bash
# Use the test-planner skill
/test-planner feature-docs/003-benchmarking-system/
```
This creates `feature-docs/003-benchmarking-system/playwright/test-plans.md`

### Step 2: Explore Application
```bash
# Use the playwright-explorer skill
/playwright-explorer feature-docs/003-benchmarking-system/
```
This creates:
- `*.page-doc.md` files (human-readable page documentation)
- `*.selectors.md` files (machine-readable selector lists)
- Screenshots in `screenshots/` directory

### Step 3: Generate Tests
```bash
# Use the test-generator skill
/test-generator feature-docs/003-benchmarking-system/
```
This creates:
- Test files in `tests/e2e/{feature-name}/`
- Page Object Models in `tests/e2e/pages/`

### Step 4: Heal Failing Tests
```bash
# Use the test-healer skill
/test-healer tests/e2e/benchmarking/ feature-docs/003-benchmarking-system/
```
This:
- Runs tests iteratively
- Fixes failures by consulting requirements.md
- Documents all changes in healing-log.md
- Flags requirements mismatches

## Requirements-Driven Testing

**CRITICAL PRINCIPLE**: Tests are derived from requirements, not application behavior.

### The Golden Rule
1. ✅ **DO**: Write tests that match `requirements.md`
2. ❌ **DON'T**: Change tests to match incorrect application behavior
3. ⚠️ **IF MISMATCH**: Document it and keep test failing

### Verification Process
When writing or fixing tests:
1. Read the relevant section in `requirements.md`
2. Cross-reference with user stories in `user-stories/`
3. Implement test to verify requirements
4. If application doesn't match requirements, **flag the discrepancy**

### Example Flow
```
requirements.md says: "Submit button must have data-testid='submit-form'"
Application has: <button type="submit">Submit</button>

CORRECT ACTION:
- Keep test using data-testid='submit-form'
- Document mismatch in healing-log.md
- Report to team that application needs to be fixed

INCORRECT ACTION:
- Change test to use button[type="submit"] ❌
```

## Running Tests

### Development
```bash
# Run specific test file
npx playwright test tests/e2e/benchmarking/create-benchmark.spec.ts

# Run in watch mode
npx playwright test tests/e2e/benchmarking/create-benchmark.spec.ts --watch

# Run in UI mode (interactive)
npx playwright test tests/e2e/benchmarking/create-benchmark.spec.ts --ui

# Run in headed mode (see browser)
npx playwright test tests/e2e/benchmarking/create-benchmark.spec.ts --headed
```

### Debugging
```bash
# Run with Playwright inspector
npx playwright test --debug tests/e2e/benchmarking/create-benchmark.spec.ts

# Generate trace
npx playwright test --trace on tests/e2e/benchmarking/create-benchmark.spec.ts

# View trace
npx playwright show-trace trace.zip
```

## Best Practices Summary

### ✅ DO
- Use `setupAuthenticatedTest` helper for consistency
- Wait for `networkidle` after navigation
- Use `.first()` when multiple elements match
- Take screenshots for visual verification
- Use semantic selectors (role, label, text) over CSS
- Make tests independent (don't rely on test order)
- Include Given/When/Then comments
- Add requirement traceability comments
- Consult requirements.md before making any assertion

### ❌ DON'T
- Hardcode URLs (use environment variables)
- Test without API key setup (backend will return 403)
- Forget to wait for loading states
- Use `page.locator('#id')` unless necessary
- Commit test screenshots to git
- Change test expectations without checking requirements
- Make tests pass by matching incorrect application behavior
