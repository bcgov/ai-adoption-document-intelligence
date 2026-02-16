***
name: test-healer
description: Runs Playwright tests and automatically fixes failures in both tests AND implementation code iteratively
allowed-tools: [Bash, Read, Glob, Grep, Edit, Write, mcp__playwright__*]
***

# Test Healer - Self-Healing Test Runner

Run Playwright tests iteratively and fix failures automatically until all tests pass or max attempts reached.

**Purpose**: Fix BOTH test code and implementation code to make tests pass while adhering to requirements.

## Input
- Feature directory for documentation (e.g., `feature-docs/003-benchmarking-system/`)
- Max attempts per test (default: 10)

## Process

### Iteration Loop
Run all Playwright tests and fix failures:

#### 1. Run All Tests
```bash
npx playwright test --reporter=list
```

#### 2. Analyze Failures
Parse test output for:
- Selector not found errors
- Timeout errors
- Assertion failures
- Navigation issues

#### 3. Apply Fixes

**CRITICAL**: Before applying any fix, consult these sources in order:

1. **First Priority**: Read `{feature-dir}/REQUIREMENTS.md`
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

**Common Fix Patterns**:

| Error Type | Investigation Steps | Fix Strategy |
|------------|---------------------|--------------|
| **Locator not found** | 1. Check REQUIREMENTS.md for expected element<br>2. Re-explore page with Playwright MCP<br>3. Find actual selector | If element should exist per requirements but doesn't: fix implementation<br>If selector is outdated: update test & Page Object |
| **Assertion failed** | 1. Read REQUIREMENTS.md for expected value<br>2. Read user-stories for acceptance criteria<br>3. Verify which is correct: test or app | If requirements say X but app shows Y: fix the implementation to match requirements<br>If test expectation is wrong: fix the test |
| **Timeout exceeded** | 1. Check requirements for async operations<br>2. Explore page for loading states | If app is slow: investigate and fix performance issue<br>If test timing is wrong: add explicit waitFor or increase timeout |
| **Navigation failed** | 1. Check requirements for navigation flow<br>2. Verify URL patterns in user stories | If navigation is broken: fix implementation routing<br>If test navigation is incorrect: add waitForLoadState('networkidle') |
| **Element not visible** | 1. Check requirements for UI state<br>2. Explore page for conditional rendering | If element should be visible per requirements: fix implementation<br>If test timing is wrong: add waitFor({ state: 'visible' }) |
| **Element detached** | 1. Review requirements for dynamic content | If DOM manipulation is buggy: fix implementation<br>If test needs better synchronization: use waitForSelector before interaction |

#### 4. Identify Files to Fix

When fixing implementation (not just tests):
- **Frontend**: Components in `apps/frontend/src/`
- **Backend**: Controllers, services in `apps/backend-services/src/`
- **Temporal**: Workflows, activities in `apps/temporal/src/`
- **Page Objects**: Test helpers in `tests/e2e/pages/`
- **Test Code**: The actual test files in `tests/e2e/`

Read the relevant implementation files and modify them to match requirements.

#### 5. Re-run Test
Continue until test passes or max attempts reached.


## Exit Conditions
- ✅ **All tests passing**: Success
- ❌ **Max attempts reached**: Report unfixable tests with details
- ⚠️ **Critical error**: Stop and report

## Critical Rules for Corrections

1. **ALWAYS** check REQUIREMENTS.md and user stories BEFORE making any fix
2. **FIX IMPLEMENTATION** when it doesn't match requirements - don't just change the test
3. **FIX TEST** when the test expectation is incorrect or outdated
4. **NEVER** make a test pass by removing assertions or changing expectations without verifying requirements
5. When fixing implementation code, ensure the fix aligns with requirements and user stories
6. Document non-obvious fixes with comments explaining the requirement being satisfied

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

These should be added temporarily during healing, then removed once issue is identified.
