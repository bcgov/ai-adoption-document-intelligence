# Can PR #240 be merged into develop?

**Yes — merge as-is. The fix is correct and I verified it end-to-end against a real Postgres shadow database. Two small follow-up chores (a doc line and a stray blank line); neither blocks the merge.** — I reproduced the bug and the fix with Prisma's own drift engine. On develop today, `prisma migrate dev` generates a migration containing `DROP INDEX documents_title_trgm_idx` and `DROP INDEX documents_original_filename_trgm_idx`. With this PR's schema applied, the same command reports 'This is an empty migration.' That is the whole claim of the PR, confirmed rather than assumed.

## Background

The documents list endpoint supports a leading-wildcard ILIKE search over title and
original_filename. A B-tree index cannot serve `ILIKE '%term%'`, so two trigram GIN
indexes back it. They were created in June by a hand-written SQL migration
(20260626000000_add_documents_list_indexes) because at the time the belief was that
Prisma could not express GIN/trigram indexes. Since the schema did not declare them,
Prisma considered them foreign and every `migrate dev` run wanted to drop them — the
schema carried a comment literally pleading 'Do not let migrate dev drop them', which is
a convention, not a defence. This PR declares both indexes natively using Prisma's
`type: Gin` plus `ops: raw("gin_trgm_ops")` (generally available since Prisma 4; the
repo is on 7.2.0), so Prisma now recognises the indexes it previously wanted to delete.
One file, one commit, +4/-6.

## Your call — 1 decision

**Merge PR #240 as-is?**
Recommend yes. Schema-only change, no runtime behaviour, no client API change, no data
migration, nothing touching auth or tenancy. The derived DDL is character-identical to
the SQL already applied in production, so no index is rebuilt on existing databases.
  - Merge as-is (recommended)
  - Ask for the doc fix in the same PR first

## Chores

- [ ] (agent) Update docs-md/architecture/DATABASE_SERVICES.md — it still states the trigram indexes 'cannot be expressed in schema.prisma' — Line ~189. This PR falsifies that sentence. The repo's CLAUDE.md requires docs to be updated alongside behaviour changes. One-paragraph edit; can go in this PR or a follow-up.
- [ ] (agent) Delete the blank line the PR added at schema.prisma line 67 — Cosmetic but real: with that blank line present, `prisma format` relocates the four-line purge-index comment up into the field block, where it reads as a comment on the workflowVersion relation. I verified this — formatting the base schema moves it 0 lines, formatting the PR schema moves it. Removing the blank line resolves it.
- [ ] (agent) Do NOT 'tidy' the now-stale comment inside 20260626000000_add_documents_list_indexes/migration.sql — That migration's header still says 'Prisma cannot express GIN/trigram indexes, so they are managed in this migration', which is now untrue and is a natural thing for the next person to want to fix. Prisma checksums applied migration files in the _prisma_migrations table, so editing it — even a comment — makes `migrate status` and `migrate deploy` fail with a modified-migration error. Leave the file alone; correct the record in the schema comment and the doc instead.

## What is actually in it

### Core claim verified against a real shadow database — the fix does exactly what it says  — _Confirmed. Merge._

I ran Prisma's own drift engine (`prisma migrate diff --from-migrations <develop's
migrations> --to-schema <schema>`) against a throwaway Postgres shadow database, once
with develop's schema and once with the PR's. This is the same computation `migrate dev`
performs to decide what migration to write. Develop emits two DROP INDEX statements; the
PR emits an empty migration. Note the first time I ran this I pointed it at my own
working tree's migrations directory, which belongs to a different feature branch and
produced spurious drift; the numbers below are from develop's actual migrations
directory.

`prisma migrate diff --from-migrations (develop) --to-schema (develop schema)`
```sql
-- DropIndex
DROP INDEX "documents_original_filename_trgm_idx";
-- DropIndex
DROP INDEX "documents_title_trgm_idx";
```
BEFORE — this is what `prisma migrate dev` generates on develop today. The bug AI-1653
describes, reproduced.

`prisma migrate diff --from-migrations (develop) --to-schema (PR #240 schema)`
```sql
-- This is an empty migration.
```
AFTER — with this PR applied. Zero drift across the entire schema, not just the two
indexes.

### The derived DDL is character-identical to the SQL already applied in production  — _Confirmed — no index rebuild, no downtime risk._

The risk with declaring an existing index in Prisma is a near-miss: a different index
name or a different operator class makes Prisma drop and recreate it, which on a large
documents table means a write lock. There is no near-miss here. I generated the full DDL
Prisma derives from the PR's schema and compared it to the hand-written migration; the
index names and definitions match exactly, and the whole-schema DDL delta between
develop and the PR is precisely these two lines and nothing else. The `name:` argument
on `@@index` is accepted by Prisma 7.2.0, produces the correct database-level index
name, and emits no deprecation warning (`map:` is the more modern spelling, but `name:`
is not wrong).

`apps/shared/prisma/migrations/20260626000000_add_documents_list_indexes/migration.sql`
```sql
CREATE INDEX IF NOT EXISTS "documents_title_trgm_idx"
  ON "documents" USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "documents_original_filename_trgm_idx"
  ON "documents" USING GIN ("original_filename" gin_trgm_ops);
```
What is actually in the database (hand-written, June).

`DDL Prisma derives from the PR's schema.prisma`
```sql
CREATE INDEX "documents_title_trgm_idx" ON "documents" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "documents_original_filename_trgm_idx" ON "documents" USING GIN ("original_filename" gin_trgm_ops);
```
Identical modulo IF NOT EXISTS. Prisma will leave the existing indexes untouched.

### The whole change, in full — this is the entire diff  — _Complete inventory: 1 file, +4/-6._

apps/shared/prisma/schema.prisma is the only changed path in the true base-to-head diff
(computed via git merge-tree, not the PR page's stats). The removed lines are the
obsolete comment explaining why the indexes could not be declared; the added lines
declare them. The adjacent partial-index comment is untouched and still correct — Prisma
genuinely cannot express partial indexes, so documents_purge_scan_idx remains migration-
managed.

`apps/shared/prisma/schema.prisma:64-73`
```diff
-  //
-  // Trigram GIN indexes `documents_title_trgm_idx` /
-  // `documents_original_filename_trgm_idx` back the list endpoint's ILIKE
-  // search. Prisma cannot express GIN/trigram indexes, so they are managed via
-  // the raw SQL migration 20260626000000_add_documents_list_indexes. Do not let
-  // `migrate dev` drop them.
+
+  // Native GIN Trigram indexes using raw operator classes
+  @@index([title(ops: raw("gin_trgm_ops"))], type: Gin, name: "documents_title_trgm_idx")
+  @@index([original_filename(ops: raw("gin_trgm_ops"))], type: Gin, name: "documents_original_filename_trgm_idx")
```
The added blank line on the first + is the one worth deleting (see chores).

### The PR description's reasoning about the preview flag is muddled, but the conclusion is right  — _Not a defect. No change required._

The description says a preview-features flag was intentionally omitted 'as CrunchyDB
already has the needed extension by default'. That conflates two separate Prisma
features. What this change actually relies on is extendedIndexes (the `type: Gin` and
`ops: raw()` syntax), which has been generally available since Prisma 4 and needs no
flag at all — the extension has nothing to do with it. The flag the author is thinking
of is postgresqlExtensions, which is still preview and would let the datasource declare
`extensions = [pg_trgm]` so Prisma manages CREATE EXTENSION. Omitting that is the
correct call regardless: the migration already runs CREATE EXTENSION IF NOT EXISTS
pg_trgm, so the shadow database Prisma builds during `migrate dev` has the extension
when it replays migrations. The theoretical exposure is `prisma db push`, which bypasses
migrations and would now fail on a database lacking pg_trgm — I checked, and this repo
has no db push in any script, workflow, or shell file. Worth correcting in the
description only so the next person does not inherit the wrong mental model.

### Docs contradict the code after this merge  — _Real gap. Fix it, but it does not block the merge._

docs-md/architecture/DATABASE_SERVICES.md documents these exact indexes and asserts they
cannot be expressed in schema.prisma. Once this merges that sentence is false, and it is
the sentence that would send the next engineer to write another raw migration. The
repo's CLAUDE.md requires documentation to be updated in the matching docs-md topic
folder when behaviour changes.

`docs-md/architecture/DATABASE_SERVICES.md:189`
```markdown
The two trigram indexes require the `pg_trgm` extension and cannot be expressed in
`schema.prisma`, so they (and the extension) are managed by the raw SQL migration
`20260626000000_add_documents_list_indexes`. As with the partial purge index, do not
let `migrate dev` drop them.
```
Half of this is now wrong. The extension is still migration-managed; the indexes are
not.

### Blast radius, tests and data safety  — _Clean on all four._

Blast radius is nil: @@index does not appear in the generated Prisma client's API
surface, so no TypeScript consumer changes and no regeneration artifact needs committing
(the generated schema copies under apps/*/src/generated are untracked). Data safety is
nil: no migration is added, no column or table is touched, and because the derived DDL
matches the live indexes exactly, existing databases see no rebuild. Auth, group scoping
and multi-tenancy are untouched. On tests, the repo's rule requires tests alongside
backend code changes, but no backend code changed here — the schema is declarative and
the meaningful verification is the drift check, which I ran rather than the author.
Worth noting the repo has no automated schema-vs-migrations parity check; had one
existed, this bug would have been caught in June rather than found by hand.

## Links

- [PR #240 — AI-1653 GIN Index Fix](https://github.com/bcgov/ai-adoption-document-intelligence/pull/240) — dbarkowsky, 1 file, +4/-6, targets develop
- [AI-1653 (Jira)](https://citz-do.atlassian.net/browse/AI-1653) — the ticket this closes
- [Commit fd845ea — add gin indexes to schema](https://github.com/bcgov/ai-adoption-document-intelligence/commit/fd845ea291c4e1342ff37c05a6ef49032288ed4d) — the only commit on the branch
- [schema.prisma (changed file)](https://github.com/bcgov/ai-adoption-document-intelligence/blob/AI-1653/apps/shared/prisma/schema.prisma) — Document model, lines 64-73
- [20260626000000_add_documents_list_indexes](https://github.com/bcgov/ai-adoption-document-intelligence/blob/develop/apps/shared/prisma/migrations/20260626000000_add_documents_list_indexes/migration.sql) — the June migration that created the indexes; do not edit it
- [docs-md/architecture/DATABASE_SERVICES.md](https://github.com/bcgov/ai-adoption-document-intelligence/blob/develop/docs-md/architecture/DATABASE_SERVICES.md) — the doc that needs the one-paragraph correction

## What I checked

- Computed the true base-to-head diff via git merge-tree rather than trusting the PR page's stats — 1 file, +4/-6, no hidden paths
- prisma validate passes on the PR schema (Prisma 7.2.0)
- Generated full DDL from both schemas and diffed: the delta is exactly the two CREATE INDEX lines and nothing else
- Ran prisma migrate diff --from-migrations against a throwaway Postgres shadow database: develop emits 2 DROP INDEX, the PR emits an empty migration
- Re-ran the drift check after catching that my first attempt used a different feature branch's migrations directory
- Confirmed the derived index names and operator classes match the live migration character-for-character
- Verified prisma format emits no deprecation for the name: argument, and that it relocates the purge comment only on the PR's version
- Grepped the whole repo for prisma db push — no occurrences, so the undeclared pg_trgm extension is not reachable
- Confirmed the generated schema copies under apps/*/src/generated are untracked, so no regeneration artifact is missing from the PR
- Dropped the scratch shadow database afterwards

