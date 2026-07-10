# Ingest — update docs after a code change

Use when code changed (a diff, a merged PR, a feature you just implemented) and the docs must catch up.

## Steps

1. **Scope the change.** List what actually changed:
   ```bash
   git diff --stat <base>...HEAD   # or the working-tree diff
   ```
   Identify affected surfaces: endpoints, env vars, Prisma models, workflow nodes/activities, UI routes, deploy manifests, npm scripts.

2. **Find the affected docs.** Map each changed surface to its topic folder (taxonomy in [CONVENTIONS.md](../CONVENTIONS.md)). Search rather than guess:
   ```bash
   grep -rln "<changed symbol/path/env var>" docs-md --include='*.md'
   ```
   Check `docs-md/<topic>/` listings for docs whose subject overlaps the change.

3. **Update each affected doc.** Verify the new behavior in code first, then edit. Follow the content rules in CONVENTIONS.md. If the change makes a whole doc obsolete, switch to [Archive.md](Archive.md). If the change introduces a new undocumented subsystem, switch to [AddDoc.md](AddDoc.md).

4. **Wiki ingest** (only if the change affects navigation, boundaries, or drift risks — most small changes don't):
   - Update the relevant `docs-md/wiki/<topic>.md` routing context and `canonical_sources`; bump its `updated:` date.
   - Update `docs-md/wiki/sources.md` if new canonical areas appeared.
   - Append to `docs-md/wiki/log.md`: `## [YYYY-MM-DD] ingest | <title>`.
   - Record contradictions in `docs-md/wiki/open-questions.md`.

5. **Verify:**
   ```bash
   npm run docs:wiki:check
   bash .claude/skills/docs-sync/scripts/check-doc-links.sh
   ```

## Common Pitfalls

- Updating the wiki but not the canonical doc — canonical source first, always.
- Documenting the diff instead of the resulting behavior. Docs describe the current state, not the change history.
- Forgetting non-markdown references: code comments, seed scripts, and configmaps reference `docs-md/` paths too.
