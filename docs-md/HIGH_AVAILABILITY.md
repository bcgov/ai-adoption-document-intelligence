# High Availability Configuration

This document describes the HA configuration for backend-services, temporal-worker, frontend, and supporting services.

## PodDisruptionBudgets (PDB)

PodDisruptionBudgets ensure minimum availability during voluntary disruptions (node drains, cluster upgrades, manual evictions).

### Configured PDBs

| Service | Min Available | Notes |
|---------|---------------|-------|
| backend-services | 1 | At least 1 pod must remain during disruptions |
| temporal-worker | 1 | At least 1 worker must remain to process workflows |
| temporal-server | 1 | At least 1 server must remain for workflow coordination |
| frontend | 1 | At least 1 frontend must remain for user access |
| ches-adapter | 1 | At least 1 adapter must remain (from 2 replicas) |

**Important:** PDBs only protect against *voluntary* disruptions. They do not prevent involuntary disruptions like node failures or out-of-memory kills.

## HorizontalPodAutoscaler (HPA)

HPAs automatically scale deployments based on CPU and memory utilization.

### Backend Services HPA

- **Min Replicas:** 2 (for HA)
- **Max Replicas:** 5 (limited by database connection pool capacity)
- **Scale Trigger:** CPU 75% or Memory 80%
- **Scale Up:** Add up to 100% of current pods or 2 pods (whichever is higher) every 30s
- **Scale Down:** Remove up to 50% of current pods every 60s, with 5 min stabilization window

**Connection Pool Limit:**  
Each backend-services pod uses `DB_POOL_MAX` connections (default **20** in dev / load-test overlays, **10** recommended in prod when HPA max is 5). With 5 pods at `DB_POOL_MAX=10`, that's 50 connections to PostgreSQL.

### Temporal Worker HPA

- **Min Replicas:** 2 (for HA)
- **Max Replicas:** 4 (limited by database connection pool capacity)
- **Scale Trigger:** CPU 70% or Memory 75%
- **Scale Up:** Add up to 50% of current pods or 1 pod (whichever is higher) every 60s
- **Scale Down:** Remove up to 50% of current pods every 120s, with 10 min stabilization window

**Connection Pool Limit:**  
Each temporal-worker pod uses `DB_POOL_MAX=3` connections. With 4 pods max, that's 12 connections to PostgreSQL.

**Scale Behavior:**  
Temporal workers scale more conservatively than backend-services because:
1. They process long-running workflows (up to 55s graceful shutdown)
2. Scaling down too quickly can interrupt in-flight activities
3. Workers have lighter database load than backend-services

### Frontend HPA

- **Min Replicas:** 2 (for HA)
- **Max Replicas:** 4
- **Scale Trigger:** CPU 75% or Memory 80%
- **Scale Up:** Add up to 100% of current pods or 1 pod (whichever is higher) every 30s
- **Scale Down:** Remove up to 50% of current pods every 60s, with 5 min stabilization window

**No Database Limit:**  
Frontend is nginx serving static files, so no database connections are used. Max replicas can be increased if needed.

## Database Connection Pool Capacity

PostgreSQL default `max_connections` is 100. Our configuration uses:

| Service | Pods (max) | Connections per Pod | Total Connections |
|---------|------------|---------------------|-------------------|
| backend-services | 5 | 10 (prod) / 20 (dev) | 50 / 100 |
| temporal-worker | 4 | 3 | 12 |
| **Total** | **9** | - | **62 / 112** |

Use **prod** column values (`DB_POOL_MAX=10`) for steady-state HA. The dev default (`20`) is sized for single-replica load testing and removes the ~7 req/s read ceiling documented in [LOAD_TEST_REPORT_2026-05.md](../LOAD_TEST_REPORT_2026-05.md).

This leaves headroom for:
- Interactive queries (pgAdmin, psql)
- Migrations (run in initContainer)
- Monitoring tools
- Connection overhead

**To increase max pods:**
1. Calculate new total connections: `(backend_pods * DB_POOL_MAX) + (worker_pods * 3)`
2. Ensure total < 80 (leaving 20% headroom)
3. Or increase PostgreSQL `max_connections` in CrunchyDB cluster config
4. Update HPA `maxReplicas` and/or lower `DB_POOL_MAX` accordingly

## Migration Safety

The backend-services deployment uses an initContainer to run Prisma migrations with advisory locks, ensuring only one pod runs migrations at a time.

**Important:** The HPA respects the RollingUpdate strategy (`maxSurge: 1, maxUnavailable: 0`), which means:
- New pods are added one at a time during scale-up
- Each pod's initContainer runs migrations sequentially
- Prisma's advisory locks prevent concurrent migration attempts
- This is safe even when scaling from 1→N replicas

**Caution:** Do NOT use `kubectl scale --replicas=N` to bypass the HPA, as this can create multiple pods simultaneously and cause migration races.

## Resource Requests/Limits

All pods have resource requests and limits defined, which are required for HPA to function:

| Service | CPU Request | Memory Request | CPU Limit | Memory Limit |
|---------|-------------|----------------|-----------|--------------|
| backend-services | 100m | 256Mi | 500m | 512Mi |
| temporal-worker | 100m | 256Mi | 500m | 512Mi |
| frontend | 50m | 64Mi | 200m | 128Mi |

These values may need adjustment based on actual workload metrics.

## Monitoring HPA

Check HPA status:
```bash
kubectl get hpa -n <namespace>
```

View detailed metrics:
```bash
kubectl describe hpa backend-services -n <namespace>
kubectl describe hpa temporal-worker -n <namespace>
kubectl describe hpa frontend -n <namespace>
```

## Testing HA

1. **Test PDB during node drain:**
   ```bash
   kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data
   ```
   Verify that at least 1 pod remains available during the drain.

2. **Test HPA scaling:**
   ```bash
   # Generate load on backend-services
   kubectl run -i --tty load-generator --rm --image=busybox --restart=Never -- /bin/sh
   while true; do wget -q -O- http://backend-services:3002/health; done
   
   # Watch HPA scale up
   kubectl get hpa -w
   ```

3. **Test graceful shutdown:**
   ```bash
   kubectl delete pod <pod-name> -n <namespace>
   # Check logs to verify graceful shutdown with no connection errors
   ```

## Temporal Worker Concurrency Configuration

Each Temporal worker pod has concurrency limits to control parallel task execution:

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS` | 10 | Max parallel activities per worker pod |
| `MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS` | 100 | Max parallel workflow decision tasks per worker pod |

### Activity Concurrency

**Per-pod limit:** 10 concurrent activities  
**Total capacity with HPA:** 2-4 pods × 10 = **20-40 concurrent activities**

**Rationale:**
- Activities are I/O-bound (Azure AI API calls, database queries, blob storage)
- Each activity has a `startToCloseTimeout` (typically 2-30 minutes)
- 10 per pod balances throughput with memory usage (512Mi limit per pod)
- Activities may spawn child processes or use significant memory for document processing

**Scaling behavior:**
- Low load: 2 pods × 10 = 20 concurrent activities
- High load: HPA scales to 4 pods × 10 = 40 concurrent activities
- If all 40 slots are busy, new activities queue in Temporal server until a slot opens

### Workflow Task Concurrency

**Per-pod limit:** 100 concurrent workflow decision tasks  
**Total capacity with HPA:** 2-4 pods × 100 = **200-400 concurrent decision tasks**

**Rationale:**
- Workflow tasks are lightweight in-memory operations (decision logic, conditional branching)
- They complete quickly (typically <100ms)
- High concurrency (100/pod) ensures workflows don't block waiting for decision slots
- Minimal memory impact compared to activities

### Tuning Guidelines

**Increase activity concurrency if:**
- Workflows queue for long periods despite idle worker CPU/memory
- Temporal dashboard shows high \"Activity Task Schedule-to-Start Latency\"
- Activities are very lightweight (quick database queries, simple transforms)

**Decrease activity concurrency if:**
- Worker pods hit memory limits (OOMKilled)
- Activities frequently timeout due to resource contention
- Database connection pool exhausted (each activity may use a DB connection)

**Monitor:**
```bash
# Check worker resource usage
kubectl top pods -l app=temporal-worker

# Check Temporal metrics
curl http://temporal-worker:9091/metrics | grep temporal_worker

# View Temporal dashboard
oc port-forward svc/temporal-ui 8080:8080
# Open http://localhost:8080 and check \"Workers\" tab
```

**Connection pool capacity check:**
```bash
# Each activity may hold a DB connection for its duration
# Ensure: (max worker pods * activity concurrency) * DB usage per activity < DB_POOL_MAX * max pods
# Example: 4 pods * 10 activities = 40, with DB_POOL_MAX=3 per pod = 12 total connections
# This is safe because not all activities use the DB simultaneously
```
