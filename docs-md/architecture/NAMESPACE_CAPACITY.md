# Namespace Capacity Model

This document records the per-instance resource footprint, the resulting namespace quota
headroom, and the rationale for HPA `maxReplicas` and scale-up policy choices.

## Background

Shared OpenShift namespaces (e.g. `fd34fb-test`) apply a `ResourceQuota` that is
shared across every instance deployed to that namespace. When HPAs across multiple
instances scale up simultaneously they can collectively exhaust the quota ceiling,
causing new pods to stay `Pending` (`FailedScheduling`) and rollouts to stall.

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
| `logrotate` | 10m | 32Mi |
| `promtail` | 50m | 64Mi |
| **Pod total** | **160m** | **1120Mi** |

### temporal-worker pod

| Container | CPU req | Memory req |
|---|---|---|
| `temporal-worker` | 100m | 768Mi |
| `logrotate` | 10m | 32Mi |
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
| **Instance total (min)** | **9** | **1490m** | **5504Mi** |

### At maximum replicas (HPA ceiling)

| Deployment | Replicas | CPU | Memory |
|---|---|---|---|
| backend-services | 3 | 480m | 3360Mi |
| temporal-worker | 3 | 480m | 2592Mi |
| temporal-server | 2 (fixed) | 600m | 1088Mi |
| temporal-ui | 1 (fixed) | 50m | 128Mi |
| frontend | 3 | 300m | 480Mi |
| **Instance total (max)** | **12** | **1910m** | **7648Mi** |

---

## Namespace headroom model (fd34fb-test: 4000m CPU / 16384Mi memory)

| Scenario | CPU used | CPU % | Memory used | Memory % |
|---|---|---|---|---|
| 1 instance @ min | 1490m | 37% | 5504Mi | 34% |
| 1 instance @ max | 1910m | 48% | 7648Mi | 47% |
| **2 instances @ min** | **2980m** | **75%** | **11008Mi** | **67%** |
| 2 instances @ max | 3820m | 96% | 15296Mi | 93% |
| 3 instances @ min | 4470m | **112% — EXCEEDS CPU QUOTA** | 16512Mi | **101% — EXCEEDS MEM QUOTA** |

**Supported configuration: 2 instances per shared namespace.**

- At **min replicas** both instances consume **75% CPU and 67% memory**, leaving headroom
  for rolling-update surge pods during deployments.
- At **max replicas** both instances consume **96% CPU and 93% memory**. This worst case
  requires both instances to be at full HPA ceiling simultaneously. Under correctly-sized
  requests (backend ~72% at steady state, worker ~73%), the memory HPA metric will not
  trigger scale-out at normal load — scale-out will only occur under genuine CPU load spikes.
  The max scenario is therefore only expected during benchmark or load-test runs.
- **3 instances cannot fit** within either the CPU or memory quota even at minimum replicas.

> **Rolling-update surge budget:** each rolling deployment adds up to 1 extra pod
> (`maxSurge: 1`). During a deploy, a worst-case surge across all 5 HPA-managed deployments
> in 2 instances is 10 extra pods ≈ 1400m additional CPU requests. Because the base
> is at 2980m (75%), there is only 1020m spare — enough for a controlled 2-at-a-time
> deploy but not all 5 services simultaneously. Stagger rollouts when possible.

---

## HPA settings rationale

### maxReplicas reduction

Previous values (backend 5, worker 4, frontend 4) allowed a single instance to reach
2490m CPU. With two instances at peak, aggregate demand was 4980m — 24% above the 4000m
quota ceiling, which caused new pods to remain `Pending`.

New values (all capped at 3) reduce the per-instance peak to 1910m. Two-instance
aggregate at peak: 3820m (96%).

### Target utilization raised to 80%

Previous targets (CPU 70–75%) caused HPAs to trigger scale-outs at relatively low actual
load, consuming namespace headroom that neighbour instances needed. Raising to 80% means
scale-out only when pods are genuinely busy.

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

- CrunchyDB WAL and backup PVCs (default `PG_BACKUP_STORAGE_SIZE=10Gi`)
- MinIO document storage PVCs

See `docs-md/operations/ENVIRONMENT_CONFIGURATION.md` for `PG_BACKUP_STORAGE_SIZE`
guidance. Reduce to `2Gi` for short-lived test instances. Storage quota exhaustion
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
