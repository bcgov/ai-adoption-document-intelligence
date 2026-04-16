# Create Branches & PRs

After the plan is confirmed, create stacked branches and draft PRs.

## Prerequisites

- The plan from [Analyze & Plan](analyze-and-plan.md) has been confirmed by the user
- You know: the commit groups, their order, and the first commit hash

## Steps

1. **Protect untracked sensitive files:**
   ```bash
   # Check for untracked files that might conflict with cherry-picks
   git status --short
   # Back up any sensitive untracked files (.env, tokens, etc.)
   mkdir -p /tmp/branch-split-backup
   # Copy files as needed, e.g.:
   # cp deployments/openshift/config/*.env /tmp/branch-split-backup/
   # Remove from working tree so cherry-picks don't conflict
   ```

2. **Ensure clean working tree on develop:**
   ```bash
   git checkout develop && git pull origin develop
   git status --short  # must be clean (no untracked conflicts)
   ```

3. **Create branches — each includes all prior groups (stacked):**
   For N groups, create N branches. Each branch cherry-picks all commits from group 1 through group N:
   ```bash
   # PR 1: just group 1
   git checkout -b pr/<name-1> develop
   git cherry-pick <first-commit-group1>^..<last-commit-group1>

   # PR 2: group 1 + group 2
   git checkout -b pr/<name-2> develop
   git cherry-pick <first-commit-group1>^..<last-commit-group1>
   git cherry-pick <first-commit-group2>^..<last-commit-group2>

   # PR 3: group 1 + group 2 + group 3
   # ... and so on
   ```

4. **Push all branches:**
   ```bash
   git push -u origin pr/<name-1>
   git push -u origin pr/<name-2>
   # ... etc.
   ```

5. **Create draft PRs using the standard template:**
   Number each PR in the title (e.g., "PR 1/4: ..."). Include merge order guidance in the body.

   ```bash
   gh pr create --head pr/<name> --base develop --draft \
     --title "PR 1/N: <descriptive title>" \
     --body "$(cat <<'EOF'
   ## Summary

   [Brief description of what this PR adds]

   > **Merge order:** This is PR X of N. Merge in sequence: **1 → 2 → 3 → ...** (use "Update branch" before merging each subsequent PR).

   ## Changes

   - [List of changes]

   ## Testing

   - [How it was tested]

   ## Checklist

   By submitting this pull request, I acknowledge that I have attempted to meet the following:

   > - a self-review of my code
   > - commented code particularly in hard-to-understand areas
   > - corresponding changes to the documentation where required
   > - changes tested to the best of my ability
   > - no new errors or non-functional code
   EOF
   )"
   ```

6. **Restore sensitive files:**
   ```bash
   # Switch to the last PR branch (or whichever the user wants)
   git checkout pr/<last-branch>
   # Restore backed-up files
   cp /tmp/branch-split-backup/* <original-locations>/
   # Verify they're gitignored
   git status --short
   ```

7. **Show the user a summary table:**
   - PR number, branch name, GitHub URL
   - Net-new commits per PR
   - Merge order instructions

## Common Pitfalls

- Cherry-pick ranges use `^..` syntax: `git cherry-pick A^..B` picks A through B inclusive
- Untracked files in the working tree can block cherry-picks if a commit creates the same file — always clean them out first and restore after
- If cherry-pick conflicts occur, resolve them and `git cherry-pick --continue`
- Always verify sensitive files are gitignored after restoring them
