# Agent Instructions

Shared rules for coding agents working in this repository. See also `CLAUDE.md` for the full contributor rule set.

## Pull requests and releases

A pull request title is `type: HCAP-### short description`. The HCAP key is uppercase. A lowercase key does not sync to Jira. A scope is optional. The title check allows `feat`, `fix`, `perf`, `revert`, `docs`, `style`, `refactor`, `test`, `build`, `ci`, and `chore`.

`feat` is what you added. `fix` is what you repaired. Use `chore` when none of the other types fit. Example: `feat: HCAP-145 show the deployed commit in the header`.

Name the branch `feature/HCAP-###-short-slug`, with the key in uppercase. The type belongs on the pull request title, not the branch. Develop accepts a squash merge only, so the pull request title becomes the commit.

One product version covers the whole repository. Day-to-day work merges to `develop`. A push to `develop` updates the test environment and does not create a version. A release is cut from `main`. The tag is `vMAJOR.MINOR.PATCH`, and the first release is `v0.1.0`.

`feat` raises the second number. `fix` raises the third. Before `1.0.0`, a breaking change raises the second number. Mark a breaking change with `!` after the type, or with a `BREAKING CHANGE` footer. `docs`, `style`, `refactor`, `test`, `build`, `ci`, and `chore` do not open a release. `perf` and `revert` are valid titles. They can appear in a changelog, and they do not open a release on their own.

The Jira version uses the release number with no leading `v`, so tag `v0.1.0` is Jira version `0.1.0`. Put the tickets for the next bundle on an unreleased Jira version while the work is open. When the GitHub tag exists, mark that Jira version released on the day of the tag. The release workflow details are in `docs-md/operations/CI_WORKFLOWS.md`.

## Skills

Use these skills when the task matches their triggers. Full instructions live under `.claude/skills/`.

| Skill | When to use |
| --- | --- |
| [documentation](.claude/skills/documentation/SKILL.md) | Updating `docs-md/`, READMEs, or the repo wiki after feature or boundary changes |
| [create-pr](.claude/skills/create-pr/SKILL.md) | Opening a single pull request for the current branch |
| [docs-site](.claude/skills/docs-site/SKILL.md) | Editing the public VitePress documentation site under `docs/` |
| [split-branch-into-prs](.claude/skills/split-branch-into-prs/SKILL.md) | Splitting a feature branch into multiple stacked draft PRs |

When creating or modifying features, follow the documentation skill (canonical docs first, wiki ingest when routing or boundaries change). When the user asks to open a PR, follow the create-pr skill and complete the documentation checklist in `.github/PULL_REQUEST_TEMPLATE.md`.

## Repo Wiki

Canonical wiki rules for all agents. `CLAUDE.md` and `.github/copilot-instructions.md` point here to avoid drift.

The repo wiki in `docs-md/wiki/` is a compression layer: synthesize and route to canonical docs/code, do not replace canonical implementation docs.

- Before broad doc or code exploration, read `docs-md/wiki/index.md` and the relevant wiki topic, then follow `canonical_sources` to detailed docs or code.
- Follow wiki ingest, query, and lint workflows in `docs-md/wiki/README.md` (or the [documentation](.claude/skills/documentation/SKILL.md) skill).
- Wiki pages must not copy full runbooks, schemas, endpoint lists, or implementation guides; link to the canonical source instead.
- New wiki content must either replace scattered explanation or add useful source navigation/context. If it does neither, do not add it.
- Append grep-friendly entries to `docs-md/wiki/log.md` (`## [YYYY-MM-DD] operation | Title`) when maintaining the wiki.
- Run `npm run docs:wiki:check` after changing `docs-md/wiki/`.
- The documentation site copies the wiki from `docs-md/wiki/` into `docs/wiki/` when it builds. That copy is git-ignored: edit the wiki only in `docs-md/wiki/`.

## Documentation ownership

- **Root `README.md`**: local setup, prerequisites, and development commands.
- **`docs/` site**: public documentation site (VitePress) overview and guides; defer detailed setup to root README.
- **`docs-md/`**: canonical developer reference docs, organized by topic folder — taxonomy in `docs-md/README.md`.
- **`docs-md/wiki/`**: routing map for agents and contributors; not a second implementation spec.
- **`apps/README.md`**: app-level boundaries only; link to root README for setup.

Docs maintenance workflows (updating docs after code changes, auditing accuracy, adding docs, archiving stale docs) are encoded in the `docs-sync` skill (`.claude/skills/docs-sync/`).
