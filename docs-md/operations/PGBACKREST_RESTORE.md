# Restoring from pgBackRest Backups

This runbook walks through recovering a PostgreSQL database from an automated
pgBackRest backup running in OpenShift. It covers both the backend database
(`app-pg`) and the Temporal database (`temporal-pg`).

## Background

The Crunchy PostgreSQL Operator (PGO) runs two cron jobs per database cluster:

| Job | Schedule | What it does |
|-----|----------|--------------|
| Full backup | Daily at 02:00 UTC | Copies the entire database to the backup volume |
| Incremental backup | Every 60 minutes | Copies only blocks that changed since the last backup |

Both types are stored inside the cluster on a dedicated `PersistentVolumeClaim`
backed by the `netapp-file-backup` storage class (NetApp NFS). Backups are
retained for **30 days**, after which older full backups and all their
dependent incrementals are pruned automatically.

**This runbook is for restoring from those automated backups.** It is entirely
separate from `scripts/oc-backup-db.sh` / `oc-restore-db.sh`, which are manual
`pg_dump`-based tools.

---

## Environments and resource names

| Environment | Namespace | Backend cluster | Temporal cluster |
|-------------|-----------|-----------------|------------------|
| Production  | `fd34fb-prod` | `bcgov-di-app-pg` | `bcgov-di-temporal-pg` |
| Test        | `fd34fb-test` | `bcgov-di-test-app-pg` | `bcgov-di-test-temporal-pg` |

Feature/dev instances follow the pattern `<instance-name>-app-pg` and
`<instance-name>-temporal-pg`, also in `fd34fb-test`.

---

## Prerequisites

### 1. Install the `oc` CLI

The `oc` command is the OpenShift client. If you do not have it, navigate to the [OpenShift CLI downloads](https://docs.okd.io/latest/cli_reference/openshift_cli/getting-started-cli.html) page and follow the appropriate instructions.

```bash
# Verify your oc version:
oc version
```

### 2. Log in to the OpenShift cluster

```bash
oc login --web --server=https://api.silver.devops.gov.bc.ca:6443
```

A browser window will open. Log in with your BC Gov IDIR. After
authenticating, return to the terminal — you will see a message like
`Logged into "https://api.silver.devops.gov.bc.ca:6443" as "your-name@..."`.

### 3. Confirm namespace access

```bash
# For production:
oc project fd34fb-prod

# For test:
oc project fd34fb-test
```

You should see `Now using project "<namespace>"`. If you get a permissions
error, you need to request access from the team's OpenShift project admin.

---

## Step 1 — Inspect available backups

Before committing to a restore, check what backups exist and when they were
taken. This is done by running a command inside the **pgBackRest repo-host
pod**, which is a dedicated pod that manages the backup repository.

### Find the repo-host pod

```bash
# Replace <namespace> and <cluster> with your target values.
# Example for production backend: namespace=fd34fb-prod, cluster=bcgov-di-app-pg
oc get pods -n <namespace> \
  -l "postgres-operator.crunchydata.com/cluster=<cluster>,postgres-operator.crunchydata.com/pgbackrest-dedicated"
```

The output will look like:

```
NAME                                   READY   STATUS    RESTARTS   AGE
bcgov-di-app-pg-repo-host-abc12-xyz    2/2     Running   0          14d
```

Copy the full pod name (e.g. `bcgov-di-app-pg-repo-host-abc12-xyz`).

### List available backups

```bash
oc exec -n <namespace> <repo-host-pod> -c pgbackrest -- \
  pgbackrest info --stanza=db
```

Example output:

```
stanza: db
    status: ok
    cipher: none

    db (current)
        wal archive min/max (16): 000000010000000000000001/0000000100000003000000F2

        full backup: 20260716-020002F
            timestamp start/stop: 2026-07-16 02:00:02+00 / 2026-07-16 02:08:41+00
            wal start/stop: 000000010000000300000082 / 0000000100000003000000A1
            database size: 245.7MB, database backup size: 245.7MB
            repo1: backup size: 41.2MB

        incr backup: 20260716-020002F_20260716-060001I
            timestamp start/stop: 2026-07-16 06:00:01+00 / 2026-07-16 06:00:09+00
            wal start/stop: 0000000100000003000000B2 / 0000000100000003000000B3
            database size: 245.7MB, database backup size: 1.3MB
            repo1: backup size: 312KB

        full backup: 20260717-020013F
            timestamp start/stop: 2026-07-17 02:00:13+00 / 2026-07-17 02:00:15+00
            ...
```

Note the backup label (e.g. `20260716-020002F`) and the timestamps. You will
use these in the next steps to pick your recovery point.

---

## Step 2 — Scale down application pods

A restore replaces all data in the database. Stop all application pods that
write to the database before triggering a restore so they do not attempt
reconnections while the cluster is being restored.

```bash
# Scale down all pods that connect to either database.
# Temporal connects to both app-pg and temporal-pg, so it must be stopped
# regardless of which database you are restoring.
oc scale deployment <instance>-backend-services --replicas=0 -n <namespace>
oc scale deployment <instance>-temporal-worker  --replicas=0 -n <namespace>
oc scale deployment <instance>-temporal         --replicas=0 -n <namespace>
```

Replace `<instance>` with the instance prefix (e.g. `bcgov-di` for prod,
`bcgov-di-test` for test).

Confirm that all pods are gone:

```bash
oc get pods -n <namespace> | grep -E 'backend-services|temporal'
# Should show no Running pods for those deployments.
```

---

## Step 3 — Apply the restore spec

Add `spec.backups.pgbackrest.restore` to the `PostgresCluster` resource.
This tells the operator which backup to restore from when the annotation
trigger fires in the next step.

### Option A — Restore to the latest available backup

```bash
oc patch postgrescluster <cluster> -n <namespace> \
  --type=merge \
  -p '{"spec":{"backups":{"pgbackrest":{"restore":{"enabled":true,"repoName":"repo1","options":[]}}}}}'
```

### Option B — Restore from a specific named backup

Use the backup label from the `pgbackrest info` output in Step 1. Pick the
label whose **stop timestamp** is just before the event you are recovering
from. Incremental backup labels (e.g. `20260716-020002F_20260716-060001I`)
are valid and restore to the end of that incremental.

```bash
oc patch postgrescluster <cluster> -n <namespace> \
  --type=merge \
  -p '{"spec":{"backups":{"pgbackrest":{"restore":{"enabled":true,"repoName":"repo1","options":["--set=20260716-020002F"]}}}}}'
```

Replace `20260716-020002F` with the actual label from your `pgbackrest info`
output.

> **Note on PITR:** Timestamp-based point-in-time recovery (`--type=time
> --target=...`) does not work through the PGO options array because
> pgBackRest requires a space in the timestamp value (`YYYY-MM-DD HH:MM:SS`)
> and the shell word-splits it into two arguments. Use `--set` with the
> nearest backup label instead.

---

## Step 4 — Trigger the restore

Annotate the `PostgresCluster` with a unique restore ID. The operator watches
for this annotation and immediately begins the restore. The cluster does **not**
need to be shut down first.

```bash
RESTORE_ID="restore-$(date '+%Y%m%d-%H%M%S')"

oc annotate postgrescluster <cluster> -n <namespace> \
  --overwrite \
  "postgres-operator.crunchydata.com/pgbackrest-restore=${RESTORE_ID}"

echo "Restore triggered with ID: ${RESTORE_ID}"
```

The operator spawns a short-lived restore pod, runs `pgbackrest restore`,
then restarts the primary. The restore pod completes quickly (seconds to
minutes depending on database size) and is automatically cleaned up.

---

## Step 5 — Wait for restore completion

Poll the `PostgresCluster` status until `finished` is `true` for your restore ID:

```bash
RESTORE_ID="<the ID you used above>"
CLUSTER="<cluster>"
NAMESPACE="<namespace>"

while true; do
  STATUS=$(oc get postgrescluster "$CLUSTER" -n "$NAMESPACE" \
    -o jsonpath='{.status.pgbackrest.restore}')
  echo "$(date -u '+%H:%M:%S') $STATUS"

  FINISHED=$(echo "$STATUS" | jq -r '.finished // empty' 2>/dev/null)
  ID=$(echo "$STATUS"       | jq -r '.id // empty'       2>/dev/null)

  if [[ "$ID" == "$RESTORE_ID" && "$FINISHED" == "true" ]]; then
    echo "Restore completed."
    break
  fi
  sleep 10
done
```

A completed restore looks like:
```json
{"completionTime":"2026-07-21T20:52:25Z","finished":true,"id":"restore-20260721-135006","startTime":"2026-07-21T20:52:05Z","succeeded":1}
```

---

## Step 6 — Remove the restore spec

**This step is mandatory.** Leaving `restore.enabled: true` in place will
cause the operator to re-trigger the restore on the next reconcile, destroying
your data again.

```bash
# Disable the restore spec
oc patch postgrescluster <cluster> -n <namespace> \
  --type=merge \
  -p '{"spec":{"backups":{"pgbackrest":{"restore":{"enabled":false}}}}}'

# Remove the trigger annotation
oc annotate postgrescluster <cluster> -n <namespace> \
  "postgres-operator.crunchydata.com/pgbackrest-restore-"
```

---

## Step 7 — Verify the database is healthy

```bash
PG_POD=$(oc get pods -n <namespace> \
  -l "postgres-operator.crunchydata.com/cluster=<cluster>,postgres-operator.crunchydata.com/role=master" \
  -o jsonpath='{.items[0].metadata.name}')

echo "Primary pod: ${PG_POD}"

oc exec -n <namespace> "${PG_POD}" -c database -- \
  psql -U postgres -c "SELECT now(), pg_is_in_recovery();"
```

Expected output:
```
              now              | pg_is_in_recovery
-------------------------------+-------------------
 2026-07-21 20:53:20.383044+00 | f
```

`pg_is_in_recovery()` returning `f` (false) confirms the database is running
as a primary, not a replica in recovery.

For the backend database, also verify the application schema is present:

```bash
oc exec -n <namespace> "${PG_POD}" -c database -- \
  psql -U postgres -d api -c "\dt" | head -20
```

---

## Step 8 — Scale application pods back up

```bash
oc scale deployment <instance>-backend-services --replicas=1 -n <namespace>
oc scale deployment <instance>-temporal         --replicas=1 -n <namespace>
oc scale deployment <instance>-temporal-worker  --replicas=1 -n <namespace>
```

Once all pods show `Running` and pass their readiness checks, the restore is
complete.

---

## Restoring the Temporal database

The Temporal database (`temporal-pg`) follows the exact same procedure.
Substitute the temporal cluster name where the app cluster name appears.

| | Backend (app-pg) | Temporal (temporal-pg) |
|---|---|---|
| Cluster name (prod) | `bcgov-di-app-pg` | `bcgov-di-temporal-pg` |
| Cluster name (test) | `bcgov-di-test-app-pg` | `bcgov-di-test-temporal-pg` |
| Deployments to scale down | `backend-services`, `temporal`, `temporal-worker` | `temporal`, `temporal-worker` |

> **Note:** Because `temporal` connects to *both* databases, you must scale it
> down when restoring either one.

---

## GitHub Actions workflow

Both restore operations are also available as GitHub Actions workflows, which
automate all steps above including scale-down, restore, verification, and
scale-back-up:

- **pgBackRest List Backups** — lists available backup labels for a cluster
  (run this first to find a label for a specific-point restore)
- **pgBackRest Database Restore** — triggers the full restore workflow

---

## Troubleshooting

### Restore pod completes instantly and is already gone

This is normal. The restore pod is short-lived and the operator cleans it up
immediately after completion. Check the `PostgresCluster` status instead:

```bash
oc get postgrescluster <cluster> -n <namespace> \
  -o jsonpath='{.status.pgbackrest.restore}'
```

`"finished":true,"succeeded":1` means the restore succeeded.

### Restore does not start after annotating

Confirm the annotation is present:

```bash
oc get postgrescluster <cluster> -n <namespace> \
  -o jsonpath='{.metadata.annotations.postgres-operator\.crunchydata\.com/pgbackrest-restore}'
```

If it is present but no restore starts within 2–3 minutes, re-annotate with
a new unique value:

```bash
oc annotate postgrescluster <cluster> -n <namespace> \
  --overwrite \
  "postgres-operator.crunchydata.com/pgbackrest-restore=restore-$(date +%s)"
```

### Restore pod shows an error

If a restore pod does appear with `Error` status, check its logs:

```bash
oc get pods -n <namespace> \
  -l "postgres-operator.crunchydata.com/pgbackrest-restore,postgres-operator.crunchydata.com/cluster=<cluster>"

oc logs -n <namespace> <pod-name>
```

Common causes:
- **`backup set ... is not valid`** — the label passed to `--set=` does not
  exist. Run `pgbackrest info --stanza=db` from the repo-host pod (Step 1) to
  list valid labels.
- **`command does not allow parameters`** — a space inside a `--target=` value
  was split by the shell. Use `--set=<label>` instead.

### Application pods crash-loop after restore

The schema may be at a different migration level than the application code
expects. Check the pod logs:

```bash
oc logs -n <namespace> deployment/<instance>-backend-services --previous
```

Either roll the application image back to match the restored schema version,
or apply missing migrations manually.
