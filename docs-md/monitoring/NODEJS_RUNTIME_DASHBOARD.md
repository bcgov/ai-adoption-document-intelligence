# Node.js Runtime Grafana Dashboard

## Overview

The Node.js Runtime dashboard provides visibility into the health and performance of the backend-services Node.js process. All metrics are collected automatically by `prom-client` default metrics and scraped by Prometheus.

## Dashboard Location

- **Grafana UID**: `nodejs-runtime`
- **Title**: Node.js Runtime
- **Tags**: `nodejs`, `runtime`, `performance`
- **File**: `deployments/openshift/helm/plg/dashboards/nodejs-runtime.json`

## Panels

### Heap Usage

Displays Node.js heap memory consumption over time using three metrics:

| Metric | Description |
|--------|-------------|
| `nodejs_heap_space_size_used_bytes` | Used bytes per heap space (new_space, old_space, code_space, etc.) |
| `nodejs_heap_space_size_total_bytes` | Total allocated heap size across all spaces |
| `process_heap_bytes` | Process-level heap size including external/native memory |

Use this panel to detect memory leaks (steadily rising used heap) or excessive memory allocation.

### Event Loop Lag

Displays event loop delay using `prom-client` default event loop lag metrics:

| Metric | Description |
|--------|-------------|
| `nodejs_eventloop_lag_seconds` | Current event loop lag |
| `nodejs_eventloop_lag_mean_seconds` | Mean event loop lag |
| `nodejs_eventloop_lag_p99_seconds` | 99th percentile event loop lag |

High event loop lag indicates the main thread is blocked by synchronous operations, causing degraded request handling.

### GC Pause Durations

Displays garbage collection pause durations from the `nodejs_gc_duration_seconds` histogram, broken down by GC kind (major, minor, incremental, weakcb):

- **Average duration** per GC kind (sum/count rate)
- **p95 duration** per GC kind
- **p99 duration** per GC kind

Frequent or long GC pauses (especially major GC) indicate memory pressure and can cause latency spikes.

### Active Handles

Displays the count of active handles (`nodejs_active_handles_total`) in the Node.js process. Active handles include sockets, timers, file descriptors, and other OS-level resources.

A steadily increasing handle count may indicate resource leaks (e.g., unclosed sockets or timers).

## Provisioning

The dashboard is shipped as a Grafana JSON definition and provisioned automatically via a Kubernetes ConfigMap when the PLG Helm chart is deployed. The ConfigMap template at `deployments/openshift/helm/plg/templates/grafana-dashboards-configmap.yaml` includes the dashboard file.

## Data Source

The dashboard uses a Prometheus data source variable (`prometheus_datasource`) that auto-resolves to the configured Prometheus instance. No Loki data source is required for this dashboard.
