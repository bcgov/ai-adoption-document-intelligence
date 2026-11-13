---
name: docs-site
description: Edit, create, and manage pages on the project's documentation site (docs/, built with VitePress). Trigger phrases: "edit docs site", "update docs page", "add docs page", "add diagram", "update documentation site", "docs site". Do NOT invoke for: editing files in /docs-md/ (those are developer reference docs, not the documentation site), general code changes, or README edits.
---

# Documentation Site Skill

This skill manages the documentation site in `docs/`, built with [VitePress](https://vitepress.dev/) and published to GitHub Pages by `.github/workflows/pages.yml`.

## Site Architecture

- Pages are Markdown files in `docs/`; `docs/<name>.md` is published as `/<name>`
- `docs/.vitepress/config.mts` holds the site settings, the top navigation and the sidebar
- `docs/.vitepress/theme/` extends the default theme with two components: `MermaidDiagram`, which draws fenced `mermaid` blocks, and `RedocViewer`, which renders the API reference
- Diagrams shared between pages live in `docs/_diagrams/*.md`, one Mermaid block each
- `docs/public/openapi.json` feeds the API reference; regenerate it with `npm run generate:openapi` at the repository root
- The repo wiki is copied in from `docs-md/wiki/` by `scripts/sync-docs-wiki.mjs` whenever the site runs or builds; never edit `docs/wiki/`
- `docs/superpowers/` and `docs/README.md` are excluded from the site
- The site has its own `docs/package.json` and `docs/.npmrc`; install with `cd docs && npm install`

## Existing Pages

| File | Title | Menu |
|------|-------|------|
| index.md | Documentation Hub (home) | Home |
| integrations.md | Integrations Guide | Guides |
| integration-tutorial.md | From Zero to Integration | Guides |
| benchmarking-guide.md | Benchmarking Guide | Guides |
| authentication.md | Authentication Architecture | Technical Documentation |
| benchmarking-technical.md | Benchmarking Architecture | Technical Documentation |
| api-reference.md | API Reference | API Reference |
| diagrams.md | Architecture Diagrams | Diagrams |
| contributing.md | Contributing to the docs | sidebar only |

## Workflows

- [Edit an existing page](Workflows/edit-page.md) — modify content on a docs page
- [Add a new page](Workflows/add-page.md) — create a page and add it to the navigation
- [Add a Mermaid diagram](Workflows/add-diagram.md) — add or update a diagram

## Always Follow

- Read [CONVENTIONS.md](CONVENTIONS.md) before writing page content
- Preview with `npm run dev` in `docs/`
- Build with `npm run build` in `docs/` after editing; the build fails on links to pages that do not exist
- VitePress is the only build: do not add HTML page fragments, wrapper scripts or generated HTML
