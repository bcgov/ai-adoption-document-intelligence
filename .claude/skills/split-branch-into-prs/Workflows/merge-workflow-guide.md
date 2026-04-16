# Merge Workflow Guide

Instructions to give the user for merging the stacked PRs after creation.

## Present This to the User

After all PRs are created, explain the merge workflow:

### How to Merge (repeat for each PR in order)

1. **Review** the PR diff on GitHub — it should only show that PR's net-new changes
2. **Squash & merge** the PR into develop
3. On the **next PR**, click **"Update branch"** (the merge option, not rebase) — this pulls the newly merged develop into the PR branch
4. The PR diff will automatically update to show only net-new changes
5. Repeat from step 1

### Why This Works

- Each PR branch contains all prior groups' commits (stacked)
- After squash-merging PR N, develop has all of PR N's content
- "Update branch" on PR N+1 merges develop in — git resolves the duplicate content cleanly since the files are identical
- The PR diff only compares the branch tip vs develop, so it shows only net-new changes
- Since you're squash-merging, the duplicate commit history in the branch doesn't matter — only the final diff counts

### Fixing Quality Gate Failures

If a PR fails linting, tests, or other checks:

- **Fix it on the PR where the code was introduced** — not on a later PR
- Push the fix commit to that PR's branch
- The fix will flow forward to later PRs when they do "Update branch" after the fixed PR is merged

### Key Points

- Always use **"Update branch"** (merge), not "Update with rebase" — simpler, no force-push needed
- Always **squash & merge** — this is what makes the stacked approach work
- The commit history on PR branches looks duplicated, but the GitHub diff and squash result are clean
