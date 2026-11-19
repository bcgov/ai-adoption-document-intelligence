# Documentation Site Conventions

## Page Structure

Every page starts with frontmatter holding its title, followed by one `#` heading:

```md
---
title: "My Page Title"
---

# My Page Title

Introductory paragraph.
```

`index.md` uses VitePress's `home` layout: its hero and feature cards are set in frontmatter. `api-reference.md` uses the `page` layout so that Redoc gets the full width.

## Headings and Anchors

- Use `##` for sections and `###` for subsections; the "On this page" outline shows both levels.
- VitePress makes an anchor from each heading's text. When other pages link to a section, give it a fixed anchor so rewording the heading does not break those links: `## Upload Request Fields {#upload-fields}`.

## Links

- Between pages, use relative Markdown links: `[Integrations Guide](./integrations.md#upload-fields)`. The build fails if the target page does not exist.
- To the wiki: `./wiki/` for its index, `./wiki/<page>.md` for a page.
- Put local addresses such as `http://localhost:3000` in backticks. As plain text they become links, and the build fails on them.

## Callouts

```md
::: info Title
Neutral information.
:::

::: tip Title
A recommendation, or a pointer to another page.
:::

::: warning Title
A caution.
:::

::: details Title
Content that starts collapsed.
:::
```

## Badges

`<Badge type="info" text="ongoing_ocr" />`. Types: `info`, `tip`, `warning`, `danger`.

## Code

Fence code with its language: ` ```bash `, ` ```json `, ` ```ts `. Use a plain ` ``` ` fence for output and plain text.

## Tables

Use GitHub-style pipe tables. Escape a literal pipe inside a cell as `\|`; an unescaped pipe starts a new column and pushes the rest of the row out of the table.

## Diagrams

- A fenced `mermaid` block is drawn in the page, in the reader's light or dark theme, with an **Open full size** link under it.
- A diagram used on more than one page lives in `docs/_diagrams/<name>.md` and is included with `<!--@include: ./_diagrams/<name>.md-->`.

## Vue Syntax

VitePress compiles every page as a Vue template:

- Put placeholders in angle brackets, such as `<API_KEY>`, inside backticks or code blocks. In plain text they are read as HTML tags and disappear.
- Keep literal double curly braces inside code; in plain text they are read as Vue expressions.
