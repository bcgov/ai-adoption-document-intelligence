---
title: "Contributing to the docs"
---

# Contributing to the docs

This site is built with [VitePress](https://vitepress.dev/) from the Markdown files in the repository's `docs/` folder, and published to GitHub Pages by the `pages.yml` workflow.

## Run the site locally

```bash
cd docs
npm install
npm run dev
```

`npm run dev` copies the repo wiki into `docs/wiki/` and starts a local server that reloads as you edit. `npm run build` produces the published site in `docs/.vitepress/dist/`, and fails if a link between pages points at a page that does not exist.

## Where things live

| What | Where |
| --- | --- |
| Pages | `docs/*.md`, one file per page. The file name is the page's address. |
| Navigation and sidebar | `docs/.vitepress/config.mts` |
| Diagrams | `docs/_diagrams/*.md`, one Mermaid block per file |
| API reference | `docs/public/openapi.json`, regenerated from the backend with `npm run generate:openapi` at the repository root |
| Repo wiki | `docs-md/wiki/`. Edit the wiki there: `docs/wiki/` is a generated copy and is not committed. |

## Add a page

1. Create `docs/<name>.md` with a `title` in its frontmatter and one `#` heading.
2. Add the page to `nav` or `sidebar` (or both) in `docs/.vitepress/config.mts`.
3. Link to it from other pages as `./<name>.md`.

## Write a page

- **Callouts:** `::: info`, `::: tip`, `::: warning` and `::: details Title`, each closed with `:::`.
- **Diagrams:** write a fenced `mermaid` block, or include a shared diagram with `<!--@include: ./_diagrams/<name>.md-->`.
- **Section links:** VitePress gives every heading an anchor from its text. When other pages link to a section, give its heading a fixed anchor, `## Heading {#anchor}`, so rewording the heading does not break those links.
- **Vue syntax:** VitePress compiles each page as a Vue template. Put placeholders such as `<API_KEY>` inside backticks, and keep literal double curly braces inside code.

## Publishing

Pushes to `main` that change the docs build and deploy the site. Pull requests build it without deploying, so a broken page fails before merge.
