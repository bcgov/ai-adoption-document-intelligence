***
name: test-healer
description: Runs Playwright tests and automatically fixes failures iteratively
allowed-tools: [Bash, Read, Glob, Grep, Edit, Write, mcp__playwright__*]
***

# Test Healer - Self-Healing Test Runner

Run Playwright tests iteratively and fix failures automatically until all tests pass or max attempts reached.

## Input
- Optional: Feature directory for documentation (e.g., `feature-docs/003-benchmarking-system/`)
- Max attempts per test (default: 10)

## Process

### Iteration Loop
Run all Playwright tests and fix failures:

#### 1. Run All Tests
```bash
npx playwright test --headed --reporter=list
```

#### 2. Analyze Failures
Parse test output for:
- Selector not found errors
- Timeout errors
- Assertion failures
- Navigation issues

#### 3. Apply Fixes

**CRITICAL**: Before applying any fix, consult these sources in order:

1. **First Priority**: Read `{feature-dir}/requirements.md`
   - Verify what the EXPECTED behavior should be
   - Check if the test expectation is correct
   - Confirm the feature specification

2. **Second Priority**: Read relevant files in `{feature-dir}/user-stories/`
   - Check acceptance criteria
   - Verify user story expectations
   - Understand the intended user flow

3. **Third Priority**: Explore the actual page behavior
   - Use Playwright MCP to inspect the current page
   - Compare actual vs. expected behavior from requirements
   - Document discrepancies

**Common Fix Patterns**:

| Error Type | Investigation Steps | Fix Strategy |
|------------|---------------------|--------------|
| **Locator not found** | 1. Check requirements.md for expected element<br>2. Re-explore page with Playwright MCP<br>3. Find actual selector | Update test & Page Object with correct selector |
| **Assertion failed** | 1. Read requirements.md for expected value<br>2. Read user-stories for acceptance criteria<br>3. Verify which is correct: test or app | If requirements say X but app shows Y, flag for clarification<br>If test expectation is wrong, fix the test |
| **Timeout exceeded** | 1. Check requirements for async operations<br>2. Explore page for loading states | Add explicit waitFor or increase timeout |
| **Navigation failed** | 1. Check requirements for navigation flow<br>2. Verify URL patterns in user stories | Add waitForLoadState('networkidle') |
| **Element not visible** | 1. Check requirements for UI state<br>2. Explore page for conditional rendering | Add waitFor({ state: 'visible' }) |
| **Element detached** | 1. Review requirements for dynamic content | Use waitForSelector before interaction |

#### 6. Re-run Test
Continue until test passes or max attempts reached.


## Exit Conditions
- ✅ **All tests passing**: Success
- ❌ **Max attempts reached**: Report unfixable tests
- ⚠️ **Requirements mismatch**: Document and flag for manual review
- ⚠️ **Critical error**: Stop and report

## Critical Rules for Corrections

1. **NEVER** modify a test expectation without first checking requirements.md
2. **ALWAYS** document which requirement section was consulted
3. **NEVER** make a test pass by changing it to match incorrect application behavior
4. If requirements and application disagree, **KEEP TEST FAILING** and document the mismatch
5. Include requirement IDs in all fix documentation
6. Cross-reference user stories to verify acceptance criteria

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
