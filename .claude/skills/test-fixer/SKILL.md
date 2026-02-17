***
name: test-fixer
description: Runs Playwright tests one at a time from a folder, tracks progress, and fixes failures in both tests AND implementation code iteratively
allowed-tools: [Bash, Read, Glob, Grep, Edit, Write, mcp__playwright__*]
***

# Test Fixer - Progressive Test Runner & Fixer

Run Playwright tests one at a time from a specified folder, track progress, and fix failures automatically until all tests pass. Only run one test file. Do not automatically proceed to the next test file (user will resume the next step manually on their own). Commit all changes after each test file is completed with `--no-verify` flag. Run only `git add .` and `git commit` commands for git operations. Do not run any other git commands.

**Purpose**: Fix BOTH test code and implementation code to make tests pass while adhering to requirements.

## Input
- Test folder name (e.g., `benchmarking` for `tests/e2e/benchmarking/`)
- Feature directory for documentation (e.g., `feature-docs/003-benchmarking-system/`)

## Example Usage
```
/test-fixer benchmarking feature-docs/003-benchmarking-system/
```

This will:
1. Find all `*.spec.ts` files in `tests/e2e/benchmarking/`
2. Create/update progress tracking file
3. Run each test one at a time
4. Fix failures iteratively
5. Track progress with checkboxes

## Progress Tracking

### Tracking File Location
`{feature-dir}/playwright/test-fixer-progress.md`

Example: `feature-docs/003-benchmarking-system/playwright/test-fixer-progress.md`

### Tracking File Format
```markdown
# Test Fixer Progress

## Test Files
- [x] results-metrics.spec.ts (✅ Passed)
- [x] baseline-ui-display.spec.ts (✅ Passed)
- [ ] dataset-list-create.spec.ts (⏭️ Has skipped tests)
- [ ] validation-errors.spec.ts

```

## Database Management

**IMPORTANT**: Tests automatically reset the database via Playwright's `globalSetup`.

### Available Scripts
```bash
# Run a specific test file (auto-resets DB via globalSetup)
npm run test:file tests/e2e/benchmarking/dataset-list-create.spec.ts

# Run all tests in a directory (auto-resets DB via globalSetup)
npm run test:dir tests/e2e/benchmarking

# Manual database reset (rarely needed)
npm run test:db:reset
```

The `globalSetup` in `playwright.config.ts` automatically runs:
```bash
cd apps/backend-services &&
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="yes"
npx prisma migrate reset --force &&
npm run db:seed
```

Note: the seed file is at apps/shared/prisma/seed.ts

## Backend Logging

**On API failures (4xx/5xx)**: Read `apps/backend-services/backend.log` for error details and stack traces.

```bash
tail -n 50 apps/backend-services/backend.log
```

## Process

### 1. Initialize Progress Tracking

**First time or if tracking file doesn't exist:**
1. Find all `*.spec.ts` files in `tests/e2e/{folder}/`
2. Create tracking file at `{feature-dir}/playwright/test-fixer-progress.md`
3. List all test files with `[ ]` checkboxes

**If tracking file exists:**
1. Read existing progress
2. Resume from first unchecked file

### 2. Test Iteration Loop (Per File)


NOTE: if the backend is returning an error, return the error from the API (put code in try-catch) and read the error message to understand what is missing. Clean up after. You call a specific endpoint like this:

`curl -s -H "x-api-key: 69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY" http://localhost:3002/api...`


**Your job**: Implement whatever is needed to make the test pass legitimately.

#### 2b. Run Test
```bash
npm run test:file tests/e2e/benchmarking/dataset-list-create.spec.ts
```

**Note**: Database is automatically reset by globalSetup before tests run.

#### 2c. Analyze Result

**If test passes:**
- Mark as passed: `[x] dataset-list-create.spec.ts (✅ Passed)`
- Move to next file

**If test fails:**
- Analyze failure (see section 3)
- Apply fixes (see section 4)
- Re-run test
- Increment attempt counter

### 3. Analyze Failures

Parse test output for:
- Selector not found errors
- Timeout errors
- Assertion failures
- Navigation issues
- Authentication errors
- Missing test data
- Missing API endpoints (404, 500 errors)
- Database constraint violations
- Missing UI components or routes

**API Failure Protocol**: On 4xx/5xx errors, read backend log (`tail -n 50 apps/backend-services/backend.log`), identify root cause, fix backend implementation per requirements, then re-run test.

### 4. Apply Fixes

**CRITICAL**: Before applying any fix, consult these sources in order:

1. **First Priority**: Read `{feature-dir}/requirements.md`
   - Verify what the EXPECTED behavior should be
   - This is the source of truth for correct behavior

2. **Second Priority**: Read relevant files in `{feature-dir}/user-stories/`
   - Check acceptance criteria
   - Verify user story expectations
   - Understand the intended user flow

3. **Third Priority**: Explore the actual page behavior
   - Use Playwright MCP to inspect the current page
   - Compare actual vs. expected behavior from requirements

**Decision Tree: What to Fix?**

```
Test fails → Check requirements
    ↓
Does implementation match requirements?
    ├─ NO → FIX IMPLEMENTATION CODE (app, backend, frontend)
    │        Then re-run test
    ↓
    └─ YES → Does test expect correct behavior per requirements?
               ├─ NO → FIX TEST CODE
               └─ YES → FIX TEST SYNCHRONIZATION (waits, selectors)
```

### 5. Identify Files to Fix

When fixing implementation (not just tests):
- **Frontend**: Components in `apps/frontend/src/`
- **Backend**: Controllers, services in `apps/backend-services/src/`
- **Temporal**: Workflows, activities in `apps/temporal/src/`
- **Page Objects**: Test helpers in `tests/e2e/pages/`
- **Test Code**: The actual test files in `tests/e2e/`

Read the relevant implementation files and modify them to match requirements.

### 6. Implementing Missing Features

When a test is failing due to missing implementation, follow this systematic approach:

#### Step 1: Understand Requirements
1. Read `{feature-dir}/requirements.md` thoroughly
2. Read relevant user stories in `{feature-dir}/user-stories/`
3. Understand the full feature scope and acceptance criteria

#### Step 2: Identify Missing Pieces
Analyze what the test expects and determine what's missing:
- **Database**: Missing tables, columns, or relationships?
- **Backend**: Missing API endpoints, services, or validation?
- **Frontend**: Missing UI components, forms, or pages?
- **Integration**: Missing data flow between layers?

#### Step 3: Implement Bottom-Up (Database → Backend → Frontend)

**Database Layer (if needed):**
1. Update Prisma schema in `apps/shared/prisma/schema.prisma`
2. Create migration: `cd apps/backend-services && npx prisma migrate dev --name feature_name`
3. Run `npm run db:generate` from `apps/backend-services`
4. Update seed data if needed in `apps/backend-services/prisma/seed.ts`. When updating the seed data, check any other tests that may get affected by the change and update them accordingly.

**Backend Layer (if needed):**
1. Create/update DTOs in `apps/backend-services/src/*/dto/`
2. Create/update services in `apps/backend-services/src/*/services/`
3. Create/update controllers in `apps/backend-services/src/*/controllers/`
4. **Create/update tests** in `apps/backend-services/src/*/*.spec.ts`
5. Run backend tests: `cd apps/backend-services && npm test`

**Frontend Layer (if needed):**
1. Create/update API client calls
2. Create/update React components in `apps/frontend/src/components/`
3. Create/update pages in `apps/frontend/src/pages/`
4. Update routing if needed
5. Ensure proper TypeScript types

#### Step 4: Verify Integration
1. Start the full stack locally if needed
2. Manually test the feature flow
3. Verify the E2E test can now run

**IMPORTANT**: Do NOT skip this test again. The goal is to make it pass legitimately.

### 7. Re-run Test

Follow this iterative process:

1. **Run test**: `npm run test:file path/to/test.spec.ts` (DB auto-resets)
2. **If it fails**, identify root cause from error message and test output
3. **Apply fix** (implement missing features, update test, add seed data, fix implementation, etc.)
4. **Increment attempt** in progress file
5. **Re-run test** to verify fix
6. **Repeat until test passes** (up to 10 attempts per test file)

## Critical Rules for Corrections

1. **ALWAYS** check requirements.md and user stories BEFORE making any fix
2. **FIX IMPLEMENTATION** when it doesn't match requirements - don't just change the test
3. **FIX TEST** when the test expectation is incorrect or outdated
4. **NEVER** make a test pass by removing assertions or changing expectations without verifying requirements
7. When fixing implementation code, ensure the fix aligns with requirements and user stories
8. When implementing missing features, follow the full implementation stack (DB → Backend → Frontend)
9. Document non-obvious fixes with comments explaining the requirement being satisfied
10. **UPDATE PROGRESS FILE** after each attempt/completion


## Debugging Tips Integration

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

When tests fail, progressively add debugging:

### 1. Log Network Requests
```typescript
page.on('request', request => {
  console.log('>>', request.method(), request.url());
});

page.on('response', response => {
  console.log('<<', response.status(), response.url());
});
```

### 2. Check for API Errors
```typescript
page.on('response', response => {
  if (response.status() >= 400) {
    console.error('API Error:', response.status(), response.url());
  }
});
```

**On API errors**: Read backend log with `tail -n 50 apps/backend-services/backend.log` to see error stack traces and fix root cause.

### Other
- Add console logging code to front end, read it with playwright mcp to see what is going on. Clean up after

## Example Workflow

```bash
# User invokes skill
/test-fixer benchmarking feature-docs/003-benchmarking-system/

# Skill execution:
# 1. Find test files in tests/e2e/benchmarking/
# 2. Create/read progress tracking file
# 3. For each test file (in alphabetical order):
#    a. Mark as in progress
#    b. Check for .skip() directives - remove if found
#    c. If missing implementation, implement missing features per requirements
#    d. Run: npm run test:file tests/e2e/benchmarking/[filename]
#    e. If fails: analyze, fix, re-run (up to 10 times)
#    f. Update progress: passed or failed
```
