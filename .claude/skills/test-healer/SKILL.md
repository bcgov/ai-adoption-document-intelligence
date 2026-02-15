***
name: test-healer
description: Runs Playwright tests and automatically fixes failures iteratively
allowed-tools: [Bash, Read, Glob, Grep, Edit, Write, mcp__playwright__*]
***

# Test Healer - Self-Healing Test Runner

Run Playwright tests iteratively and fix failures automatically until all tests pass or max attempts reached.

## Input
- Test file path or directory (e.g., `tests/e2e/benchmarking/`)
- Feature directory for documentation (e.g., `feature-docs/003-benchmarking-system/`)
- Max attempts per test (default: 3)

## Process

### Iteration Loop
For each test file:

#### 1. Run Test
```bash
npx playwright test {test-file} --headed --reporter=list
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

#### 4. Document Changes
Append to `{feature-dir}/playwright/healing-log.md`:

```markdown
## Healing Session: {timestamp}

### Test: {test-name}
**Attempt**: 2/3
**Error**: TimeoutError: Locator 'button[type="submit"]' not found

**Investigation**:
1. ✅ Checked `requirements.md` - Section 3.2 states submit button should have `data-testid="submit-event"`
2. ✅ Verified in `user-stories/US-003.md` - Acceptance criteria confirms this selector
3. ✅ Explored page with Playwright - Found button has `data-testid="submit-event"`, not `type="submit"`

**Root Cause**: Test was using incorrect selector. Requirements clearly specify `data-testid="submit-event"`.

**Fix Applied**:
- Updated `EventCreationPage.submitButton` selector from `button[type="submit"]` to `button[data-testid="submit-event"]`
- Updated test to wait for button visibility before clicking
- Files modified: `tests/e2e/pages/EventCreationPage.ts`, `tests/e2e/benchmarking/create-event.spec.ts`

**Requirements Compliance**: ✅ Now matches requirement 3.2

**Result**: ✅ Test passed
```

#### 5. Handle Requirements Mismatches

If the actual application behavior doesn't match the requirements:

```markdown
## ⚠️ Requirements Mismatch Detected

### Test: {test-name}
**Expected (per requirements.md Section 2.3)**: Success toast should display "Event created successfully"
**Actual (in application)**: Toast displays "New event added"

**User Story Reference**: `user-stories/US-005.md` specifies exact message "Event created successfully"

**Action Taken**:
- ❌ Did NOT modify test to match incorrect behavior
- ✅ Documented mismatch in healing log
- ⚠️ Test remains FAILING until application is fixed to match requirements

**Recommendation**: Update application code to match requirements.md specification.
```

#### 6. Re-run Test
Continue until test passes or max attempts reached.

## Output

### Terminal Output
```
🔧 Healing Test Suite: tests/e2e/benchmarking/

Test: benchmarking/create-benchmark.spec.ts
  ❌ Attempt 1/3: Failed - Selector not found
  📖 Reading requirements.md for expected behavior...
  🔧 Fixing: Updated selector to match requirements (data-testid="create-btn")
  ✅ Attempt 2/3: Passed

Test: benchmarking/view-results.spec.ts
  ❌ Attempt 1/3: Failed - Timeout on navigation
  🔧 Fixing: Added networkidle wait
  ❌ Attempt 2/3: Failed - Assertion mismatch
  📖 Checking requirements.md Section 4.1...
  ⚠️ MISMATCH: App shows "Results" but requirements specify "Benchmark Results"
  ❌ Attempt 3/3: UNFIXABLE - Application does not match requirements

Summary:
✅ 1/2 tests passing
⚠️ 1/2 tests blocked by requirements mismatch
🔧 3 fixes applied
📝 Healing log: feature-docs/003-benchmarking-system/playwright/healing-log.md
```

### Healing Log Format
Each healing session is documented with:
- Timestamp
- Test name
- Attempt number
- Error details
- **Investigation process** (what was checked in requirements/user-stories)
- **Root cause analysis** (why the error occurred)
- Fix description
- **Requirements compliance check**
- Files modified
- Result status

## Exit Conditions
- ✅ **All tests passing**: Success
- ❌ **Max attempts reached**: Report unfixable tests
- ⚠️ **Requirements mismatch**: Document and flag for manual review
- ⚠️ **Critical error**: Stop and report

After completion, generate summary report in `{feature-dir}/playwright/test-results.md`

## Critical Rules for Corrections

1. **NEVER** modify a test expectation without first checking requirements.md
2. **ALWAYS** document which requirement section was consulted
3. **NEVER** make a test pass by changing it to match incorrect application behavior
4. If requirements and application disagree, **KEEP TEST FAILING** and document the mismatch
5. Include requirement IDs in all fix documentation
6. Cross-reference user stories to verify acceptance criteria

## Debugging Tips Integration

When tests fail, progressively add debugging:

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

These should be added temporarily during healing, then removed once issue is identified.
