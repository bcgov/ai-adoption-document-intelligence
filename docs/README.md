# Documentation site

The public documentation site for the Document Intelligence Platform, published at https://bcgov.github.io/ai-adoption-document-intelligence/. It is built with [VitePress](https://vitepress.dev/) from the Markdown files in this folder.

## Run it locally

```bash
cd docs
npm install
npm run dev
```

`npm run build` writes the site to `.vitepress/dist/` and fails on links to pages that do not exist. `npm run preview` serves the built site.

## Layout

| Path | What it is |
| --- | --- |
| `*.md` | One file per page; `index.md` is the home page |
| `.vitepress/config.mts` | Site settings, navigation and sidebar |
| `.vitepress/theme/` | The default theme plus the `MermaidDiagram` and `RedocViewer` components |
| `_diagrams/` | Mermaid diagrams shared between pages |
| `public/openapi.json` | The OpenAPI document behind the API reference |
| `generate-openapi.ts` | Regenerates `public/openapi.json` from the backend; run `npm run generate:openapi` at the repository root |
| `wiki/` | Copy of `docs-md/wiki/`, made by `scripts/sync-docs-wiki.mjs` when the site runs or builds; not committed |
| `superpowers/` | Historical plans and specs; not part of the site |

How to add and write pages: [contributing.md](contributing.md), published as the site's "Contributing to the docs" page.

## Publishing

`.github/workflows/pages.yml` builds the site on pull requests that touch the docs, and publishes it to GitHub Pages on pushes to `main`. GitHub Pages must be set to deploy from GitHub Actions (repository Settings → Pages → Source).
