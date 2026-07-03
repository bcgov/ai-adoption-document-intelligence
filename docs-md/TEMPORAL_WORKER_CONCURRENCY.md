# Temporal Worker Concurrency Configuration

This document describes the worker concurrency configuration added in Group 5 of the HA improvements.

## Environment Variables

Add these to `apps/temporal/.env.sample`:

```bash
# Worker Concurrency Configuration (Group 5: HA)
# Controls how many tasks each worker pod can process in parallel
# maxConcurrentActivityTaskExecutions: Max parallel activities per worker (default: 10)
# maxConcurrentWorkflowTaskExecutions: Max parallel workflow decision tasks per worker (default: 100)
MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS=10
MAX_CONCURRENT_WORKFLOW_TASK_EXECUTIONS=100
```

## What Changed

### 1. Worker Configuration (`apps/temporal/src/worker.ts`)

Added two new options to `Worker.create()`:
- `maxConcurrentActivityTaskExecutions`: Limits parallel activity execution per worker pod
- `maxConcurrentWorkflowTaskExecutions`: Limits parallel workflow decision tasks per worker pod

Both the OCR worker and benchmark worker use these settings.

### 2. ConfigMap (`deployments/openshift/kustomize/base/temporal/temporal-worker-configmap.yml`)

Added the two environment variables with defaults and documentation.

### 3. Documentation (`docs-md/HIGH_AVAILABILITY.md`)

Added "Temporal Worker Concurrency Configuration" section explaining:
- Default values and rationale
- Scaling behavior with HPA
- Tuning guidelines
- Monitoring commands

## Why This Matters for HA

When horizontally scaling workers with HPA:
- **Without concurrency limits:** Each worker pod polls unlimited tasks, risking memory exhaustion and DB connection pool depletion
- **With concurrency limits:** Each pod has a predictable capacity, allowing safe horizontal scaling

### Example Capacity Planning

| Scenario | Pods | Activity Concurrency | Total Capacity |
|----------|------|---------------------|----------------|
| Low load | 2 | 10 per pod | 20 activities |
| Medium load | 3 | 10 per pod | 30 activities |
| High load | 4 | 10 per pod | 40 activities |

If 40 activities are running and a 41st starts, it waits in Temporal's task queue until a slot frees up.

## Tuning

Start with defaults (10 activity, 100 workflow tasks) and adjust based on:

**Monitor these metrics:**
- Worker CPU/memory usage (`kubectl top pods`)
- Temporal metrics (`/metrics` endpoint)
- Activity schedule-to-start latency (Temporal dashboard)
- OOMKills or resource throttling

**Common adjustments:**
- **Increase activity concurrency** if workers are idle but tasks are queueing
- **Decrease activity concurrency** if pods hit memory limits or activities timeout
- **Workflow task concurrency** rarely needs tuning (100 is usually sufficient)

## Testing

The worker logs the configured values on startup:
```
Worker initializing {
  ...
  maxConcurrentActivityTaskExecutions: 10,
  maxConcurrentWorkflowTaskExecutions: 100
}
```

Check logs after deployment:
```bash
oc logs deployment/temporal-worker | grep "Worker initializing"
```
