# Add a New Page

## Steps

1. **Choose a filename** — use kebab-case: `my-new-page.html`

2. **Read CONVENTIONS.md** — load `CONVENTIONS.md` for available CSS classes and patterns

3. **Create the page file** at `docs/_pages/<filename>.html`:
   ```html
   <!-- TITLE: My New Page -->
   <!-- NAV: mynewpage -->

   <h1>My New Page</h1>
   <p>Introductory paragraph.</p>

   <!-- Page content here using components from CONVENTIONS.md -->
   ```

   The NAV ID must be a single word (letters only, no hyphens). Convention is the page name with hyphens removed: `benchmarking-guide` → `BENCHMARKINGGUIDE`.

4. **Register the NAV variable in `docs/build.sh`** — add a cleanup line after the existing ones:
   ```bash
   header="${header//\{\{NAV_MYNEWPAGE\}\}/}"
   ```
   Add it in the block near line 76-82 where other NAV variables are cleared.

5. **Add navigation link in `docs/_partials/header.html`** — find the appropriate nav section and add a link:
   ```html
   <a href="my-new-page.html" class="{{NAV_MYNEWPAGE}}">My New Page</a>
   ```
   Place it either as a top-level nav item or inside an existing dropdown (Guides or Technical Documentation).

6. **Build the site** — run:
   ```bash
   cd docs && bash build.sh
   ```

7. **Verify** — confirm the build completed without errors and the new page appears in navigation

## Common Pitfalls

- NAV ID must be UPPERCASE in `build.sh` (`NAV_MYNEWPAGE`) but lowercase in the page metadata (`<!-- NAV: mynewpage -->`) — the build script uppercases it automatically
- Forgetting to add the NAV cleanup line in `build.sh` — leftover `{{NAV_MYNEWPAGE}}` text will appear in the rendered HTML
- Forgetting to add the nav link in `header.html` — page exists but is unreachable from navigation