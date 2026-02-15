# Quick Start - Automated Playwright Testing

Get started with automated test generation in 4 simple steps.

## Prerequisites

1. **Application running**:
   ```bash
   npm run dev
   ```

2. **Test API key configured**:
   ```bash
   npm run setup:test-api-key
   ```

3. **Environment variables set** (in `apps/backend-services/.env`):
   ```
   TEST_API_KEY=your-test-api-key
   BACKEND_URL=http://localhost:3002
   FRONTEND_URL=http://localhost:3000
   ```

## The 4-Step Workflow

### Step 1: Plan 📋
```
/test-planner feature-docs/003-benchmarking-system/
```
**What it does**: Reads `requirements.md` and `user-stories/` to create test scenarios
**Output**: `feature-docs/003-benchmarking-system/playwright/test-plans.md`

### Step 2: Explore 🔍
```
/playwright-explorer feature-docs/003-benchmarking-system/
```
**What it does**: Opens the app in Playwright, documents pages and selectors
**Output**:
- `*.page-doc.md` files with page documentation
- `*.selectors.md` files with element selectors
- Screenshots in `screenshots/` directory

### Step 3: Generate 🤖
```
/test-generator feature-docs/003-benchmarking-system/
```
**What it does**: Creates test code from plans and exploration data
**Output**:
- Test files in `tests/e2e/benchmarking/*.spec.ts`
- Page Objects in `tests/e2e/pages/*Page.ts`

### Step 4: Heal 🔧
```
/test-healer tests/e2e/benchmarking/ feature-docs/003-benchmarking-system/
```
**What it does**: Runs tests, automatically fixes failures by consulting requirements
**Output**:
- Fixed test code
- `healing-log.md` with all changes documented
- `test-results.md` with summary

## Example: Complete Flow for Benchmarking

```bash
# Start your app
npm run dev

# Generate all tests for benchmarking feature
/test-planner feature-docs/003-benchmarking-system/
/playwright-explorer feature-docs/003-benchmarking-system/
/test-generator feature-docs/003-benchmarking-system/
/test-healer tests/e2e/benchmarking/ feature-docs/003-benchmarking-system/

# Review results
cat feature-docs/003-benchmarking-system/playwright/test-results.md
```

## What Gets Created

```
feature-docs/003-benchmarking-system/
└── playwright/
    ├── test-plans.md          # Step 1 output
    ├── datasets.page-doc.md   # Step 2 output
    ├── datasets.selectors.md  # Step 2 output
    ├── screenshots/           # Step 2 output
    ├── healing-log.md         # Step 4 output
    └── test-results.md        # Step 4 output

tests/e2e/
├── benchmarking/
│   └── datasets.spec.ts       # Step 3 output
└── pages/
    └── DatasetsPage.ts        # Step 3 output
```

## Key Concepts

### Tests Are Based on Requirements
- ✅ Tests verify what `requirements.md` says should happen
- ❌ Tests don't just check current app behavior
- ⚠️ If app doesn't match requirements, test fails (by design)

### Auto-Healing is Smart
When a test fails, `/test-healer`:
1. Reads `requirements.md` to understand expected behavior
2. Inspects the actual app with Playwright
3. Determines who is wrong: test or app
4. If test is wrong → fixes it
5. If app is wrong → documents the issue, keeps test failing

### Authentication is Automatic
Every generated test includes:
```typescript
await setupAuthenticatedTest(page, {
  apiKey: TEST_API_KEY!,
  backendUrl: BACKEND_URL,
  frontendUrl: FRONTEND_URL,
});
```
No need to worry about auth setup - it's handled automatically.

## Running Your Generated Tests

```bash
# Run all benchmarking tests
npx playwright test tests/e2e/benchmarking/

# Run in UI mode (interactive)
npx playwright test tests/e2e/benchmarking/ --ui

# Run with browser visible
npx playwright test tests/e2e/benchmarking/ --headed

# Debug mode
npx playwright test tests/e2e/benchmarking/ --debug
```

## Troubleshooting

### "Skill not found"
Use the correct syntax with forward slash:
```
/test-planner feature-docs/003-benchmarking-system/
```

### "TEST_API_KEY not set"
Run the setup script:
```bash
npm run setup:test-api-key
```

### "Cannot connect to application"
Make sure the app is running:
```bash
npm run dev
```

### Tests fail after generation
This is normal! Run the healer:
```bash
/test-healer tests/e2e/benchmarking/ feature-docs/003-benchmarking-system/
```

## Next Steps

1. **Try it**: Run the 4 steps for the benchmarking feature
2. **Review**: Check the generated files
3. **Iterate**: Use `/test-healer` to refine the tests
4. **Expand**: Apply to other features (graph-workflows, template-labelling)

## Documentation

- [Complete Setup Guide](./AUTOMATED_WORKFLOW_SETUP.md) - Full documentation
- [Manual Test Writing](./WRITING_TESTS.md) - Write tests by hand
- [Workflow Configuration](../../.claude/skills/config/playwright-workflow.md) - Settings and standards

## Tips

💡 **Start small**: Begin with one feature to learn the workflow
💡 **Review outputs**: Check each step's output before proceeding
💡 **Trust the healer**: It consults requirements before making changes
💡 **Document issues**: Healing logs help track application vs. requirements mismatches
💡 **Iterate**: Re-run steps as your feature evolves
