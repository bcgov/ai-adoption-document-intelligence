# Ralph - Multi-Mode Autonomous Agent Loop

Ralph is a flexible autonomous agent framework that supports multiple modes of operation. It runs in iterations, automatically handling tasks until completion.

## Available Modes

### 1. User Story Mode (Default)
Implements user stories one-by-one from a `prd.json` file, running tests, committing changes, and tracking progress.

### 2. Test Fixer Mode
Runs Playwright tests one file at a time, fixing failures in both tests AND implementation code by consulting requirements.

## How Ralph Works

Ralph runs in iterations. Each iteration delegates to a mode-specific workflow:

**User Story Mode**:
1. Reads `state/prd.json` to find the next unimplemented story
2. Implements that story following acceptance criteria
3. Runs typechecking and tests
4. Commits if checks pass
5. Updates `state/prd.json` and `state/progress.txt`
6. Continues to next story

**Test Fixer Mode**:
1. Reads `{feature-dir}/playwright/test-fixer-progress.md` to find next unchecked test
2. Runs that ONE test file
3. If it fails: reads requirements, fixes implementation OR test code
4. If it passes: marks as complete and commits
5. Continues to next test file

When all tasks are complete, Ralph outputs `<promise>COMPLETE</promise>` and exits.

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

Choose the setup for your mode:

### User Story Mode Setup

**Step 1: Create User Stories**

Use the write-user-stories skill:

```bash
/write-user-stories
```

This creates a `user_stories/` directory with individual story files and a README.md.

**Step 2: Convert to Ralph Format**

```bash
node scripts/ralph/convert-stories-to-prd.js <path_to_user_stories> [branch_name]
```

Example:
```bash
node scripts/ralph/convert-stories-to-prd.js feature-docs/benchmarking/user_stories ralph/benchmarking
```

This creates `scripts/ralph/state/prd.json` with all user stories sorted by ID.

**Step 3: Review prd.json**

```bash
cat scripts/ralph/state/prd.json | jq '.userStories[] | {id, title, priority, passes}'
```

### Test Fixer Mode Setup

**Step 1: Generate Test Progress Markdown**

```bash
node scripts/ralph/generate-test-progress.js <test_folder> <feature_dir>
```

Example:
```bash
node scripts/ralph/generate-test-progress.js benchmarking feature-docs/003-benchmarking-system/
```

This scans the test directory and creates `{feature-dir}/playwright/test-fixer-progress.md`.

**Step 2: Convert to Ralph Format**

```bash
node scripts/ralph/convert-tests-to-progress.js <test_folder> <feature_dir>
```

Example:
```bash
node scripts/ralph/convert-tests-to-progress.js benchmarking feature-docs/003-benchmarking-system/
```

This reads the markdown and creates `scripts/ralph/state/prd.json`.

**Step 3: Verify prd.json**

```bash
cat scripts/ralph/state/prd.json | jq '.testFiles[] | {id, passes}'
```

## Running Ralph

### User Story Mode (Default)

```bash
# Default mode (backward compatible)
./scripts/ralph/ralph.sh 25

# Explicit mode with Claude tool
./scripts/ralph/ralph.sh --mode user-story --tool claude 25

# With amp tool (default)
./scripts/ralph/ralph.sh --mode user-story --tool amp 10
```

Ralph will:
- Read `state/prd.json` to find next story
- Implement stories in dependency order
- Run tests and typecheck after each story
- Commit with `--no-verify`
- Update `state/prd.json`, `state/progress.txt`, and user-stories README.md
- Stop when all stories have `passes: true`

### Test Fixer Mode

```bash
# Full form
./scripts/ralph/ralph.sh --mode test-fixer --tool claude 25

# Shorter (defaults to amp tool)
./scripts/ralph/ralph.sh --mode test-fixer --tool amp 10
```

Ralph will:
- Read `state/prd.json` to find next test with `passes: false`
- Run ONE test file per iteration
- Fix implementation OR test code based on requirements
- Update prd.json (`passes: true`) and markdown when test passes
- Commit with `--no-verify`
- Stop when all tests have `passes: true`

**Tools available:**
- **`amp`** (default): Uses amp tool with `--dangerously-allow-all`
- **`claude`**: Uses Claude Code (model configured via settings.json)

### Monitoring Progress

**User Story Mode**:
```bash
# Check story status
cat scripts/ralph/state/prd.json | jq '.userStories[] | {id, title, passes}'

# View recent learnings
tail -n 50 scripts/ralph/state/progress.txt

# Watch in real-time
watch -n 2 'cat scripts/ralph/state/prd.json | jq ".userStories[] | {id, title, passes}"'
```

**Test Fixer Mode**:
```bash
# Check prd.json status
cat scripts/ralph/state/prd.json | jq '.testFiles[] | {id, passes}'

# Count remaining tests
jq '[.testFiles[] | select(.passes == false)] | length' scripts/ralph/state/prd.json

# Check progress markdown (human-readable)
cat feature-docs/003-benchmarking-system/playwright/test-fixer-progress.md
```

**Both Modes**:
```bash
# See commits
git log --oneline -10
```

## File Structure

```
scripts/ralph/
├── README.md                      # Main documentation
├── ralph.sh                       # Mode-agnostic main loop
├── convert-stories-to-prd.js      # User story converter
├── convert-tests-to-progress.js   # Test progress generator
├── check-setup.sh                 # Setup checker
├── status.sh                      # Status viewer
│
├── modes/                         # Mode definitions
│   ├── user-story/                # User Story Mode
│   │   ├── config.sh              # Mode configuration
│   │   ├── CLAUDE.md              # Claude tool prompt
│   │   ├── prompt.md              # Amp tool prompt
│   │   └── README.md              # Mode docs
│   │
│   └── test-fixer/                # Test Fixer Mode
│       ├── config.sh              # Mode configuration
│       ├── CLAUDE.md              # Claude tool prompt
│       ├── prompt.md              # Amp tool prompt
│       └── README.md              # Mode docs
│
├── state/                         # Runtime state (gitignored)
│   ├── .gitkeep
│   ├── prd.json                   # User story tracking
│   ├── progress.txt               # User story progress
│   └── .last-branch               # Archiving state
│
├── lib/                           # Shared libraries
│   ├── claude-capacity.sh         # Claude capacity checking
│   ├── archive.sh                 # Archiving logic
│   └── completion.sh              # Completion detection
│
└── archive/                       # Archived runs
    └── {date}-{branch}/
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
