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

> **Tip:** pgBackRest can recover to any point in time within the WAL archive
> window, not just to the exact moment a backup completed. Any timestamp
> between the earliest WAL archive and the most recent backup is valid.

---

## Step 2 — Scale down application pods

A restore replaces all data in the database. You must stop all application
pods that write to the database **before** initiating a restore, to prevent
them from attempting to reconnect to a cluster that is about to be torn down.

```bash
# For the backend database (app-pg), scale down these deployments:
oc scale deployment <instance>-backend-services --replicas=0 -n <namespace>
oc scale deployment <instance>-temporal-worker  --replicas=0 -n <namespace>
oc scale deployment <instance>-temporal         --replicas=0 -n <namespace>

# For the temporal database (temporal-pg), the same deployments apply
# since Temporal server also connects to temporal-pg.
```

Replace `<instance>` with the instance prefix (e.g. `bcgov-di` for prod,
`bcgov-di-test` for test).

Confirm that all pods are gone:

```bash
oc get pods -n <namespace> | grep -E 'backend-services|temporal'
# Should show no Running pods for those deployments.
```

---

## Step 3 — Shut down the PostgresCluster

The Crunchy operator needs the cluster to be fully stopped before it can
restore into it. Set `spec.shutdown: true` on the `PostgresCluster` resource.

```bash
oc patch postgrescluster <cluster> -n <namespace> \
  --type=merge \
  -p '{"spec":{"shutdown":true}}'
```

Example for the production backend database:

```bash
oc patch postgrescluster bcgov-di-app-pg -n fd34fb-prod \
  --type=merge \
  -p '{"spec":{"shutdown":true}}'
```

Wait for the primary database pod to stop:

```bash
# Watch the primary data pod. The repo-host pod will stay Running — that is normal
# and expected; it manages WAL archiving and is intentionally kept up by the operator.
# You are only waiting for the primary instance pod (the one named *-00-*-0 or similar)
# to disappear.
oc get pods -n <namespace> -w \
  -l "postgres-operator.crunchydata.com/cluster=<cluster>,postgres-operator.crunchydata.com/instance"
# Press Ctrl+C once the primary pod disappears.
```

> **Note:** The `repo-host` pod will remain `Running` throughout this process. Do not
> wait for it to go down — it never will during a normal shutdown.

---

## Step 4 — Patch the PostgresCluster to request a restore

Add a `spec.dataSource.postgresCluster` block to the cluster resource. This
tells the Crunchy operator to perform a pgBackRest restore when the cluster
starts back up.

### Option A — Restore to the latest available backup

Use this when you want to recover everything up to the most recent backup point.

```bash
oc patch postgrescluster <cluster> -n <namespace> \
  --type=merge \
  -p '{
    "spec": {
      "dataSource": {
        "postgresCluster": {
          "clusterName": "<cluster>",
          "clusterNamespace": "<namespace>",
          "repoName": "repo1"
        }
      }
    }
  }'
```

### Option B — Restore from a specific named backup (closest to a target time)

Use this when you need to recover to a point before a specific event (e.g. an
accidental deletion). From the `pgbackrest info` output in Step 1, pick the
backup label whose **stop timestamp** is just before the event you are
recovering from.

```bash
oc patch postgrescluster <cluster> -n <namespace> \
  --type=merge \
  -p '{
    "spec": {
      "dataSource": {
        "postgresCluster": {
          "clusterName": "<cluster>",
          "clusterNamespace": "<namespace>",
          "repoName": "repo1",
          "options": ["--set=20260716-020002F"]
        }
      }
    }
  }'
```

Replace `20260716-020002F` with the label from `pgbackrest info`. Include
incremental backup labels (e.g. `20260716-020002F_20260716-060001I`) if you
need to recover to a point between two full backups.

> **Why not timestamp-based PITR?** pgBackRest requires a space between the
> date and time in `--target` values (`YYYY-MM-DD HH:MM:SS`), but PGO joins
> the `options` array into a shell variable that gets word-split on expansion.
> This makes it impossible to pass a timestamp with a space through this
> mechanism. Use `--set` with the nearest backup label instead.

---

## Step 5 — Start the cluster and wait for restore

Set `spec.shutdown: false` to bring the cluster back up. The operator will
see the `spec.dataSource` block and trigger the pgBackRest restore before
starting the primary.

```bash
oc patch postgrescluster <cluster> -n <namespace> \
  --type=merge \
  -p '{"spec":{"shutdown":false}}'
```

Monitor the restore progress by watching the pods and the operator events:

```bash
# Watch pods come up
oc get pods -n <namespace> -w \
  -l "postgres-operator.crunchydata.com/cluster=<cluster>"
```

You will see a restore job pod appear (named something like
`<cluster>-pgbackrest-restore-<hash>`). It runs to completion, then the
normal database pod starts.

```bash
# Check restore job pod logs for progress
oc logs -n <namespace> \
  -l "postgres-operator.crunchydata.com/pgbackrest-restore,postgres-operator.crunchydata.com/cluster=<cluster>" \
  --tail=50
```

A successful restore will show pgBackRest output ending with:
```
P00   INFO: restore command end: completed successfully
```

The primary database pod (`<cluster>-<set>-0`) should eventually reach
`Running` with `2/2` containers ready. This can take several minutes
depending on database size.

---

## Step 6 — Remove the dataSource spec

**This step is mandatory.** Leaving `spec.dataSource` in place will cause
the operator to re-trigger the restore the next time the cluster reconciles
(e.g. after a pod restart), destroying your data again.

```bash
oc patch postgrescluster <cluster> -n <namespace> \
  --type=json \
  -p '[{"op":"remove","path":"/spec/dataSource"}]'
```

Confirm it was removed:

```bash
oc get postgrescluster <cluster> -n <namespace> -o jsonpath='{.spec.dataSource}'
# Should return nothing (empty output).
```

---

## Step 7 — Verify the database is healthy

Connect to the database pod and run a quick sanity check:

```bash
# Find the primary pod
PG_POD=$(oc get pods -n <namespace> \
  -l "postgres-operator.crunchydata.com/cluster=<cluster>,postgres-operator.crunchydata.com/role=master" \
  -o jsonpath='{.items[0].metadata.name}')

echo "Primary pod: ${PG_POD}"

# Run a connection test
oc exec -n <namespace> "${PG_POD}" -c database -- \
  psql -U postgres -c "SELECT now(), pg_is_in_recovery();"
```

Expected output:
```
              now              | pg_is_in_recovery
-------------------------------+-------------------
 2026-07-17 03:15:42.123456+00 | f
```

`pg_is_in_recovery()` returning `f` (false) confirms the database is running
as a primary, not a standby.

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

Watch the pods start:

```bash
oc get pods -n <namespace> -w | grep -E 'backend-services|temporal'
```

Once all pods show `Running` and pass their readiness checks, the restore is
complete.

---

## Restoring the Temporal database

The Temporal database (`temporal-pg`) follows the exact same procedure.
Substitute the temporal cluster name where the app cluster name appears.

| Step | Backend (app-pg) | Temporal (temporal-pg) |
|------|-----------------|------------------------|
| Cluster name (prod) | `bcgov-di-app-pg` | `bcgov-di-temporal-pg` |
| Cluster name (test) | `bcgov-di-test-app-pg` | `bcgov-di-test-temporal-pg` |
| Deployments to scale down | `backend-services`, `temporal`, `temporal-worker` | `temporal`, `temporal-worker` |

> **Note:** Because `temporal` connects to *both* databases, you must scale it
> down when restoring either one.

---

## Troubleshooting

### Restore job pod does not appear

After patching `spec.shutdown: false`, if no restore job pod appears within
2–3 minutes, the operator may not have picked up the `dataSource` change.
Force a reconcile by adding a meaningless annotation to the `PostgresCluster`:

```bash
oc annotate postgrescluster <cluster> -n <namespace> \
  "restore-trigger=$(date +%s)" --overwrite
```

### Restore pods keep erroring and then stop appearing

After multiple consecutive failures the operator's Job controller hits its
backoff limit and stops spawning new pods. Delete the failed Jobs to clear
the backoff, then force a reconcile:

```bash
oc delete jobs -n <namespace> \
  -l "postgres-operator.crunchydata.com/pgbackrest-restore,postgres-operator.crunchydata.com/cluster=<cluster>"

oc annotate postgrescluster <cluster> -n <namespace> \
  "restore-trigger=$(date +%s)" --overwrite
```

A new restore pod will appear within a minute or two.

### Restore pod shows an error

Check the full logs of the most recent restore pod:

```bash
# List restore pods to find the most recent one
oc get pods -n <namespace> \
  -l "postgres-operator.crunchydata.com/pgbackrest-restore,postgres-operator.crunchydata.com/cluster=<cluster>"

# Read its logs
oc logs -n <namespace> <pod-name>
```

Common causes:
- **`unable to find stanza`** — the stanza name is wrong. It is always `db` for
  both clusters in this project.
- **`no backup found`** / **`automatic backup set selection cannot be performed`**
  — the backup label in `--set=` does not exist in `pgbackrest info` output,
  or a malformed timestamp was passed. Verify the label against `pgbackrest info`
  output from Step 1.
- **`command does not allow parameters`** — a value containing a space was split
  into two arguments by the shell. This happens when using `--type=time` with a
  timestamp. Use `--set=<label>` instead (see Step 4, Option B).

### Database pod stays in `Pending` after restore

Check for PVC issues:

```bash
oc get pvc -n <namespace> | grep <cluster>
oc describe pvc <pvc-name> -n <namespace>
```

If a PVC is stuck in `Terminating` from the old cluster instance, you may
need to wait for it to be released before the new one binds.

### Application pods crash-loop after restore

If backend-services pods crash immediately after scaling up, the schema may
be at a different migration level than the code expects. Check the pod logs:

```bash
oc logs -n <namespace> deployment/<instance>-backend-services --previous
```

This is expected if you restored to a point before a recent migration was
applied. Either roll the application image back to match the restored schema
version, or apply missing migrations manually.
