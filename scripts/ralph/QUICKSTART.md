# Ralph Quick Start Guide

Get Ralph running in 5 minutes!

## TL;DR

```bash
# 1. Verify setup
./scripts/ralph/check-setup.sh

# 2. Create user stories (use Claude Code skill)
# In Claude Code: /write-user-stories

# 3. Convert to Ralph format
node scripts/ralph/convert-stories-to-prd.js feature-docs/your-feature/user_stories ralph/your-feature

# 4. Checkout your working branch (Ralph works on current branch)
git checkout your-feature-branch

# 5. Configure permissions (CRITICAL - do this in Claude Code)
# Run: /permissions
# Set defaultMode to: acceptEdits
# Add allow rules for: npm run *, git *

# 6. Run Ralph
./scripts/ralph/ralph.sh 25
```

## Step-by-Step

### 1. Install Prerequisites

```bash
# Install jq if not already installed
sudo apt-get update
sudo apt-get install -y jq

# Verify setup
./scripts/ralph/check-setup.sh
```

### 2. Create User Stories

In Claude Code, use the write-user-stories skill:

```
/write-user-stories
```

Or invoke it with a requirements document:

```
Create user stories from feature-docs/my-feature/REQUIREMENTS.md
```

This creates files in a `user_stories/` subdirectory next to your requirements:
- `US-001-story-name.md`
- `US-002-another-story.md`
- `README.md` (tracking file)

### 3. Convert Stories to Ralph Format

```bash
# Basic conversion (default branch: ralph/user-stories)
node scripts/ralph/convert-stories-to-prd.js feature-docs/my-feature/user_stories

# Or specify a custom branch name
node scripts/ralph/convert-stories-to-prd.js feature-docs/my-feature/user_stories ralph/my-feature-v2
```

This creates `scripts/ralph/prd.json`.

**Verify the output:**
```bash
cat scripts/ralph/prd.json | jq '.userStories[] | {id, title, priority}'
```

### 4. Configure Claude Code Permissions ⚠️ CRITICAL

**Before running Ralph**, you MUST configure permissions or Ralph will hang asking for approval.

In Claude Code:

1. **Open permissions settings:**
   ```
   /permissions
   ```

2. **Set default mode:**
   - Find `defaultMode` setting
   - Change to: `acceptEdits`
   - This auto-accepts file read/write/edit operations

3. **Add Bash command allow rules:**
   Add these patterns to the allow list:
   ```
   npm run typecheck
   npm run test
   npm run db:generate
   git add
   git commit
   git checkout
   git branch
   git status
   git diff
   git log
   cd apps/*
   cd scripts/*
   ```

4. **Verify directory access:**
   - Make sure Claude Code has access to your repository directory
   - If launched from the repo root, this should be automatic

**Why this matters:** Ralph spawns fresh Claude instances each iteration. If permissions aren't configured, each iteration will pause waiting for approval, and Ralph will hang.

### 5. Checkout Your Working Branch

**IMPORTANT**: Ralph works on your current branch. It does NOT create or switch branches.

```bash
# Make sure you're on the branch where you want Ralph to work
git checkout benchmarking-system

# Or create a new branch if needed
git checkout -b my-feature-branch
```

### 6. Run Ralph

```bash
# Run up to 25 iterations (uses Claude Sonnet 4.5)
./scripts/ralph/ralph.sh 25

# Or start smaller for testing
./scripts/ralph/ralph.sh 5
```

**Note**: Ralph uses Sonnet 4.5 by default for speed and cost. To use Opus or Haiku, edit `scripts/ralph/ralph.sh` and change `--model sonnet` to `--model opus` or `--model haiku`.

Ralph will:
- ✅ Work on your current branch (no branch switching)
- ✅ Implement stories one by one in dependency order
- ✅ Run tests and typecheck
- ✅ Commit successful implementations with `--no-verify`
- ✅ Update tracking files (prd.json, progress.txt, README.md)
- ✅ Mark stories as `[x]` in the user-stories README.md
- ✅ Stop when all stories pass

### 7. Monitor Progress

**In another terminal**, watch progress in real-time:

```bash
# Watch story completion status
watch -n 2 'cat scripts/ralph/prd.json | jq ".userStories[] | {id, passes}"'

# Or check manually
cat scripts/ralph/prd.json | jq '.userStories[] | {id, title, passes}'

# View recent learnings
tail -f scripts/ralph/progress.txt

# See commits
git log --oneline -20
```

### 8. When Complete

Ralph will output `<promise>COMPLETE</promise>` and exit.

**Review the work:**
```bash
# See all commits on the branch
git log --oneline origin/main..HEAD

# Review changes
git diff origin/main..HEAD

# Run final checks
cd apps/backend-services && npm test && npm run typecheck
```

**Create a PR:**
```bash
# In Claude Code
/review-pr

# Or manually with gh CLI
gh pr create --title "Implemented user stories from Ralph" --body "Auto-implemented by Ralph autonomous agent"
```

## Troubleshooting

### ❌ Ralph hangs after first iteration
**Cause:** Permission prompts are blocking
**Fix:** Complete step 4 (Configure permissions)

### ❌ Tests keep failing
**Cause:** Story implementation has issues
**Fix:**
1. Check `scripts/ralph/progress.txt` for error details
2. Review the failing test output
3. You may need to manually fix and update `passes: true` in prd.json

### ❌ Wrong branch
**Cause:** prd.json has incorrect branch name
**Fix:**
```bash
# Edit prd.json
nano scripts/ralph/prd.json
# Change "branchName" field
```

### ❌ Stories in wrong order
**Cause:** Priority values are incorrect
**Fix:**
```bash
# Edit prd.json and adjust priority values (1 = highest)
nano scripts/ralph/prd.json
```

## Tips for Success

1. **Start small**: Test Ralph with 3-5 stories before running large batches
2. **Watch the first run**: Monitor the first 2-3 iterations closely
3. **Review commits**: Ralph commits after each story - use git log to track
4. **Iterate wisely**: Use iteration limits (5, 10, 25) based on story complexity
5. **Clean state**: Commit or stash local changes before running Ralph
6. **Branch strategy**: Ralph creates/uses a dedicated branch - your main stays safe

## Example Session

```bash
# Starting from requirements document
cd /home/lex/GitHub/ai-adoption-document-intelligence

# Create stories (in Claude Code)
/write-user-stories

# Convert to Ralph (in terminal)
node scripts/ralph/convert-stories-to-prd.js feature-docs/benchmarking/user_stories ralph/benchmarking

# Check output
cat scripts/ralph/prd.json | jq

# Configure Claude Code permissions (in Claude Code)
/permissions
# ... set acceptEdits, add allow rules ...

# Run Ralph (in terminal)
./scripts/ralph/ralph.sh 10

# Monitor in another terminal
watch -n 2 'cat scripts/ralph/prd.json | jq ".userStories[] | select(.passes == false) | {id, title}"'

# When done, review
git log --oneline origin/main..HEAD
gh pr create
```

## Next Steps

- See [README.md](README.md) for detailed documentation
- Customize [prompt.md](prompt.md) for project-specific patterns
- Add custom checks or validation steps to Ralph workflow
- Integrate Ralph into your CI/CD pipeline

Happy autonomous coding! 🚀
