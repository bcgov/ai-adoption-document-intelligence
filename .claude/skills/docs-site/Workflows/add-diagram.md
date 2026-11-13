# Workflow: Add a Mermaid Diagram

1. **Write the diagram** as a fenced `mermaid` block. [Mermaid's live editor](https://mermaid.live) is useful for checking the syntax.

2. **Used on one page only?** Put the block directly in that page.

3. **Used on several pages, or on the Diagrams page?** Create `docs/_diagrams/<name>.md` containing only the fenced block, and include it wherever it is needed:

   ```md
   <!--@include: ./_diagrams/<name>.md-->
   ```

4. **Add it to the Diagrams page** (`docs/diagrams.md`): a `##` heading with a fixed anchor, a one-line summary, the include, and a short description of what the diagram shows.

5. **Check it draws**: run `cd docs && npm run dev` and open the page. A syntax error appears in red where the diagram should be.
