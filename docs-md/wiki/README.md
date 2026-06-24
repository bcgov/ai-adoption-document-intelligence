# Repo Wiki

This wiki is a repo-focused source-of-truth map for humans and LLMs. It compresses the documentation surface by pointing to canonical docs and code paths, then adding only the synthesis needed to understand how those sources relate.

The wiki is rendered into the generated `docs/` site as `wiki.html` and related `wiki-*.html` pages using [marked](https://marked.js.org/) for Markdown conversion. Generated wiki HTML is **not committed**; `docs/build.sh` produces it at docs deploy time (see `.github/workflows/pages.yml`).

## Purpose

- Give contributors a short map of the system before they drill into detailed docs.
- Help LLM agents find canonical sources without duplicating implementation detail.
- Track drift risks, contradictions, and unresolved ownership in one visible place.
- Reduce documentation bloat by linking to existing runbooks, specs, schemas, and code.

## Anti-Bloat Rules

- Keep topic pages short; 180 lines is the soft limit.
- Link to canonical docs instead of copying runbooks, endpoint lists, schemas, or implementation guides.
- Add synthesis only when it explains relationships across multiple sources.
- If a wiki page becomes canonical for implementation detail, promote that content into `docs-md` and collapse the wiki page back to a map.
- Delete or merge stale pages instead of preserving historical summaries.

## Page Types

- `index.md`: curated entrypoint and reading map.
- `sources.md`: registry of canonical docs and code areas.
- `log.md`: append-only history of wiki maintenance.
- `open-questions.md`: unresolved contradictions, drift candidates, and ownership gaps.
- Topic pages: short synthesis pages with frontmatter and canonical source links.

## Topic Page Frontmatter

Every topic page must include:

```md
---
status: active
updated: 2026-06-17
canonical_sources:
  - docs-md/example.md
  - apps/example/src/
do_not_duplicate:
  - Full runbooks
  - API endpoint details
---
```

Use `status: active` for current pages and `status: archived` for pages retained only as routing context.

## Operations

Agents and contributors should use these three workflows. Full rules live in this file; `CLAUDE.md` points agents here.

### Ingest

Run after canonical docs or code change in a way that affects navigation, boundaries, or drift risks.

1. Update the canonical source first (`docs-md/`, code, or README).
2. Update the relevant wiki topic with routing context, cross-links, and drift notes only.
3. Update `sources.md` when new canonical areas appear.
4. Add a `log.md` entry with operation `ingest`.
5. Record unresolved contradictions in `open-questions.md`.
6. Run `npm run docs:wiki:check`.

Do not copy runbooks, schemas, or endpoint lists into topic pages during ingest.

### Query

Run before answering questions that depend on repo structure, ownership, or where to edit.

1. Read `index.md` to find the relevant topic page.
2. Read that topic page and follow its `canonical_sources`.
3. Answer from canonical sources; use the wiki only for orientation and cross-topic relationships.
4. If the answer required new synthesis that will be reused, add it to the relevant topic page (not chat-only) and log with operation `query`.

### Lint

Run periodically or before wiki PRs.

1. Run `npm run docs:wiki:check` (validates frontmatter, links, index coverage, and source paths).
2. Review `open-questions.md` for stale drift candidates and contradictions.
3. Confirm active topic pages are still linked from `index.md` and remain under the line limit.
4. Promote any topic page that grew into a full spec back into `docs-md/` and collapse the wiki page to a map.
5. Add a `log.md` entry with operation `lint` when structure or registry changes result from the pass.

## Log Format

Append grep-friendly entries to `log.md`:

```md
## [2026-06-17] ingest | Graph workflow routing update

- Updated graph-workflows topic after activity registry change.
```

- Prefix every entry with `## [YYYY-MM-DD] <operation> | <title>`.
- Use `ingest`, `query`, `lint`, or `maintenance` for `<operation>`.
- List details as bullets under the heading.
- Recent entries: `grep '^## \\[' docs-md/wiki/log.md | tail -5`

## Maintenance Workflow

1. Update canonical docs or code first.
2. Update the relevant wiki topic only with routing context, cross-links, and drift notes.
3. Add maintenance notes to `log.md` when the wiki structure or source registry changes.
4. Record contradictions or ownership questions in `open-questions.md`.
5. Run `npm run docs:wiki:check` before opening a PR that changes the wiki.
6. Do not commit generated `docs/wiki*.html`; the docs deploy workflow builds them via `docs/build.sh`.
