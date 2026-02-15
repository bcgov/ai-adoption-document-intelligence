# Ralph - Autonomous User Story Implementation

Ralph is an autonomous agent loop that implements user stories one-by-one, running tests, committing changes, and tracking progress until all stories are complete.

## Overview

Ralph runs in iterations. Each iteration:
1. Reads `prd.json` to find the next unimplemented story
2. Implements that story following acceptance criteria
3. Runs typechecking and tests
4. Commits if checks pass (on your current branch)
5. Updates `prd.json` and `progress.txt`
6. Continues to next story

**Important**: Ralph works on whatever branch you're currently on. It does NOT create or switch branches. The `branchName` field in prd.json is for reference only.

When all stories have `passes: true`, Ralph outputs `<promise>COMPLETE</promise>` and exits.

## Prerequisites

### 1. Install jq
Ralph uses jq to read/update prd.json:

```bash
sudo apt-get update
sudo apt-get install -y jq
```

### 2. Configure Claude Code Permissions

**CRITICAL**: Ralph will hang if Claude Code asks for permission mid-iteration.

Before running Ralph:

1. **Set default mode** to auto-accept file edits:
   ```bash
   /permissions
   ```
   Then set `defaultMode` to `acceptEdits`

2. **Add Bash command allow rules** for your project's commands:
   - `npm run typecheck`
   - `npm test`
   - `npm run db:generate`
   - `git *` (for commits and branch operations)

3. **Verify directory access**: Ensure Claude has access to your repo directory

If you're in WSL under org policy, check `/etc/claude-code/managed-settings.json` for overrides.

**Note**: Only use `bypassPermissions` / `--dangerously-skip-permissions` in safe sandbox environments.

## Setup

### Step 1: Create User Stories

Use the write-user-stories skill to create user stories from requirements:

```bash
# In Claude Code
/write-user-stories
```

This creates a `user_stories/` directory with:
- Individual story files: `US-001-description.md`, `US-002-description.md`, etc.
- A `README.md` with checkboxes for tracking

### Step 2: Convert Stories to Ralph Format

```bash
node scripts/ralph/convert-stories-to-prd.js <path_to_user_stories> [branch_name]
```

**Examples**:
```bash
# Basic usage (uses default branch name)
node scripts/ralph/convert-stories-to-prd.js feature-docs/benchmarking/user_stories

# Specify custom branch name
node scripts/ralph/convert-stories-to-prd.js feature-docs/benchmarking/user_stories ralph/benchmarking-v2
```

This creates `scripts/ralph/prd.json` with:
- All user stories sorted by ID
- Priority levels from story files
- Acceptance criteria extracted
- All stories marked as `passes: false`
- Branch name for Ralph to work on

### Step 3: Review prd.json

Check the generated file:

```bash
cat scripts/ralph/prd.json | jq '.userStories[] | {id, title, priority, passes}'
```

Optionally edit priorities or acceptance criteria manually.

## Running Ralph

### Basic Usage

Run up to 25 iterations:

```bash
# Default: Uses amp tool
./scripts/ralph/ralph.sh 25

# Use Claude Code with Sonnet 4.5
./scripts/ralph/ralph.sh --tool claude 25

# Or use explicit tool flag
./scripts/ralph/ralph.sh --tool=amp 25
```

**Tools available:**
- **`amp`** (default): Uses amp tool with `--dangerously-allow-all`
- **`claude`**: Uses Claude Code with **Sonnet 4.5** for speed and cost efficiency

To change the model for Claude Code mode, edit `ralph.sh` and modify the `--model sonnet` flag (options: `sonnet`, `opus`, `haiku`).

Ralph will:
- Work on your current branch (does NOT switch branches)
- Implement stories in dependency order (from README)
- Run tests and typecheck after each story
- Commit successful implementations with `--no-verify`
- Update tracking files (prd.json, progress.txt, and user-stories README.md)
- Mark completed stories with `[x]` in the user-stories README.md
- Stop when all stories pass or max iterations reached

### Monitoring Progress

**Check story status**:
```bash
cat scripts/ralph/prd.json | jq '.userStories[] | {id, title, passes}'
```

**View recent learnings**:
```bash
tail -n 50 scripts/ralph/progress.txt
```

**See commits**:
```bash
git log --oneline -10
```

**Watch in real-time** (in another terminal):
```bash
watch -n 2 'cat scripts/ralph/prd.json | jq ".userStories[] | {id, title, passes}"'
```

## File Structure

```
scripts/ralph/
├── README.md                      # This file
├── ralph.sh                       # Main loop script
├── prompt.md                      # Instructions for Claude each iteration
├── prd.json                       # Generated from user stories (DO NOT EDIT MANUALLY during run)
├── prd.json.template              # Template showing format
├── progress.txt                   # Iteration-to-iteration memory
└── convert-stories-to-prd.js      # Conversion tool
```

## prd.json Format

```json
{
  "branchName": "ralph/feature-name",
  "userStories": [
    {
      "id": "US-001",
      "title": "Add benchmark service",
      "acceptanceCriteria": [
        "Service created with CRUD operations",
        "All endpoints implemented and tested"
      ],
      "priority": 1,
      "passes": false,
      "notes": "",
      "file": "feature-docs/benchmarking/user_stories/US-001-add-service.md"
    }
  ]
}
```

## Troubleshooting

### Ralph hangs waiting for permission
- Make sure you set `defaultMode: acceptEdits` in Claude Code permissions
- Add allow rules for Bash commands (`npm run *`, `git *`)

### Ralph keeps retrying same failing test
- Check `progress.txt` for error messages
- Review the last commit to see what was attempted
- You may need to manually fix the issue and mark the story as passing in `prd.json`

### All stories complete but Ralph doesn't stop
- Check if `prd.json` has all `passes: true`
- Verify Ralph is outputting `<promise>COMPLETE</promise>`
- Check for JSON syntax errors in `prd.json`

### Stories implemented out of order
- Stories are sorted by `priority` (1 = highest)
- Edit priorities in `prd.json` if needed

### Need to restart from a specific story
- Edit `prd.json` and set `passes: false` for stories you want re-implemented
- Optionally reset the branch: `git reset --hard <commit_before_story>`

## Integration with write-user-stories Workflow

Complete workflow:

1. **Write requirements** → Create a feature specification document
2. **Generate stories** → Use `/write-user-stories` skill in Claude Code
3. **Convert to Ralph** → Run `convert-stories-to-prd.js`
4. **Review** → Check `prd.json` and adjust priorities if needed
5. **Configure permissions** → Set up Claude Code to auto-accept
6. **Run Ralph** → Execute `./ralph.sh 25`
7. **Monitor** → Watch progress with `jq` commands
8. **Review & merge** → When complete, review commits and create PR

## Tips

- **Start small**: Test with 3-5 stories before running large batches
- **Monitor closely**: Watch the first few iterations to catch permission issues
- **Save progress**: Ralph commits after each story, so you can stop/resume anytime
- **Iteration limits**: Start with 10-25 iterations, increase if needed
- **Failed stories**: Review failure notes in `prd.json` and `progress.txt`
- **Branch safety**: Ralph works on a dedicated branch - your main branch stays clean

## Advanced Usage

### Resume from checkpoint
Ralph is stateless between iterations - just re-run with remaining `passes: false` stories.

### Parallel Ralph instances
Run multiple Ralph instances on different story sets by creating separate `prd.json` files and modifying `ralph.sh` to point to them.

### Custom checks
Edit `prompt.md` to add custom validation steps (linting, integration tests, etc.).

## Safety Notes

Ralph will:
- ✅ Create and commit on a dedicated branch
- ✅ Run tests before committing
- ✅ Track all changes in git
- ✅ Stop if max iterations reached

Ralph will NOT:
- ❌ Push to remote automatically
- ❌ Modify main branch
- ❌ Make destructive changes without git tracking
- ❌ Skip tests or typecheck

Always review Ralph's commits before merging to main!
