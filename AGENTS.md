# Agent Instructions

Shared rules for coding agents working in this repository. See also `CLAUDE.md` for the full contributor rule set.

## Repo Wiki

Canonical wiki rules for all agents. `CLAUDE.md` and `.github/copilot-instructions.md` point here to avoid drift.

The repo wiki in `docs-md/wiki/` is a compression layer: synthesize and route to canonical docs/code, do not replace canonical implementation docs.

- Before broad doc or code exploration, read `docs-md/wiki/index.md` and the relevant wiki topic, then follow `canonical_sources` to detailed docs or code.
- Follow wiki ingest, query, and lint workflows in `docs-md/wiki/README.md`.
- Wiki pages must not copy full runbooks, schemas, endpoint lists, or implementation guides; link to the canonical source instead.
- New wiki content must either replace scattered explanation or add useful source navigation/context. If it does neither, do not add it.
- Append grep-friendly entries to `docs-md/wiki/log.md` (`## [YYYY-MM-DD] operation | Title`) when maintaining the wiki.
- Run `npm run docs:wiki:check` after changing `docs-md/wiki/`.
- Do not commit generated wiki HTML under `docs/wiki*.html`; it is built by `docs/build.sh` at docs deploy time.

## Documentation ownership

- **Root `README.md`**: local setup, prerequisites, and development commands.
- **`docs/` site (`_pages/`)**: public overview and links; defer detailed setup to root README.
- **`docs-md/wiki/`**: routing map for agents and contributors; not a second implementation spec.
- **`apps/README.md`**: app-level boundaries only; link to root README for setup.
