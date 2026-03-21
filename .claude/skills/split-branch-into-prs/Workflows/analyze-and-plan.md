# Analyze & Plan

Identify which commits need to be split and propose logical groupings.

## Steps

1. **Update develop to latest:**
   ```bash
   git fetch origin develop && git checkout develop && git pull origin develop
   ```

2. **Identify the commit range:**
   - Run `git log --oneline develop..<current-branch>` to see all commits ahead of develop
   - Ask the user which commit is the actual first commit on the branch (earlier commits may be from a parent branch that was squash-merged)
   - Verify by checking `git diff develop..<branch> -- <path>` for suspected already-merged areas — 0 diff confirms they're in develop

3. **List commits in chronological order:**
   ```bash
   git log --oneline --reverse <first-commit>^..<branch>
   ```

4. **Identify logical groups** by looking at:
   - Commit message prefixes and user story references
   - Which files each commit touches (`git log --oneline --name-only`)
   - Natural breakpoints between features/workstreams
   - Dependencies between groups (what must merge first)

5. **Check for shared files across groups:**
   ```bash
   for f in <shared-files>; do
     echo "=== $f ==="
     git log --oneline --reverse <first-commit>^..<branch> -- "$f"
   done
   ```
   Ensure shared files (package.json, Dockerfiles, app.module.ts, etc.) are grouped with the earliest PR that modifies them, or that modifications are sequential and won't conflict.

6. **Present the plan to the user:**
   - List each proposed PR with a title, the commits it includes, and a brief description
   - Note any dependencies between groups
   - Confirm the grouping before proceeding

## Common Pitfalls

- Don't assume all commits in `git log develop..<branch>` are unique — parent branches may have been squash-merged, leaving ghost commits that produce 0 diff
- Always ask the user to confirm the first real commit rather than guessing
- Watch for commits that touch the same file across groups — these need careful ordering
