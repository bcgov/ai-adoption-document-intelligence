# Automated Playwright Testing Workflow - Setup Complete ✅

This document describes the complete automated testing workflow that has been set up for your project.

## What Was Created

### 1. Directory Structure

```
.claude/skills/
├── test-planner/
│   └── SKILL.md              # Skill: Generate test plans from requirements
├── playwright-explorer/
│   └── SKILL.md              # Skill: Explore app and document pages
├── test-generator/
│   └── SKILL.md              # Skill: Generate test code
├── test-healer/
│   └── SKILL.md              # Skill: Run and auto-fix tests
└── config/
    └── playwright-workflow.md # Configuration and standards

tests/e2e/
├── pages/                    # Page Object Models (auto-generated)
│   └── README.md            # POM documentation
├── helpers/
│   └── auth.ts              # Existing auth helpers
├── WRITING_TESTS.md         # Manual test writing guide
├── README.md                # Updated with workflow info
└── AUTOMATED_WORKFLOW_SETUP.md  # This file

feature-docs/
├── 001-graph-workflows/
│   └── playwright/          # Will contain test plans, exploration, etc.
├── 002-better-template-labelling/
│   └── playwright/
└── 003-benchmarking-system/
    └── playwright/
```

### 2. Four Claude Code Skills

Each skill is accessible via `/skill-name` command:

#### `/test-planner`
**Purpose**: Converts requirements and user stories into structured test plans

**Input**: Feature directory path (e.g., `feature-docs/003-benchmarking-system/`)

**Output**:
- `{feature}/playwright/test-plans/README.md` - Overview and summary
- `{feature}/playwright/test-plans/US-*.md` - One file per user story with scenarios
- Categorized by priority and type (Happy Path, Edge Case, Error Case)

**Example Usage**:
```
/test-planner feature-docs/003-benchmarking-system/
```

#### `/playwright-explorer`
**Purpose**: Explores the application with Playwright, documents pages, and adds test selectors to code

**Input**:
- Feature directory
- Application URL (default: http://localhost:3000)

**Output**:
- `{page-name}.page-doc.md` - Human-readable page documentation
- `{page-name}.selectors.md` - Machine-readable selector lists
- **Modified source files** - React components with added `data-testid` attributes

**Example Usage**:
```
/playwright-explorer feature-docs/003-benchmarking-system/
```

**Note**: Application must be running before exploration

**Key Feature**: Automatically adds `data-testid` attributes to elements lacking robust selectors, making tests more reliable and maintainable.

#### `/test-generator`
**Purpose**: Generates production-ready Playwright tests

**Input**: Feature directory path

**Output**:
- Test files in `tests/e2e/{feature-name}/`
- Page Object Models in `tests/e2e/pages/`
- Uses existing auth patterns from `WRITING_TESTS.md`
- Includes Given/When/Then comments
- Requirement traceability

**Example Usage**:
```
/test-generator feature-docs/003-benchmarking-system/
```

#### `/test-healer`
**Purpose**: Runs tests and automatically fixes failures

**Input**:
- Test file or directory path
- Feature directory path
- Max attempts (default: 3)

**Output**:
- Fixed test code
- Healing log in `{feature}/playwright/healing-log.md`
- Test results summary
- Documented requirements mismatches

**Example Usage**:
```
/test-healer tests/e2e/benchmarking/ feature-docs/003-benchmarking-system/
```

**Key Feature**: Consults `requirements.md` and `user-stories/` before making any fix. If the app doesn't match requirements, it flags the issue instead of making the test pass incorrectly.

## How to Use the Workflow

### Complete End-to-End Flow

For a new feature (e.g., "Benchmarking System"):

```bash
# Step 1: Plan
# Creates test scenarios based on requirements.md and user stories
/test-planner feature-docs/003-benchmarking-system/

# Review the generated test plans at:
# feature-docs/003-benchmarking-system/playwright/test-plans/README.md
# feature-docs/003-benchmarking-system/playwright/test-plans/US-*.md

# Step 2: Explore
# IMPORTANT: Start your application first!
npm run dev

# Then explore and document the app (also adds data-testid to code)
/playwright-explorer feature-docs/003-benchmarking-system/

# This will interactively explore each page, taking screenshots, and adding selectors
# Review the generated documentation at:
# - feature-docs/003-benchmarking-system/playwright/*.page-doc.md
# - feature-docs/003-benchmarking-system/playwright/*.selectors.md
# - feature-docs/003-benchmarking-system/playwright/selector-changes.md (code modifications)

# Step 3: Generate Tests
# Creates test code based on plans and exploration
/test-generator feature-docs/003-benchmarking-system/

# This creates:
# - tests/e2e/benchmarking/*.spec.ts
# - tests/e2e/pages/*Page.ts

# Step 4: Heal Tests
# Runs tests and fixes issues automatically
/test-healer tests/e2e/benchmarking/ feature-docs/003-benchmarking-system/

# Reviews healing results at:
# - feature-docs/003-benchmarking-system/playwright/healing-log.md
# - feature-docs/003-benchmarking-system/playwright/test-results.md
```

### Individual Skill Usage

You can also use skills individually:

#### Just generate a test plan:
```
/test-planner feature-docs/001-graph-workflows/
```

#### Just explore a specific feature:
```
/playwright-explorer feature-docs/002-better-template-labelling/
```

#### Just generate tests (if you've already done exploration):
```
/test-generator feature-docs/001-graph-workflows/
```

#### Just heal failing tests:
```
/test-healer tests/e2e/graph-workflows/ feature-docs/001-graph-workflows/
```

## Key Principles

### 1. Requirements-Driven Testing

**Golden Rule**: Tests are based on `requirements.md`, NOT on current application behavior.

```
If requirements.md says:     "Submit button has data-testid='submit-btn'"
But application has:         <button type="submit">Submit</button>

The test will:
✅ Use data-testid='submit-btn' (as per requirements)
⚠️ FAIL when run against the application
📝 Document the mismatch in healing-log.md
🚨 Flag for the development team to fix the application
```

### 2. Test Healing Process

When `/test-healer` encounters a failure:

1. **Investigate** - Reads `requirements.md` and `user-stories/`
2. **Compare** - Checks if test or application is wrong
3. **Decide**:
   - If test is wrong: Fixes the test
   - If app is wrong: Documents the issue, keeps test failing
4. **Document** - Records everything in healing-log.md

### 3. Authentication Pattern

All generated tests use the existing auth helper:

```typescript
await setupAuthenticatedTest(page, {
  apiKey: TEST_API_KEY!,
  backendUrl: BACKEND_URL,
  frontendUrl: FRONTEND_URL,
});
```

This handles:
- Backend API key authentication (`x-api-key` header)
- Frontend auth bypass (mock localStorage tokens)

See [WRITING_TESTS.md](./WRITING_TESTS.md) for details.

## Configuration

The workflow is configured via [`.claude/skills/config/playwright-workflow.md`](../../.claude/skills/config/playwright-workflow.md).

Key settings:
- **Frontend URL**: `http://localhost:3000` (override with `FRONTEND_URL`)
- **Backend URL**: `http://localhost:3002` (override with `BACKEND_URL`)
- **Test API Key**: Required in `TEST_API_KEY` environment variable

## Integration with Existing Tests

The workflow integrates seamlessly with your existing:
- ✅ Auth helpers in `tests/e2e/helpers/auth.ts`
- ✅ Test writing guide in `WRITING_TESTS.md`
- ✅ Environment variables and configuration
- ✅ Playwright config in `playwright.config.ts`

Generated tests follow the same patterns as your manually written tests.

## File Organization

### Feature Documentation (Source of Truth)
```
feature-docs/003-benchmarking-system/
├── requirements.md           # ← SOURCE OF TRUTH
├── user-stories/
│   ├── US-001.md            # ← Acceptance criteria
│   └── US-002.md
└── playwright/
    ├── test-plans/          # Generated by /test-planner
    │   ├── README.md        # Overview and summary
    │   ├── US-001.md        # Test scenarios for US-001
    │   └── US-002.md        # Test scenarios for US-002
    ├── datasets.page-doc.md # Generated by /playwright-explorer
    ├── datasets.selectors.md
    ├── healing-log.md       # Generated by /test-healer
    └── test-results.md
```

### Test Code (Generated)
```
tests/e2e/
├── benchmarking/
│   ├── datasets.spec.ts     # Generated by /test-generator
│   └── results.spec.ts
└── pages/
    ├── DatasetsPage.ts      # Generated by /test-generator
    └── ResultsPage.ts
```

## Troubleshooting

### Skill not found
Make sure you're using the correct syntax:
```
/test-planner feature-docs/003-benchmarking-system/
```
(Note the forward slash before the skill name)

### Playwright exploration fails
- Ensure your application is running (`npm run dev`)
- Check that `FRONTEND_URL` is correct
- Verify you have a valid `TEST_API_KEY` set

### Tests fail after generation
This is expected! Use `/test-healer` to automatically fix issues:
```
/test-healer tests/e2e/benchmarking/ feature-docs/003-benchmarking-system/
```

### Application doesn't match requirements
This is a **feature**, not a bug. The workflow will:
1. Keep the test failing (correct behavior)
2. Document the mismatch in `healing-log.md`
3. Flag it for the development team to fix the application

## Next Steps

### For Your First Feature

We recommend starting with the benchmarking system since it's already set up:

```bash
# 1. Ensure your app is running
npm run dev

# 2. Generate tests for benchmarking
/test-planner feature-docs/003-benchmarking-system/
/playwright-explorer feature-docs/003-benchmarking-system/
/test-generator feature-docs/003-benchmarking-system/
/test-healer tests/e2e/benchmarking/ feature-docs/003-benchmarking-system/
```

### For Other Features

Repeat the same process for:
- `feature-docs/001-graph-workflows/`
- `feature-docs/002-better-template-labelling/`

## Benefits of This Workflow

1. **Consistency** - All tests follow the same patterns
2. **Requirements Traceability** - Tests link back to requirements
3. **Self-Healing** - Tests automatically fix themselves when possible
4. **Quality Gates** - Flags when app doesn't match requirements
5. **Documentation** - Generates comprehensive page documentation
6. **Time Savings** - Automates repetitive test writing tasks

## Manual vs Automated

You can still write tests manually using [WRITING_TESTS.md](./WRITING_TESTS.md). The workflow is optional and complements manual testing.

**Use Automated Workflow When**:
- Starting a new feature
- Creating comprehensive test coverage
- Need to update tests after UI changes

**Write Manually When**:
- Quick one-off test needed
- Highly specialized test scenario
- Testing something very simple

## Support

If you encounter issues:
1. Check the healing-log.md for diagnostic information
2. Review the skill documentation in `.claude/skills/`
3. Consult [WRITING_TESTS.md](./WRITING_TESTS.md) for manual testing patterns
4. Check the configuration in `.claude/skills/config/playwright-workflow.md`
