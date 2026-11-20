# Namespace Capacity Model

This document records the per-instance resource footprint, the resulting namespace quota
headroom, and the rationale for HPA `maxReplicas` and scale-up policy choices.

## Background

Shared OpenShift namespaces (e.g. `fd34fb-test`) apply a `ResourceQuota` covering every
pod in the namespace. When HPAs scale up they can exhaust that ceiling, leaving new pods
`Pending` (`FailedScheduling`) and stalling rollouts.

The quota covers more than the application: each instance also carries its own two
Crunchy Postgres clusters and its own PLG monitoring stack, all name-prefixed per
instance. Those account for roughly half of an instance's CPU requests, so any headroom
calculation that counts only the five application deployments will be out by a factor of
about two.

Observed quota on `fd34fb-test` (as of 2026-07-17):

| Resource | Used | Limit | % |
|---|---|---|---|
| `requests.cpu` | 3230m | 4000m | 80.75% |
| `requests.memory` | 5736Mi | 16384Mi | 35% |
| `requests.storage` | 64Gi | 64Gi | 100% |

CPU is the binding constraint. Storage exhaustion is addressed separately (PVC sizing).

---

## Per-pod resource footprint

Resources are **request** values, which count against the namespace `ResourceQuota`.
Limits are not shown here; see individual deployment manifests.

### backend-services pod

| Container | CPU req | Memory req |
|---|---|---|
| `backend-services` | 100m | 1Gi (1024Mi) |
| `log-rotator` | 10m | 32Mi |
| `promtail` | 50m | 64Mi |
| **Pod total** | **160m** | **1120Mi** |

### temporal-worker pod

| Container | CPU req | Memory req |
|---|---|---|
| `temporal-worker` | 100m | 768Mi |
| `log-rotator` | 10m | 32Mi |
| `promtail` | 50m | 64Mi |
| **Pod total** | **160m** | **864Mi** |

### temporal-server pod (2 replicas, no HPA — fixed cost)

| Container | CPU req | Memory req |
|---|---|---|
| `temporal` | 250m | 512Mi |
| `promtail` | 50m | 32Mi |
| **Pod total** | **300m** | **544Mi** |

### temporal-ui pod (1 replica, no HPA — fixed cost)

| Container | CPU req | Memory req |
|---|---|---|
| `temporal-ui` | 50m | 128Mi |
| **Pod total** | **50m** | **128Mi** |

### frontend pod

| Container | CPU req | Memory req |
|---|---|---|
| `frontend` | 50m | 128Mi |
| `promtail` | 50m | 32Mi |
| **Pod total** | **100m** | **160Mi** |

### Supporting workloads (per instance, no HPA — fixed cost)

Every instance also deploys its own databases and its own monitoring stack. These are
not optional and not shared between instances: the two `PostgresCluster` resources come
from `base/`, and the PLG stack is installed by `.github/workflows/deploy-instance.yml`,
which sets `DEPLOY_PLG: "true"` at workflow level with no per-environment override. They
are name-prefixed per instance exactly like the application deployments.

Together they are roughly half of an instance's footprint, so a capacity model that omits
them understates the real cost by more than a factor of two.

| Workload | Pods | CPU req | Memory req |
|---|---|---|---|
| `app-pg` (Crunchy instance + repo-host) | 2 | 200m | 500Mi |
| `temporal-pg` (Crunchy instance + repo-host) | 2 | 200m | 500Mi |
| `plg-loki` | 1 | 500m | 512Mi |
| `plg-prometheus` | 1 | 500m | 512Mi |
| `plg-grafana` | 1 | 100m | 256Mi |
| `plg-alertmanager` | 1 | 100m | 128Mi |
| `plg-ches-adapter` | 2 | 140m | 256Mi |
| **Supporting total** | **10** | **1740m** | **2664Mi** |

---

## Per-instance footprint

### At minimum replicas (steady-state floor)

| Deployment | Replicas | CPU | Memory |
|---|---|---|---|
| backend-services | 2 | 320m | 2240Mi |
| temporal-worker | 2 | 320m | 1728Mi |
| temporal-server | 2 (fixed) | 600m | 1088Mi |
| temporal-ui | 1 (fixed) | 50m | 128Mi |
| frontend | 2 | 200m | 320Mi |
| _Application subtotal_ | _9_ | _1490m_ | _5504Mi_ |
| Supporting workloads (see above) | 10 (fixed) | 1740m | 2664Mi |
| **Instance total (min)** | **19** | **3230m** | **8168Mi** |

### At maximum replicas (HPA ceiling)

| Deployment | Replicas | CPU | Memory |
|---|---|---|---|
| backend-services | 3 | 480m | 3360Mi |
| temporal-worker | 3 | 480m | 2592Mi |
| temporal-server | 2 (fixed) | 600m | 1088Mi |
| temporal-ui | 1 (fixed) | 50m | 128Mi |
| frontend | 3 | 300m | 480Mi |
| _Application subtotal_ | _12_ | _1910m_ | _7648Mi_ |
| Supporting workloads (see above) | 10 (fixed) | 1740m | 2664Mi |
| **Instance total (max)** | **22** | **3650m** | **10312Mi** |

### How these numbers were obtained

The supporting-workload figures are measured, not derived from the manifests: every
running pod's container requests were summed in `fd34fb-prod` on 2026-08-12. The
application rows above move with HPA state from one hour to the next; the supporting
rows are fixed and were identical in every sample.

That measurement reproduces the observed `fd34fb-test` quota figures at the top of this
document. Applying the memory requests that were in effect on 2026-07-17 (256Mi for both
backend-services and temporal-worker), one instance at minimum replicas works out to
**3230m CPU** and **5608Mi memory** — against 3230m and 5736Mi observed, i.e. exact on
CPU and within 2% on memory. The observation was therefore a single instance, not two.

Re-measure the whole namespace with:

```bash
oc get pods -n <namespace> --field-selector=status.phase=Running \
  -o jsonpath='{range .items[*].spec.containers[*]}{.resources.requests.cpu}{" "}{.resources.requests.memory}{"\n"}{end}' \
  | awk '{c=$1; m=$2; sub("m","",c);
          if (m ~ /Gi$/) {sub("Gi","",m); m=m*1024} else sub("Mi","",m);
          C+=c; M+=m} END {printf "cpu=%dm memory=%dMi\n", C, M}'
```

The phase filter matters: only `Running` pods count against a `ResourceQuota`, so
completed backup jobs would otherwise inflate the total (they added ~1000m in one
sample).

---

## Namespace headroom model (fd34fb-test: 4000m CPU / 16384Mi memory)

| Scenario | CPU used | CPU % | Memory used | Memory % |
|---|---|---|---|---|
| **1 instance @ min** | **3230m** | **81%** | **8168Mi** | **50%** |
| 1 instance @ max | 3650m | 91% | 10312Mi | 63% |
| 2 instances @ min | 6460m | **162% — EXCEEDS CPU QUOTA** | 16336Mi | **100% — EXCEEDS MEM QUOTA** |

**Supported configuration: 1 instance per shared namespace.**

- At **min replicas** a single instance consumes **81% CPU and 50% memory**. CPU is the
  binding constraint and always has been; memory has headroom.
- At **max replicas** it reaches **91% CPU and 63% memory** — still inside the quota, which
  is the point of capping `maxReplicas` at 3. Under the previous ceilings (backend 5,
  worker 4, frontend 4) the same instance reached **4230m, or 106% of the quota**, and new
  pods stayed `Pending`. That is the failure this document exists to prevent.
- **2 instances cannot fit**, on either resource, even at minimum replicas. This is not a
  consequence of the memory increases recorded here — CPU requests are unchanged, so two
  instances were already 162% of the CPU quota before them.

> **Rolling-update surge budget:** each rolling deployment adds up to 1 extra pod
> (`maxSurge: 1`). A simultaneous rollout of all five application deployments adds
> 770m — 160m (backend) + 160m (worker) + 100m (frontend) + 300m (temporal-server) +
> 50m (temporal-ui). From a 3230m floor that is exactly 4000m: the quota ceiling, with
> nothing to spare. Stagger rollouts, and expect `FailedScheduling` if an HPA has already
> scaled anything out when a deploy starts.

> **Deploying a second instance into the same namespace requires a quota increase**, not
> a configuration change. Rough figures for a shared namespace intended to hold two
> instances: **8000m CPU and 20Gi memory**. Requests go through the Platform Services
> team.

---

## HPA settings rationale

### maxReplicas reduction

Previous values (backend 5, worker 4, frontend 4) allowed a single instance to reach
2490m CPU across its application deployments, or **4230m including its databases and
monitoring stack — 106% of the 4000m quota**. One instance at full HPA stretch was
therefore enough on its own to leave new pods `Pending`; a second instance was never
required to reach the ceiling.

New values (all capped at 3) reduce the application peak to 1910m and the instance peak
to **3650m (91%)**, which fits.

### Target utilization raised to 80%

Previous targets (CPU 70–75%) caused HPAs to trigger scale-outs at relatively low actual
load, consuming the headroom that rolling updates and the instance's own databases and
monitoring stack need. Raising to 80% means scale-out only when pods are genuinely busy.

### Scale-up stabilization windows extended

| HPA | Old window | New window | Rationale |
|---|---|---|---|
| backend-services | 60 s | 120 s | Prevents reacting to sub-minute CPU spikes (e.g. auth token validation bursts) |
| temporal-worker | 120 s | 180 s | Workers handle long-running activities; short-lived load spikes do not warrant a new pod |
| frontend | 60 s | 120 s | Static nginx; load spikes are almost always cache misses, not sustained |

### Scale-up rate limited to 1 pod / 60 s

Previous backend-services and frontend policies allowed doubling pod count every 30 s
(100% per 30 s). Replacing with `max(50% per 60 s, 1 pod per 60 s)` makes scaling
additive at one pod per minute, keeping aggregate namespace CPU growth predictable.

---

## Database connection headroom

With `maxReplicas: 3` for both backend-services and temporal-worker:

| Service | Max pods | DB_POOL_MAX | Max connections |
|---|---|---|---|
| backend-services | 3 | 10 | 30 |
| temporal-worker | 3 | 3 | 9 |
| **Total** | | | **39** |

This is well within the Crunchy Postgres default `max_connections = 100`, leaving
headroom for migrations, monitoring tools, and pgAdmin.

---

## Storage quota (separate concern)

The `fd34fb-test` `storage-quota` of 64Gi is 100% consumed independently of compute
scaling. Root causes include:

- CrunchyDB WAL and backup PVCs (test base: 10Gi each; prod: 15Gi `app-pg` / 22Gi `temporal-pg` via `components/prod-resources`)
- MinIO document storage PVCs

For short-lived test instances, the base 10Gi backup PVC values are used as-is. Storage quota exhaustion
is an operational concern and does not interact with HPA behaviour.

---

## Monitoring commands

```bash
# Quota utilisation
oc describe resourcequota -n <namespace>

# HPA status across all instances
oc get hpa -n <namespace>

# Detailed HPA events (shows scale decisions)
oc describe hpa <instance>-backend-services -n <namespace>
oc describe hpa <instance>-temporal-worker   -n <namespace>
oc describe hpa <instance>-frontend          -n <namespace>

# Current pod CPU/memory vs requests
oc adm top pods -n <namespace> --containers
```
