# AddDoc — document something new

Use when a shipped subsystem/feature has no reference doc.

## Steps

1. **Confirm it's a real gap.** Search existing docs first — coverage may live under a non-obvious name:
   ```bash
   grep -rlni "<subsystem keywords>" docs-md --include='*.md'
   ```
   If a doc partially covers it, extend that doc instead of creating a near-duplicate.

2. **Research the code** until you can describe the shipped behavior: entry points, key modules, data flow, configuration. Verify everything you plan to state.

3. **Pick folder and name** from the taxonomy in [CONVENTIONS.md](../CONVENTIONS.md): `docs-md/<topic>/<SCREAMING_SNAKE>.md`.

4. **Write the doc.** Match the conventions of 2–3 neighbors in the folder. Typical shape: title, short overview, key code paths, how it works / how to use it, configuration (env vars, keys), links to related docs. Shipped behavior only — no placeholders, no future-work sections.

5. **Link it into the system:**
   - Cross-link from the most related existing docs where a reader would need it.
   - If `docs-md/README.md`'s folder description no longer covers the folder's contents, update it.
   - Wiki: if the doc adds a canonical area, add it to the relevant topic page's `canonical_sources` and to `docs-md/wiki/sources.md`; log an `ingest` entry in `docs-md/wiki/log.md`.

6. **Verify:**
   ```bash
   npm run docs:wiki:check
   bash .claude/skills/docs-sync/scripts/check-doc-links.sh
   ```

## Common Pitfalls

- Writing a doc for something `feature-docs/` already specs — feature-docs is requirements history; the new doc describes shipped behavior and should not copy requirements text.
- Duplicating a runbook into the wiki — the wiki only routes to it.
- Document-type-specific guidance — the platform is generic; keep examples generic.
