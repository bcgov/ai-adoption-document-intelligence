---
name: create-pr
description: "Create a single pull request for the current branch using gh. Trigger phrases: create a PR, open a pull request, create pull request, open a PR, submit a PR. Do NOT invoke for: splitting a branch into multiple PRs (use split-branch-into-prs), committing only, or pushing without a PR."
---

# Create Pull Request

Opens one PR for the current branch against `develop` (unless the user specifies another base), using the repo PR template and documentation checklist.

## Always Follow

- Use `gh` for all GitHub operations
- Never update git config
- Do not force-push to `main`/`master`; warn if the user requests it
- Do not commit unless the user explicitly asked to commit
- Never commit secrets (`.env`, credentials, tokens)
- Fill the PR body from `.github/PULL_REQUEST_TEMPLATE.md` structure
- Confirm documentation and wiki checklist items were addressed (or explicitly N/A) before opening the PR
- When documentation or wiki updates are needed, follow the [documentation](../documentation/SKILL.md) skill first

## Workflows

1. **[Create PR](Workflows/create-pr.md)** — Inspect branch state, push if needed, open the PR with `gh pr create`
