# Backup RPO / RTO

This page records the platform's Recovery Point Objective (RPO) and Recovery
Time Objective (RTO) as implied by the pgBackRest configuration in
`deployments/openshift/kustomize/base/crunchydb/postgrescluster.yml`.

> **Scope:** PostgreSQL (`app-pg` cluster). Azure Blob Storage content
> (uploaded files, thumbnails, OCR artefacts) is not included in pgBackRest
> backups; it must be managed separately.

## Agreed objectives

| Objective | Value | Basis |
|-----------|-------|-------|
| **RPO** (worst-case data loss) | **4 hours** | Incremental backups run every 4 hours (`0 */4 * * *`). A failure immediately before a scheduled incremental loses up to 4 hours of commits. |
| **RTO** (recovery window) | **~2 weeks** | Two most-recent full backups are retained (`repo1-retention-full: '2'`, `repo1-retention-full-type: count`). With weekly Sunday fulls, the oldest retained full is typically ~7–14 days old. All incrementals newer than the oldest full are also kept, so recovery can target any 4-hour slot within that window. |

## Backup schedule (`app-pg`)

| Type | Schedule | Notes |
|------|----------|-------|
| Full | `0 2 * * 0` — Sunday 02:00 UTC | Block-incremental + zstd compression (`repo1-block: y`, `repo1-compress-type: zst`, `repo1-compress-level: 3`) |
| Incremental | `0 */4 * * *` — every 4 hours | Only changed blocks; size is proportional to WAL volume since the last backup |

Count-based retention (`count` not `time`) bounds the repo size regardless of
missed fulls. If a Sunday full is skipped, the previous full is still retained
and the incrementals continue to pile against it; the window narrows but the
repo does not grow unboundedly.

## `temporal-pg` backup schedule

`temporal-pg` retains **14 days** (`repo1-retention-full: '14'`,
`repo1-retention-full-type: time`) with daily fulls and hourly incrementals.
Its RPO is therefore **1 hour** and its RTO **14 days**. Temporal workflow
history is ephemeral by design, so a coarser `app-pg` RPO is acceptable.

## What is NOT covered

- Azure Blob Storage (documents, thumbnails, OCR artefacts) — back up via
  Azure Storage replication or the `oc-backup-db-to-unc.sh` / `oc-backup-db.sh`
  scripts that capture the Postgres database only.
- Temporal workflow execution history — not restored by pgBackRest restores.
- Local `pg_dump`-based backups captured via `scripts/oc-backup-db.sh` are
  point-in-time snapshots, not continuous; they supplement but do not replace
  pgBackRest for RPO/RTO purposes.

## References

- Backup schedule and retention settings: [`deployments/openshift/kustomize/base/crunchydb/postgrescluster.yml`](../../deployments/openshift/kustomize/base/crunchydb/postgrescluster.yml)
- Manual backup to network share: [BACKUP_TO_NETWORK_SHARE.md](./BACKUP_TO_NETWORK_SHARE.md)
- pgBackRest retention table: [ENVIRONMENT_CONFIGURATION.md § Database Storage](./ENVIRONMENT_CONFIGURATION.md#database-storage)
