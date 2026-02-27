---
name: docs-site
description: >
  Edit, create, and manage pages on the project's documentation site (docs/).
  Trigger phrases: "edit docs site", "update docs page", "add docs page",
  "add diagram", "update documentation site", "docs site".
  Do NOT invoke for: editing files in /docs-md/ (those are developer markdown
  reference docs, not the HTML site), general code changes, or README edits.
---

# Documentation Site Skill

This skill manages the HTML documentation site at `docs/`.

## Site Architecture

- **Custom Bash build system** — no framework, zero dependencies
- Source pages live in `docs/_pages/*.html` (HTML fragments, no `<html>` wrapper)
- `docs/_partials/header.html` and `footer.html` wrap every page
- `docs/build.sh` combines partials + page content, replacing `{{VARIABLES}}`
- Mermaid diagrams in `docs/_diagrams/*.mmd` compile to `docs/assets/*.svg`
- Output HTML files land in `docs/` root for GitHub Pages

## Existing Pages

| File | NAV ID | Title |
|------|--------|-------|
| index.html | INDEX | Home |
| api-reference.html | API | API Reference |
| authentication.html | AUTHENTICATION | Authentication |
| benchmarking-guide.html | BENCHMARKINGGUIDE | Benchmarking Guide |
| benchmarking-technical.html | BENCHMARKINGTECHNICAL | Benchmarking Architecture |
| diagrams.html | DIAGRAMS | Diagrams |
| integrations.html | INTEGRATIONS | Integrations |

## Workflows

- [Edit an existing page](Workflows/edit-page.md) — modify content on a docs page
- [Add a new page](Workflows/add-page.md) — create a brand new docs page with nav entry
- [Add a Mermaid diagram](Workflows/add-diagram.md) — add/update an SVG diagram

## Always Follow

- Read [CONVENTIONS.md](CONVENTIONS.md) before writing any HTML content
- Pages are **HTML fragments** — never add `<html>`, `<head>`, or `<body>` tags
- First two lines of every page must be metadata comments:
  ```html
  <!-- TITLE: Page Title -->
  <!-- NAV: navid -->
  ```
- After editing, always build with: `cd docs && bash build.sh` (from repo root)
- Do NOT create wrapper scripts or duplicate existing scripts — use `docs/build.sh` directly
- Template variables available in page content: `{{YEAR}}`, `{{CURRENT_MONTH}}`, `{{CURRENT_DATE}}`