# migrate-blob-paths

One-shot migration for AI-1073 — moves legacy Azure blob storage paths onto
the standardized `{groupId}/{category}/...` layout and rewrites the DB rows
that store full blob keys.

## Scope

| Target | Old prefix | New prefix | DB rewrite |
|---|---|---|---|
| Labeling documents | `labeling-documents/{id}/...` | `{groupId}/training/labeling-documents/{id}/...` | `LabelingDocument.file_path`, `LabelingDocument.normalized_file_path` |
| Datasets | `datasets/{datasetId}/{versionId}/...` | `{groupId}/benchmark/datasets/{datasetId}/{versionId}/...` | none |

Documents (`Document` table) and classifier training blobs are intentionally
out of scope.

## Phases

- `--phase=copy` (default) — **non-destructive**. Copies every matched blob
  to its new key via `StartCopyFromURL` (same-account, server-side, free
  and near-instant) and rewrites DB rows. Old blobs remain in place. Safe
  to run while the old code is still serving traffic.
- `--phase=cleanup` — **destructive**. For each old-prefix blob, verifies
  that its new counterpart exists and deletes the old source. Run this
  only after the new code is deployed and smoke-tested.

The script is idempotent: it skips blobs whose new counterpart is already
present, so reruns pick up where prior runs left off.

## Running

From `apps/backend-services`:

```bash
# dry-run (default): prints what would happen, touches nothing
npx ts-node -r tsconfig-paths/register \
  scripts/migrate-blob-paths/migrate.ts \
  --phase=copy --category=all

# actually do it
npx ts-node -r tsconfig-paths/register \
  scripts/migrate-blob-paths/migrate.ts \
  --phase=copy --category=all --execute

# cleanup (destructive) — AFTER new code is deployed and verified
npx ts-node -r tsconfig-paths/register \
  scripts/migrate-blob-paths/migrate.ts \
  --phase=cleanup --category=all --execute
```

### Flags

| Flag | Values | Default | Notes |
|---|---|---|---|
| `--phase` | `copy`, `cleanup` | `copy` | |
| `--category` | `labeling-documents`, `datasets`, `all` | `all` | |
| `--execute` | presence toggles on | off (dry-run) | |
| `--concurrency` | positive integer | `10` | parallel in-flight operations |

### Required env

- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_CONTAINER_NAME`
- `DATABASE_URL`

## Recommended rollout

1. Put the system into read-only or a maintenance window.
2. Run `--phase=copy --execute` against the target environment.
3. Deploy the new code (AI-1073).
4. Smoke-test: open a labeling document, render a dataset version.
5. Run `--phase=cleanup --execute` to delete the old blobs.

The script will also work with the new code already deployed — but in that
window, any feature that reads a not-yet-migrated blob will return 500
until the copy phase completes for that row.

## Safety properties

- Destination existence is checked before every copy → idempotent reruns.
- Copy success is verified by comparing `contentLength`.
- DB row update runs only after all blobs for that row have been copied.
- If the DB update fails, the just-copied blobs are deleted so a retry
  starts clean.
- Cleanup never deletes a source whose destination is missing.

## Typecheck

```bash
npx tsc --noEmit -p scripts/migrate-blob-paths/tsconfig.json
```
