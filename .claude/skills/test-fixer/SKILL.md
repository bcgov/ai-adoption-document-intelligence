***
name: test-fixer
description: Runs Playwright tests one at a time from a folder, tracks progress, and fixes failures in both tests AND implementation code iteratively
allowed-tools: [Bash, Read, Glob, Grep, Edit, Write, mcp__playwright__*]
***

# Test Fixer - Progressive Test Runner & Fixer

Run Playwright tests one at a time from a specified folder, track progress, and fix failures automatically until all tests pass.

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
- [ ] dataset-list-create.spec.ts
- [x] results-metrics.spec.ts (✅ Passed)
- [ ] validation-errors.spec.ts (🔧 In Progress - Attempt 3/10)
- [x] baseline-ui-display.spec.ts (✅ Passed)

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

For each test file:

#### 2a. Update Progress: In Progress
Mark file as in progress:
```markdown
- [ ] dataset-list-create.spec.ts (🔧 In Progress - Attempt 1/10)
```

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

### 6. Re-run Test

Follow this iterative process:

1. **Run failing test**: `npm run test:file path/to/test.spec.ts` (DB auto-resets)
2. **Identify root cause** from error message and test output
3. **Apply fix** (update test, add seed data, fix implementation, etc.)
4. **Increment attempt** in progress file
5. **Re-run test** to verify fix

## Critical Rules for Corrections

1. **ALWAYS** check requirements.md and user stories BEFORE making any fix
2. **FIX IMPLEMENTATION** when it doesn't match requirements - don't just change the test
3. **FIX TEST** when the test expectation is incorrect or outdated
4. **NEVER** make a test pass by removing assertions or changing expectations without verifying requirements
5. When fixing implementation code, ensure the fix aligns with requirements and user stories
6. Document non-obvious fixes with comments explaining the requirement being satisfied
7. **UPDATE PROGRESS FILE** after each attempt/completion


## Debugging Tips Integration

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

## Example Workflow

```bash
# User invokes skill
/test-fixer benchmarking feature-docs/003-benchmarking-system/

# Skill execution:
# 1. Find test files in tests/e2e/benchmarking/
# 2. Create/read progress tracking file
# 3. For each test file (in alphabetical order):
#    a. Mark as in progress
#    b. Run: npm run test:file tests/e2e/benchmarking/[filename]
#    c. If fails: analyze, fix, re-run (up to 10 times)
#    d. Update progress: passed or failed
```
