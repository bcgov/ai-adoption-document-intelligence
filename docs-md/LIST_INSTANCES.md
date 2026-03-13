# List Instances Script

The `oc-list-instances.sh` script lists all deployed instances in the OpenShift namespace, showing their name, health status, and age.

## Usage

```bash
./scripts/oc-list-instances.sh
```

## Prerequisites

- `.oc-deploy-token` file exists (created by `oc-setup-sa.sh`)
- `oc` CLI installed

## Output

The script displays a table with three columns:

| Column | Description |
|--------|-------------|
| **INSTANCE** | The instance name (derived from the `app.kubernetes.io/instance` label) |
| **STATUS** | Deployment health: `Running`, `Pending`, `Error`, or `Unknown` |
| **AGE** | Time since the oldest deployment was created (e.g., `2d`, `5h`, `30m`) |

### Example Output

```
INSTANCE                                 STATUS       AGE
feature-my-thing                         Running      2d
feature-other-work                       Running      5h
```

### No Instances

When no instances are deployed in the namespace, the script outputs:

```
No instances found in namespace 'fd34fb-dev'.
```

## Status Determination

The STATUS column reflects the health of all pods belonging to the instance:

- **Running** -- All pods are in Running phase and all containers report ready.
- **Pending** -- One or more pods are in Pending phase or have containers that are not yet ready.
- **Error** -- One or more pods are in Failed phase, or containers are in CrashLoopBackOff or ImagePullBackOff state.
- **Unknown** -- Pod status could not be determined (e.g., no pods found for the instance).

## How It Works

1. Authenticates to OpenShift using the service account token from `.oc-deploy-token`.
2. Queries all deployments in the namespace that have the `app.kubernetes.io/instance` label.
3. Extracts the unique set of instance names from those labels.
4. For each instance, inspects pod phases and container readiness to determine status.
5. Calculates age from the earliest deployment creation timestamp for the instance.
6. Prints the results as a formatted table.
