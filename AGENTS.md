# Agent Instructions

Shared rules for coding agents working in this repository. See also `CLAUDE.md` for the full contributor rule set.

## Skills

Use these skills when the task matches their triggers. Full instructions live under `.claude/skills/`.

| Skill | When to use |
| --- | --- |
| [documentation](.claude/skills/documentation/SKILL.md) | Updating `docs-md/`, READMEs, or the repo wiki after feature or boundary changes |
| [create-pr](.claude/skills/create-pr/SKILL.md) | Opening a single pull request for the current branch |
| [docs-site](.claude/skills/docs-site/SKILL.md) | Editing the public HTML documentation site under `docs/` |
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
- Do not commit generated wiki HTML under `docs/wiki*.html`; it is built by `docs/build.sh` at docs deploy time.

## Documentation ownership

- **Root `README.md`**: local setup, prerequisites, and development commands.
- **`docs/` site (`_pages/`)**: public overview and links; defer detailed setup to root README.
- **`docs-md/`**: canonical developer reference docs, organized by topic folder — taxonomy in `docs-md/README.md`.
- **`docs-md/wiki/`**: routing map for agents and contributors; not a second implementation spec.
- **`apps/README.md`**: app-level boundaries only; link to root README for setup.

Docs maintenance workflows (updating docs after code changes, auditing accuracy, adding docs, archiving stale docs) are encoded in the `docs-sync` skill (`.claude/skills/docs-sync/`).
