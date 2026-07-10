# Logs Explorer Grafana Dashboard

## Overview

The Logs Explorer dashboard provides a pre-configured interface for browsing and filtering application logs stored in Loki. It is shipped as part of the PLG Helm chart and automatically provisioned in Grafana via a ConfigMap.

## Dashboard Location

- **File**: `deployments/openshift/helm/plg/dashboards/logs-explorer.json`
- **Grafana UID**: `logs-explorer`
- **Provisioned via**: `grafana-dashboards-configmap.yaml` ConfigMap

## Template Variables

The dashboard exposes the following filter variables in the Grafana UI:

| Variable | Type | Description |
|----------|------|-------------|
| `service` | Query (label_values) | Dropdown populated from Loki `service` labels (e.g., `backend-services`, `temporal-worker`). Supports "All" selection. |
| `level` | Custom | Dropdown with predefined values: `debug`, `info`, `warn`, `error`. Supports "All" selection. Acts as the error quick-filter when set to `error`. |
| `userId` | Textbox | Free-text input to filter logs by `userId` field. Leave blank or "All" to show all users. |
| `sessionId` | Textbox | Free-text input to filter logs by `sessionId` field. Leave blank or "All" to show all sessions. |

## LogQL Query

The logs panel uses the following LogQL query:

```
{service=~"$service"} | json | level=~"$level" | userId=~"$userId" | sessionId=~"$sessionId"
```

This query:
1. Selects log streams by the `service` label
2. Parses the NDJSON log lines with `| json`
3. Filters parsed fields by `level`, `userId`, and `sessionId` using regex matching from the template variables

## Usage

### Filter by Service

Select a service from the **Service** dropdown at the top of the dashboard. Available services are dynamically loaded from Loki labels.

### Filter by User or Session

Enter a `userId` or `sessionId` value in the corresponding text input. This shows all API activity for that user or within that session.

### Quick-Filter for Errors

Select `error` from the **Level** dropdown to display only error-level logs.

## Prerequisites

- Loki data source configured in Grafana (US-007)
- Application logs include `sessionId` and `userId` fields (US-001, US-003)
- Services labeled in Loki with the `service` label (configured via Promtail)
