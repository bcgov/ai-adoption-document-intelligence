# Workflow: Edit an Existing Page

1. **Find the page**: `docs/<name>.md`. The Existing Pages table in [SKILL.md](../SKILL.md) lists them.

2. **Read the whole page**, including its frontmatter.

3. **Edit it** following [CONVENTIONS.md](../CONVENTIONS.md). Keep the fixed anchors (`{#...}`) on headings, because other pages link to them.

4. **Check the result**: preview with `cd docs && npm run dev`, then build with `npm run build`. The build fails on links to pages that do not exist.

The wiki pages under `/wiki/` come from `docs-md/wiki/`. To change one, edit `docs-md/wiki/` and follow the [documentation](../../documentation/SKILL.md) skill.
