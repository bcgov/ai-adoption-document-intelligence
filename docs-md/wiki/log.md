# Wiki Maintenance Log

Append wiki-level changes here. Keep entries short and link to canonical sources when useful.

Use grep-friendly headings: `## [YYYY-MM-DD] operation | Title` where operation is `ingest`, `query`, `lint`, or `maintenance`.

## [2026-06-17] ingest | Initial wiki seed

- Created the wiki compression layer under `docs-md/wiki/`.
- Added seed topic pages for system overview, graph workflows, HITL, auth/groups, and deployment/ops.
- Added a source registry and anti-bloat maintenance rules.
- Wiki pages publish to the docs site as generated `wiki*.html` at deploy time (not committed).

## [2026-06-17] maintenance | Wiki operations and validation

- Documented ingest, query, and lint workflows in `docs-md/wiki/README.md`.
- Adopted grep-friendly `log.md` entry format and extended `scripts/validate-wiki.js` for links, index coverage, and source registry paths.
- Added `.github/workflows/wiki-check.yml` and removed maintainer-only `README.md` from docs site navigation.

## [2026-06-17] maintenance | Wiki markdown renderer

- Replaced custom Markdown-to-HTML body parser with `marked` in `scripts/build-docs-wiki.js`.
- Kept custom frontmatter cards, sidebar nav, and wiki link rewriting.

## [2026-06-17] ingest | Topic pages and cross-links

- Added wiki topic pages for blob storage, tables/extensions, and workflow builder.
- Linked repo wiki from root `README.md` and expanded `index.md`.
- Added Related Topics cross-links across all active topic pages.

## [2026-06-17] maintenance | Deploy-time wiki HTML and agent parity

- Stopped committing generated `docs/wiki*.html`; build via `docs/build.sh` at docs deploy (`.github/workflows/pages.yml`).
- Added `AGENTS.md` and wiki rules to `.github/copilot-instructions.md`.
- Added PR template wiki checklist item and `paths:` filters to `wiki-check.yml`.
- Added wiki topic routing table to `sources.md`.

## [2026-06-19] maintenance | Documentation audit fixes

- Removed embedded API key from contributor docs; canonical wiki rules consolidated in `AGENTS.md`.
- Untracked generated `docs/wiki*.html`; fixed root README compose paths and docs site quick start.
- Updated API key module references (`actor/`, `auth/`); deduplicated workflow builder guide.
- Documented docs build dependencies and documentation ownership in wiki open questions.

## [2026-06-20] maintenance | Documentation audit phases 1–3

- Phase 1: fixed dev script scope, Prisma order, monitoring compose paths, docs site stats, TESTING.md scripts.
- Phase 2: aligned workflow builder claims, wiki auth sources (`actor/`), docs build description.
- Phase 3: trimmed `apps/README.md`, aligned copilot with CLAUDE Swagger/API rules, added `docs-md/ARCHIVE.md`.

## [2026-06-20] lint | Holistic docs-vs-code alignment

- Verified backend routes, workflow engine, auth, and blob storage against code via exploration.
- Fixed API keys are group-scoped (not per user) in README and backend README.
- Replaced stale workflow node catalog (Start/OCR/HTTP/End) with real graph node types (`activity`, `switch`, `map`, `join`, `childWorkflow`, `pollUntil`, `humanGate`) in README and frontend README.
- Migrated labeling/training docs to the template-models API: README endpoints/tree, backend README, frontend README pages, `DATABASE_SERVICES.md`, and the `GROUP_RESOURCE_AUTHORIZATION.md` route tables.
- Fixed broken `TEMPLATE_TRAINING.md` links to `TEMPLATE_MODELS.md`.
- Noted workflow form editor (default) alongside JSON + read-only React Flow in wiki and READMEs.
