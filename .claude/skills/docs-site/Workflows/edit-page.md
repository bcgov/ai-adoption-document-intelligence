# Edit an Existing Page

## Steps

1. **Identify the page** — find the source file in `docs/_pages/`:
   ```
   docs/_pages/index.html
   docs/_pages/api-reference.html
   docs/_pages/authentication.html
   docs/_pages/benchmarking-guide.html
   docs/_pages/benchmarking-technical.html
   docs/_pages/diagrams.html
   docs/_pages/integrations.html
   ```

2. **Read the source file** — use the Read tool on `docs/_pages/<page>.html`

3. **Read CONVENTIONS.md** — load `CONVENTIONS.md` for available CSS classes and HTML patterns

4. **Edit the page** — use the Edit tool to modify `docs/_pages/<page>.html`
   - Do NOT touch the `<!-- TITLE: ... -->` or `<!-- NAV: ... -->` metadata lines unless renaming
   - Do NOT add `<html>`, `<head>`, or `<body>` tags

5. **Build the site** — run:
   ```bash
   cd docs && bash build.sh
   ```

6. **Verify** — confirm the build completed without errors

## Common Pitfalls

- Editing `docs/<page>.html` directly instead of `docs/_pages/<page>.html` — the root files are **build output** and get overwritten
- Adding framework-specific syntax (JSX, Vue, etc.) — pages are plain HTML only
- Forgetting to build after editing — the output files won't update until build runs