# Wiki Maintenance Log

Append wiki-level changes here. Keep entries short and link to canonical sources when useful.

Use grep-friendly headings: `## [YYYY-MM-DD] operation | Title` where operation is `ingest`, `query`, `lint`, or `maintenance`.

## [2026-06-17] ingest | Initial wiki seed

- Created the repo-only wiki compression layer under `docs-md/wiki/`.
- Added seed topic pages for system overview, graph workflows, HITL, auth/groups, and deployment/ops.
- Added a source registry and anti-bloat maintenance rules.
- Integrated the wiki into the generated `docs/` site as browsable `wiki*.html` pages.

## [2026-06-17] maintenance | Wiki operations and validation

- Documented ingest, query, and lint workflows in `docs-md/wiki/README.md`.
- Adopted grep-friendly `log.md` entry format and extended `scripts/validate-wiki.js` for links, index coverage, and source registry paths.
- Added `.github/workflows/wiki-check.yml` and removed maintainer-only `README.md` from docs site navigation.
