# Create PR

Create a single pull request for the current branch.

## Prerequisites

- User explicitly asked to create/open a PR
- Branch has commits to include (or user confirmed empty-diff intent is wrong and work is committed)

## Steps

1. **Gather branch state in parallel:**

```bash
git status
git diff
git branch -vv
git log --oneline -10
git rev-parse --abbrev-ref HEAD
```

Also determine the base branch (default `develop` unless the user specified another) and the full commit range:

```bash
git log develop...HEAD --oneline
git diff develop...HEAD
```

If the branch does not track a remote or is behind/ahead in a way that matters, note that before pushing.

2. **Confirm documentation readiness:**

- If the change affects behavior, APIs, setup, ownership, or contributor routing, ensure docs were updated per the [documentation](../../documentation/SKILL.md) skill.
- If the change affects system boundaries, doc routing, or where contributors should edit, ensure `docs-md/wiki/` was updated or confirmed not needed.
- If wiki files changed, run `npm run docs:wiki:check`.

3. **Push the branch if needed:**

```bash
git push -u origin HEAD
```

4. **Draft the PR:**

- Title format: `JIRA_BOARD-NUMBER: short title` (e.g. `AI-1296: Add repo wiki`)
- Summary links the Jira ticket when known
- Changes summarize **all** commits on the branch, not only the latest
- Testing lists what was run or how to verify
- Checklist matches `.github/PULL_REQUEST_TEMPLATE.md`

5. **Create the PR:**

```bash
gh pr create --base develop --title "AI-###: Title" --body "$(cat <<'EOF'
## Summary

[AI-###](https://citz-do.atlassian.net/browse/AI-###)

Brief description of why this change exists.

## Changes

- Bullet list of what changed

## Testing

- How it was tested

## Checklist

By submitting this pull request, I acknowledge that I have attempted to meet the following:

> - a self-review of my code
> - commented code particularly in hard-to-understand areas
> - documentation updated where required (`docs-md/`, READMEs, and/or public `docs/` site), including the repo wiki (`docs-md/wiki/`) when boundaries, routing, or contributor guidance changed — or confirmed not needed
> - changes tested to the best of my ability
> - no new errors or non-functional code

EOF
)"
```

Use `--draft` only when the user asks for a draft PR.

6. **Return the PR URL** to the user.

## Common Pitfalls

- Creating a PR without updating docs/wiki when boundaries or contributor guidance changed
- Summarizing only the latest commit instead of the full branch diff
- Forcing push or amending commits the user did not ask to amend
- Pasting secrets into the PR body or logs
