# Playwright Testing Guide

Complete guide for running and managing E2E tests in the AI OCR application.

## Quick Start

```bash
# 1. Start the application
npm run dev

# 2. Run tests (automatically resets database before running)
npm run test:e2e
```

That's it! The database is automatically reset with seed data before every test run.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Running Tests](#running-tests)
- [Database Management](#database-management)
- [Test Structure](#test-structure)
- [Debugging Tests](#debugging-tests)
- [Automated Testing Workflow](#automated-testing-workflow)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### 1. Application Running

Both backend and frontend must be running:

```bash
npm run dev
```

This starts:
- Backend API: `http://localhost:3002`
- Frontend: `http://localhost:3000`

### 2. Environment Variables

Optional variables in `apps/backend-services/.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/ai_ocr
BACKEND_URL=http://localhost:3000  # Optional, defaults shown
FRONTEND_URL=http://localhost:3002  # Optional, defaults shown
TEST_API_KEY=69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY  # Optional, has default
```

The `TEST_API_KEY` is hardcoded to match the seed file and doesn't need to be set manually.

## Running Tests

### All Tests (Recommended)

```bash
# Run all E2E tests (automatically resets database first)
npm run test:e2e
```

**Note:** ALL test commands (both `npm run` and `npx playwright test`) automatically reset the database before running, ensuring a clean, predictable state.

### Specific Tests

```bash
# All of these reset the database first:
npm run test:file tests/e2e/benchmarking/dataset-list-create.spec.ts
npm run test:dir tests/e2e/benchmarking
npx playwright test tests/e2e/benchmarking/dataset-list-create.spec.ts
npx playwright test tests/e2e/benchmarking
npx playwright test -g "dataset"
```

### Interactive Modes

```bash
# All of these also reset the database first:
npm run test:e2e:ui                       # UI mode (npm script)
npx playwright test --ui                  # UI mode (direct)
npx playwright test --headed              # See browser while tests run
npx playwright test --debug               # Step-through debugging
```

## Database Management

### Automatic Reset

The database is **automatically reset** before every test run (including `npx playwright test`). This ensures:
- ✅ Clean, predictable state
- ✅ No data pollution between runs
- ✅ Consistent seed data
- ✅ No manual setup required

**How it works:** Playwright's `globalSetup` runs the database reset before any tests execute.

### Manual Reset

You can manually reset the database if needed:

```bash
npm run test:db:reset
```

**⚠️ Warning**: This command:
- Deletes all data in your database
- Runs all migrations
- Seeds the database with test data (including test API key)

### What Gets Seeded

The seed script (`apps/shared/prisma/seed.ts`) creates:
- Test API key for authentication
- Sample labeling project (SDPR monthly report template)
- Benchmarking datasets (invoices, receipts, forms)
- Dataset versions and splits
- Benchmark runs (completed, running, failed, passing, regressed)
- Test artifacts

See [apps/shared/prisma/seed.ts](../apps/shared/prisma/seed.ts) for complete seed data.

## Test Structure

### Directory Layout

```
tests/
├── TESTING_GUIDE.md              # This file - complete testing guide
├── WRITING_TESTS.md              # Guide for writing new tests
├── e2e/
│   ├── helpers/
│   │   └── auth.ts              # Authentication helpers
│   ├── pages/
│   │   └── DatasetsListPage.ts  # Page Object Models
│   ├── benchmarking/             # Feature-specific tests
│   │   ├── dataset-list-create.spec.ts
│   │   └── results-metrics.spec.ts
│   └── api-key-auth.spec.ts     # General tests
├── test-results/                 # Screenshots (gitignored)
└── playwright-report/            # HTML reports (gitignored)
```

### Test Files

Tests follow the naming convention: `{feature-name}.spec.ts`

Each test includes:
- Requirements traceability (REQ-XXX comments)
- User story references (US-XXX)
- Given/When/Then structure
- Authentication setup
- Page Object Models where appropriate

## Debugging Tests

### Take Screenshots

Screenshots are automatically saved to `test-results/` on failure, or you can add them manually:

```typescript
await page.screenshot({
  path: 'test-results/debug-step.png',
  fullPage: true
});
```

### Run Single Test

```bash
# Run just one test from a file
npm run test:file tests/e2e/benchmarking/dataset-list-create.spec.ts -- -g "should display dataset list"
```

### View Test in Browser

```bash
# See the browser while tests run
npm run test:e2e:headed

# Or with slowdown for better visibility
npx playwright test --headed --slowmo=500
```

### Debugging Tools

```bash
# Playwright Inspector (step-through debugger)
npm run test:e2e:debug

# View HTML report from last run
npx playwright show-report

# Trace viewer (requires trace: 'on' in config)
npx playwright show-trace trace.zip
```

### Console Logs

Add logging in tests:

```typescript
page.on('console', msg => console.log('Browser:', msg.text()));
page.on('response', res => console.log('Response:', res.status(), res.url()));
```

## Automated Testing Workflow

We have an automated workflow for generating and maintaining tests using Claude Code skills. This is optional but powerful for comprehensive test coverage.

### Four-Step Workflow

```bash
# 1. Generate test plans from requirements
/test-planner feature-docs/003-benchmarking-system/

# 2. Explore the application and document pages
/playwright-explorer feature-docs/003-benchmarking-system/

# 3. Generate test code
/test-generator feature-docs/003-benchmarking-system/

# 4. Run and auto-heal tests
/test-healer tests/e2e/benchmarking/ feature-docs/003-benchmarking-system/
```

**See [e2e/AUTOMATED_WORKFLOW_SETUP.md](e2e/AUTOMATED_WORKFLOW_SETUP.md) for detailed automation workflow documentation.**

**See [WRITING_TESTS.md](WRITING_TESTS.md) for manual test writing guide.**

## Authentication

All tests use a unified authentication pattern that handles both frontend and backend auth:

```typescript
await setupAuthenticatedTest(page, {
  apiKey: TEST_API_KEY!,
  backendUrl: BACKEND_URL,
  frontendUrl: FRONTEND_URL,
});
```

This helper:
1. Sets up request interception to add `x-api-key` header to backend requests
2. Injects mock auth tokens into localStorage (bypasses SSO)
3. Navigates to the frontend and waits for the app to load

The test API key is automatically seeded and matches the default in the seed file.

## Configuration

Configuration is in [playwright.config.ts](../playwright.config.ts) at the repository root.

Key settings:
- **testDir**: `./tests/e2e`
- **fullyParallel**: `true` (tests run in parallel)
- **retries**: `0` locally, `2` in CI
- **reporter**: `html`
- **Environment variables**: Loaded from `apps/backend-services/.env`
- **TEST_API_KEY**: Hardcoded default matching seed file

## Troubleshooting

### Database Connection Errors

**Problem**: Tests can't connect to database.

**Solutions**:
1. Check PostgreSQL is running: `pg_isready`
2. Verify `DATABASE_URL` in `apps/backend-services/.env`
3. Manually reset: `npm run test:db:reset`

### Tests Timeout

**Problem**: Tests timeout waiting for pages to load.

**Solutions**:
1. Ensure backend and frontend are running: `npm run dev`
2. Check URLs are correct in `.env`
3. Increase timeout in specific test: `test.setTimeout(60000)`

### Database Reset Fails

**Problem**: `npm run test:db:reset` fails with permission errors.

**Solution**: The command sets `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes"` automatically. If it still fails, check database permissions.

### Tests Pass Locally but Fail in CI

**Possible causes**:
1. Database not reset in CI (ensure CI runs `npm run test:e2e`, not `npx playwright test`)
2. Timing issues (CI may be slower, add appropriate waits)
3. Environment variables not set in CI
4. Parallel execution causing conflicts (reduce workers in CI)

### Element Not Found Errors

**Problem**: Test can't find an element on the page.

**Debug steps**:
1. Take a screenshot to see page state
2. Check if page fully loaded: `await page.waitForLoadState('networkidle')`
3. Verify element selector is correct
4. Check if element is behind a navigation item that needs to be clicked first

### Flaky Tests

**Problem**: Tests sometimes pass, sometimes fail.

**Common causes and fixes**:
1. **Race conditions**: Add explicit waits
   ```typescript
   await expect(element).toBeVisible();
   await page.waitForLoadState('networkidle');
   ```
2. **Timing issues**: Use Playwright's auto-waiting instead of manual timeouts
3. **Test isolation**: Tests should be independent (automatic DB reset helps)
4. **Database state**: Use `npm run test:e2e` to ensure clean state

## Best Practices

### ✅ DO

- Use `npm run test:e2e` to automatically reset database before tests
- Use Page Object Models for complex pages
- Wait for `networkidle` after navigation
- Use semantic selectors (role, label, text) over CSS selectors
- Take screenshots for debugging
- Make tests independent of each other

### ❌ DON'T

- Don't commit `test-results/` or `playwright-report/` to git
- Don't run `test:db:reset` on production database
- Don't hardcode URLs (use environment variables)
- Don't skip authentication setup
- Don't use brittle CSS selectors like `.class-name-123`
- Don't make tests depend on execution order

## Additional Resources

- [WRITING_TESTS.md](WRITING_TESTS.md) - Detailed guide for writing new tests
- [e2e/AUTOMATED_WORKFLOW_SETUP.md](e2e/AUTOMATED_WORKFLOW_SETUP.md) - Automated test generation workflow
- [Playwright Documentation](https://playwright.dev/docs/intro) - Official Playwright docs
- [tests/e2e/](e2e/) - Example test files

## Quick Reference: Common Commands

```bash
# Run tests (auto-resets DB)
npm run test:e2e               # Run all tests
npm run test:e2e:ui            # Interactive UI mode
npm run test:file <path>       # Run specific file
npm run test:dir <path>        # Run directory

# Advanced options (no DB reset, use npx directly)
npx playwright test --headed              # With visible browser
npx playwright test --debug               # Debug mode
npx playwright test -g "pattern"          # Match pattern
npx playwright test <path>                # Fast iteration (no reset)

# Database management
npm run test:db:reset          # Manual database reset (⚠️ deletes data)

# Reports
npx playwright show-report     # View HTML report
```

## CI/CD Integration

For CI/CD pipelines, simply run:

```yaml
- run: npm run test:e2e
```

This automatically:
1. Resets the database
2. Seeds test data
3. Runs all tests
4. Generates HTML report

No additional setup steps required!
