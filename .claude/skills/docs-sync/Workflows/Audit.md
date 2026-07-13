# Audit — verify docs against the codebase

Use for a periodic accuracy pass, or a targeted check of one topic folder ("audit the monitoring docs").

## Steps

1. **Pick scope.** One doc, one topic folder, or all of `docs-md/` (excluding `archive/` and `wiki/`).

2. **For each doc, verify concrete claims against code.** Check with Grep/Read — never from memory:
   - file/directory paths exist
   - commands and npm scripts exist and are spelled right
   - env var names match code (`grep -rn "process.env.<NAME>"` / config files)
   - API endpoints, methods, and DTOs match controllers
   - Prisma model/field names match `apps/shared/prisma/schema.prisma`
   - workflow node types and activity names match the registries in `apps/temporal/src/` and `packages/graph-workflow/`
   - helm values, ports, manifest paths match `deployments/`

3. **Fix in place.** Surgical edits; preserve the doc's voice. Don't restructure working content. Content explicitly marked as target design / design reference keeps its content — verify the status disclaimer is still accurate instead.

4. **Classify outcomes:**
   - accurate → done
   - fixed → done
   - describes removed code or is point-in-time → run [Archive.md](Archive.md)
   - reveals an undocumented subsystem → run [AddDoc.md](AddDoc.md)

5. **For large scopes** (whole tree), fan out subagents — one per doc or per folder batch — each with the checklist above, returning findings + fixes. Cross-check anything a subagent flags as uncertain yourself.

6. **Verify and record:**
   ```bash
   npm run docs:wiki:check
   bash .claude/skills/docs-sync/scripts/check-doc-links.sh
   ```
   If wiki structure or the source registry changed, append a `lint` entry to `docs-md/wiki/log.md`.

## Common Pitfalls

- Trusting a doc's own cross-references as evidence — verify against code, not other docs.
- "Fixing" intentionally deferred abstractions: this team defers abstractions until a documented duplication threshold; their absence is not an inaccuracy or a gap.
- Deleting design-reference content because it isn't implemented — it's kept intentionally with a status disclaimer.
