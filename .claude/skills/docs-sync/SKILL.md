---
name: docs-sync
description: "Keeps docs-md/ and the repo wiki synchronized with the codebase: update docs affected by code changes, audit docs for accuracy, add new docs in the right topic folder, archive stale docs. Trigger phrases: sync docs, update docs for this change, audit docs, docs maintenance, archive doc, document this feature. Do NOT invoke for: editing the docs/ HTML site (use docs-site), writing feature requirements (use requirements-refiner), or wiki-only content questions (read docs-md/wiki/README.md directly)."
---

# Docs Sync

Maintains `docs-md/` (canonical developer reference docs, organized by topic) and `docs-md/wiki/` (routing layer for humans and LLM agents) so they stay accurate against the codebase.

## Workflows

| Task | Workflow |
| --- | --- |
| Code changed — update the affected docs | [Workflows/Ingest.md](Workflows/Ingest.md) |
| Verify docs are accurate against code (periodic or targeted) | [Workflows/Audit.md](Workflows/Audit.md) |
| Document something new | [Workflows/AddDoc.md](Workflows/AddDoc.md) |
| Retire a stale / point-in-time doc | [Workflows/Archive.md](Workflows/Archive.md) |

## Always Follow

1. Read [CONVENTIONS.md](CONVENTIONS.md) before editing any doc — it defines the topic taxonomy, naming, archive policy, and wiki boundary.
2. Docs describe **current shipped behavior only**. Verify every concrete claim (paths, commands, env vars, endpoints, model/field names) against code before writing it. Never document unverified or planned behavior without an explicit status disclaimer.
3. Canonical docs first, wiki second: update the `docs-md/` topic doc, then reflect routing/boundary changes in the wiki per `docs-md/wiki/README.md` (ingest workflow). The wiki never duplicates implementation detail.
4. After touching `docs-md/wiki/`: run `npm run docs:wiki:check`.
5. After moving/renaming/deleting any doc: run `bash .claude/skills/docs-sync/scripts/check-doc-links.sh` and fix reported dangling links; also grep code, READMEs, and `docs/_pages/` for references to the old path (`grep -rn "docs-md/<OLDNAME>" --include='*.ts' --include='*.md' --include='*.html' --include='*.sh' --include='*.yml' apps packages docs scripts tools deployments README.md`).
6. Use `git mv` for moves so history is preserved.
7. Never commit generated `docs/wiki*.html` (gitignored; built by `docs/build.sh` at deploy time).
