---
name: split-branch-into-prs
description: "Splits a feature branch into multiple sequential draft PRs targeting develop. Trigger phrases: split branch into PRs, break branch into PRs, create stacked PRs, split into multiple PRs. Do NOT invoke for: creating a single PR, cherry-picking individual commits, or rebasing."
---

# Split Branch Into PRs

Analyzes a feature branch, identifies logical commit groups, creates sequential branches via cherry-pick, and opens draft PRs with a standardized template. Includes merge workflow guidance.

## Always Follow

- Target branch is always `develop`
- PRs are always created as **draft**
- PRs are numbered (e.g., "PR 1/4", "PR 2/4") in the title so merge order is clear
- Each PR branch includes all commits from prior groups (stacked), so that after squash-merge + "Update branch", the diff only shows net-new changes
- Back up any sensitive untracked files (`.env`, tokens, etc.) before branch switching, restore them after
- Never commit sensitive files — verify `.gitignore` coverage

## Workflows

1. **[Analyze & Plan](Workflows/analyze-and-plan.md)** — Identify the commit range, group commits into logical PRs, confirm the plan with the user
2. **[Create Branches & PRs](Workflows/create-branches-and-prs.md)** — Cherry-pick commits, push branches, create draft PRs using the standard template
3. **[Merge Workflow Guide](Workflows/merge-workflow-guide.md)** — Instructions for the squash-merge → update branch → repeat cycle
