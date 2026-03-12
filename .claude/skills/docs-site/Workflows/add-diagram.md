# Add a Mermaid Diagram

## Steps

1. **Create the Mermaid source file** at `docs/_diagrams/<name>.mmd`:
   ```mermaid
   graph TD
       A[Start] --> B[Process]
       B --> C[End]
   ```

2. **Build the site** — the build script compiles all `.mmd` files to SVG:
   ```bash
   cd docs && bash build.sh
   ```
   This generates `docs/assets/<name>.svg`.

3. **Reference the diagram in a page** — use the img-container pattern:
   ```html
   <div class="img-container">
       <img src="assets/<name>.svg" alt="Description of diagram">
       <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">
           Caption text
       </p>
   </div>
   ```

   Or, to add it to the diagrams viewer page (`docs/_pages/diagrams.html`), add a new diagram card following the existing pattern in that file.

4. **Verify** — confirm the SVG was generated in `docs/assets/`

## Updating an Existing Diagram

1. Edit the `.mmd` file in `docs/_diagrams/`
2. Rebuild — the SVG will be regenerated

## Mermaid Config

The shared config is at `docs/_diagrams/mermaid.config.json`. It applies to all diagrams during build.

## Common Pitfalls

- The build requires `@mermaid-js/mermaid-cli` (installed via npx automatically)
- Large diagrams may need the Mermaid `%%{init: {'theme': 'base'}}%%` directive for readability
- SVG output goes to `docs/assets/` — reference with `assets/` prefix in page HTML