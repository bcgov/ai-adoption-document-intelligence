# User Story Mode

User Story Mode implements user stories from a `prd.json` file one at a time.

## How It Works

Each iteration:
1. Reads `prd.json` to find the next unimplemented story (first with `passes: false`)
2. Implements that story following acceptance criteria
3. Runs typechecking and tests
4. Commits if checks pass
5. Updates `prd.json` and `progress.txt`
6. Continues to next story

When all stories have `passes: true`, Ralph outputs `<promise>COMPLETE</promise>` and exits.

## Setup

### 1. Create User Stories

Use the write-user-stories skill:
```bash
/write-user-stories
```

This creates `user_stories/` directory with individual story files and a README.md.

### 2. Convert to prd.json

```bash
node scripts/ralph/convert-stories-to-prd.js <user_stories_dir> [branch_name]
```

Example:
```bash
node scripts/ralph/convert-stories-to-prd.js feature-docs/benchmarking/user_stories ralph/benchmarking
```

This creates `scripts/ralph/state/prd.json`.

## Usage

```bash
# Default mode (user-story is the default)
./scripts/ralph/ralph.sh --tool claude 25

# Explicit mode
./scripts/ralph/ralph.sh --mode user-story --tool amp 10
```

## Files

- **state/prd.json**: User story tracking (id, title, passes, notes, file path)
- **state/progress.txt**: Iteration-to-iteration memory and learnings
- **state/.last-branch**: Branch tracking for archiving

## Monitoring

```bash
# Check story status
cat scripts/ralph/state/prd.json | jq '.userStories[] | {id, title, passes}'

# View recent learnings
tail -n 50 scripts/ralph/state/progress.txt

# Watch in real-time
watch -n 2 'cat scripts/ralph/state/prd.json | jq ".userStories[] | {id, title, passes}"'
```
