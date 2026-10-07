# Backup RPO / RTO

This page records what the pgBackRest configuration implies for data loss and
recovery on the platform's two PostgreSQL clusters. The settings live in
`deployments/openshift/kustomize/base/crunchydb/postgrescluster.yml` (`app-pg`)
and `deployments/openshift/kustomize/base/temporal/postgrescluster.yml`
(`temporal-pg`).

Three terms, because they are easy to conflate:

- **RPO (Recovery Point Objective):** the most committed data that can be lost
  when the database is restored after a failure.
- **Recovery window:** how far back in time a restore can reach, set by backup
  retention.
- **RTO (Recovery Time Objective):** how long it takes to get the service back
  once a restore starts.

> **Scope:** PostgreSQL only. Azure Blob Storage content (uploaded files,
> thumbnails, OCR artefacts) is not in pgBackRest backups. See
> [What is not covered](#what-is-not-covered).

## Summary

| | `app-pg` | `temporal-pg` |
|---|---|---|
| **RPO** | Bounded by WAL archiving, not by the backup schedule; at most 4 hours | Bounded by WAL archiving; at most 1 hour |
| **Recovery window** | ~7–14 days (2 most recent weekly fulls) | 14 days |
| **Points a restore can target** | The end of the WAL archive, or any retained backup | The end of the WAL archive, or any retained backup |
| **RTO** | Not set by configuration; not yet measured | Not set by configuration; not yet measured |

## RPO

Crunchy PGO archives the write-ahead log (WAL, PostgreSQL's continuous record of
every committed change) to the pgBackRest repository between backups;
`pgbackrest info` reports its range as `wal archive min/max`. A restore to the
latest point replays the newest backup and then every archived WAL segment
after it (see [PGBACKREST_RESTORE.md](./PGBACKREST_RESTORE.md)). The data lost
is therefore only the WAL that had not reached the archive when the primary
failed. It is not everything since the last incremental backup.

How much WAL can be waiting depends on `archive_timeout`, which this repository
does not set:

- With `archive_timeout` set to a duration, a partly filled WAL segment is
  archived at least that often, and the RPO is roughly that duration.
- With `archive_timeout = 0` (the PostgreSQL default), a segment is archived only
  when its 16 MB fills. On a quiet database that can take hours.
- In both cases every backup forces a segment switch, so the backup schedule is
  an upper bound: 4 hours for `app-pg` (incrementals at `0 */4 * * *`) and
  1 hour for `temporal-pg` (incrementals at `*/60 * * * *`).

To find the effective value, run `SHOW archive_timeout;` on the primary.

## Recovery window

### `app-pg`

| Type | Schedule | Notes |
|------|----------|-------|
| Full | `0 2 * * 0`: Sunday 02:00 | Block-incremental + zstd compression (`repo1-block: y`, `compress-type: zst`, `compress-level: 3`) |
| Incremental | `0 */4 * * *`: every 4 hours | Only changed blocks; size is proportional to WAL volume since the last backup |

Retention keeps the **two most recent full backups** (`repo1-retention-full: '2'`,
`repo1-retention-full-type: count`), plus every incremental and all WAL newer
than the oldest of them. With weekly fulls, the oldest retained full is 7–14
days old, depending on the day of the week.

Count-based retention bounds the repository size regardless of missed fulls. If
a Sunday full is skipped, the previous full is kept and incrementals continue to
build on it, so the window lengthens rather than the repository growing
without bound.

### `temporal-pg`

Daily fulls at `0 2 * * *`, hourly incrementals, and time-based retention of
**14 days** (`repo1-retention-full: '14'`, `repo1-retention-full-type: time`).

### Which points a restore can target

A restore can stop at the end of the WAL archive (the latest point) or at any
retained backup (`--set <label> --type=immediate`). It cannot target an
arbitrary timestamp: timestamp-based point-in-time recovery does not work
through the PGO options array (see
[PGBACKREST_RESTORE.md](./PGBACKREST_RESTORE.md)). Going back in time therefore
has the granularity of the backup schedule, which is 4 hours on `app-pg` and
1 hour on `temporal-pg`.

## RTO

No configuration value sets the RTO. Restore time is the time to copy the
selected full and incrementals back, replay the WAL after them, and bring the
application pods back up. It grows with database size and with the WAL volume
since the backup. No restore drill has recorded a duration, so there is no
measured RTO for either cluster. The procedure to time is
[PGBACKREST_RESTORE.md](./PGBACKREST_RESTORE.md).

## What is not covered

- **Azure Blob Storage** (documents, thumbnails, OCR artefacts). Neither
  pgBackRest nor the `scripts/oc-backup-db.sh` / `scripts/oc-backup-db-to-unc.sh`
  scripts back it up; both capture PostgreSQL only.
- **Database restores do not bring blobs back.** Restoring `app-pg` to a point
  before a [document-retention](../architecture/DOCUMENT_RETENTION.md) run
  restores the `documents` rows that run deleted, but their blobs are gone. Those
  documents come back with no files.
- **Temporal workflow execution history** is not restored by an `app-pg` restore;
  it lives in `temporal-pg`.
- `pg_dump` backups from `scripts/oc-backup-db.sh` are point-in-time snapshots.
  They supplement pgBackRest but do not change the RPO above.

## References

- Backup schedule and retention settings: [`deployments/openshift/kustomize/base/crunchydb/postgrescluster.yml`](../../deployments/openshift/kustomize/base/crunchydb/postgrescluster.yml), [`deployments/openshift/kustomize/base/temporal/postgrescluster.yml`](../../deployments/openshift/kustomize/base/temporal/postgrescluster.yml)
- Restore procedure: [PGBACKREST_RESTORE.md](./PGBACKREST_RESTORE.md)
- Manual backup to network share: [BACKUP_TO_NETWORK_SHARE.md](./BACKUP_TO_NETWORK_SHARE.md)
- pgBackRest retention table: [ENVIRONMENT_CONFIGURATION.md § Database Storage](./ENVIRONMENT_CONFIGURATION.md#database-storage)
