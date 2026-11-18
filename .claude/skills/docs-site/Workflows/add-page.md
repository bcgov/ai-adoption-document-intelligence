# Workflow: Add a New Page

1. **Choose the file name**: lowercase words joined by hyphens, such as `docs/my-guide.md`. It is published as `/my-guide`.

2. **Create the page** with a `title` in its frontmatter and one `#` heading (see [CONVENTIONS.md](../CONVENTIONS.md)).

3. **Add it to the navigation** in `docs/.vitepress/config.mts`:
   - a guide goes in the `guides` list, which feeds both the Guides menu and the sidebar;
   - a technical reference goes in the `technical` list;
   - anything else goes directly into `sidebar`, and into `nav` if it needs a top-level menu entry.

4. **Link to it** from related pages with `./my-guide.md`.

5. **Build** with `cd docs && npm run build`, and fix any dead links it reports.

6. **Add the page** to the Existing Pages table in [SKILL.md](../SKILL.md).
