# Archive — retire a stale or point-in-time doc

Use when a doc stops describing current behavior: completed plans and status trackers, one-off reports/analyses, docs for removed code.

## Steps

1. **Confirm it qualifies.** Archive policy is in [CONVENTIONS.md](../CONVENTIONS.md). If only parts are stale, fix the doc instead ([Audit.md](Audit.md)). Delete outright only when a doc has no historical value (rare).

2. **Move with history:**
   ```bash
   git mv docs-md/<topic>/<DOC>.md docs-md/archive/<DOC>.md
   ```

3. **Update `docs-md/archive/README.md`:** add a row to the Contents table — what it was, and the canonical alternative (the doc/code that now answers those questions).

4. **Repair inbound references.** Find everything pointing at the old path and either re-point to the canonical alternative or to the archive path (for historical citations):
   ```bash
   grep -rn "<DOC>.md" --include='*.md' --include='*.ts' --include='*.tsx' --include='*.html' --include='*.sh' --include='*.yml' --include='*.yaml' apps packages docs docs-md scripts tools deployments README.md .claude
   ```

5. **Wiki:** remove the doc from any `canonical_sources` lists and `sources.md`; if a whole topic became historical, set the topic page `status: archived`. Append a `maintenance` entry to `docs-md/wiki/log.md`.

6. **Verify:**
   ```bash
   npm run docs:wiki:check
   bash .claude/skills/docs-sync/scripts/check-doc-links.sh
   ```

## Common Pitfalls

- Leaving the archived doc listed as a canonical source in the wiki — the validator may pass (file still exists) but routing is now wrong.
- Archiving a doc that is the only coverage of still-shipped behavior — extract the still-true content into the topic folder first.
- Using `mv` instead of `git mv`, losing file history.
