# Test Fixer Mode

Test Fixer Mode runs Playwright tests one file at a time, fixing failures in both tests AND implementation code.

## How It Works

Each iteration:
1. Reads `state/prd.json` to find next test with `passes: false`
2. Runs that ONE test file
3. If it fails: analyzes error, reads requirements, fixes implementation or test code
4. If it passes: updates prd.json (`passes: true`), updates markdown, and commits with `--no-verify`
5. Continues to next test file

When all tests have `passes: true`, Ralph outputs `<promise>COMPLETE</promise>` and exits.

## Setup

### 1. Generate Test Progress Markdown

```bash
node scripts/ralph/generate-test-progress.js <test_folder> <feature_dir>
```

Example:
```bash
node scripts/ralph/generate-test-progress.js benchmarking feature-docs/003-benchmarking-system/
```

This scans the test directory and creates `{feature-dir}/playwright/test-fixer-progress.md`.

### 2. Convert to Ralph Format

```bash
node scripts/ralph/convert-tests-to-progress.js <test_folder> <feature_dir>
```

Example:
```bash
node scripts/ralph/convert-tests-to-progress.js benchmarking feature-docs/003-benchmarking-system/
```

This reads the markdown file and creates `scripts/ralph/state/prd.json`.

### 3. Verify prd.json

```bash
cat scripts/ralph/state/prd.json | jq '.testFiles[] | {id, passes}'
```

## Usage

```bash
# Run test-fixer mode
./scripts/ralph/ralph.sh --mode test-fixer --tool claude 25

# Shorter form (defaults to amp tool)
./scripts/ralph/ralph.sh --mode test-fixer --tool amp 10
```

Note: No test folder arguments needed - Ralph reads configuration from `state/prd.json`.

## Files

- **state/prd.json**: Ralph's tracking file (testFiles array with passes status)
- **{feature-dir}/playwright/test-fixer-progress.md**: Human-readable progress (updated by agent)
- Tests are in: `tests/e2e/{test-folder}/` (from prd.json)
- Requirements: `{feature-dir}/REQUIREMENTS.md` (from prd.json)
- User Stories: `{feature-dir}/user-stories/*.md`

## How It Fixes Tests

### 1. Read Requirements First

Before fixing anything, the agent:
- Reads `REQUIREMENTS.md` to understand expected behavior
- Reads relevant user stories for acceptance criteria
- Compares implementation to requirements

### 2. Decide What to Fix

- **Implementation doesn't match requirements** → Fix implementation code
- **Test expectation is wrong** → Fix test code
- **Just a timing issue** → Fix test synchronization

### 3. Implement Missing Features

If implementation is missing:
- **Database**: Update Prisma schema, migrate, seed
- **Backend**: Create DTOs, services, controllers, tests
- **Frontend**: API client, components, pages

### 4. Commit on Success

After each passing test, commits with:
```bash
git add .
git commit -m "fix: {test-name} tests pass" --no-verify
```

## Monitoring

```bash
# Check prd.json status
cat scripts/ralph/state/prd.json | jq '.testFiles[] | {id, passes}'

# Check progress markdown (human-readable)
cat feature-docs/003-benchmarking-system/playwright/test-fixer-progress.md

# Count remaining tests
jq '[.testFiles[] | select(.passes == false)] | length' scripts/ralph/state/prd.json

# Watch recent commits
git log --oneline -10
```

## Debugging

If tests keep failing:
1. Check backend logs: `tail -n 50 apps/backend-services/backend.log`
2. Test API directly: `curl -H "x-api-key: 69OrdcwUk4qrB6Pl336PGsloa0L084HFp7X7aX7sSTY" http://localhost:3002/api/...`
3. Check seed data: `apps/shared/prisma/seed.ts`
4. Read requirements again to verify expected behavior

## Important Notes

- **One test per iteration**: Ralph fixes ONE test file per iteration, not all at once
- **Requirements-driven**: Always checks requirements before making fixes
- **Commits progress**: Each passing test is committed immediately
- **Database auto-reset**: Playwright's globalSetup automatically resets the database before tests
