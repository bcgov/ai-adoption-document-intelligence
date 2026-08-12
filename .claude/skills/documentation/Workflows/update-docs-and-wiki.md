# Update Docs and Wiki

Run after implementing a feature or changing system boundaries, APIs, setup, or contributor routing.

## Steps

1. **Decide what needs documentation:**

- Behavior, APIs, configuration, or operational steps changed → update the relevant `docs-md/` guide (or create one if none exists).
- Setup or root commands changed → update root `README.md`.
- App module boundaries changed → update `apps/README.md` (boundaries only).
- Public marketing/overview pages need a link or summary → use [docs-site](../../docs-site/SKILL.md).
- System boundaries, doc routing, ownership, or where contributors should edit changed → wiki ingest (step 3).
- Historical/feature-only material → prefer `docs-md/ARCHIVE.md` guidance; do not treat `feature-docs/` as implementation truth.

2. **Update canonical sources first:**

- Edit the stable doc or README that owns the detail.
- Keep changes proportional; do not duplicate the same guide across layers.
- Link between related docs instead of copying.

3. **Wiki ingest (when routing or boundaries changed):**

1. Read `docs-md/wiki/index.md` and the relevant topic page.
2. Update the topic with routing context, cross-links, and drift notes only.
3. Update `docs-md/wiki/sources.md` if new canonical areas appear.
4. Append a grep-friendly entry to `docs-md/wiki/log.md`:

```md
## [YYYY-MM-DD] ingest | Short title

- What changed and why.
```

5. Record unresolved contradictions in `docs-md/wiki/open-questions.md`.
6. Run:

```bash
npm run docs:wiki:check
```

Do **not** copy runbooks, schemas, or endpoint lists into topic pages.

4. **If only answering a structural question (query workflow):**

- Read `index.md` → topic → `canonical_sources`.
- Answer from canonical sources.
- If new reusable synthesis emerged, add it to the topic page and log with operation `query`.

5. **Before opening a PR:**

- Confirm the PR checklist documentation item is accurate (updated or confirmed not needed).
- Use the [create-pr](../../create-pr/SKILL.md) skill when the user asks to open the PR.

## Common Pitfalls

- Putting implementation detail only in the wiki (promote to `docs-md/` and keep the wiki as a map)
- Skipping `log.md` or `docs:wiki:check` after wiki edits
- Committing generated `docs/wiki*.html`
- Updating the public `docs/` site for contributor implementation detail that belongs in `docs-md/`
