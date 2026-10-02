# Azure Log Analytics Log Mirror

Mirrors local application logs to an Azure Log Analytics workspace so an **Azure SRE Agent** can assess app health. A Fluent Bit container tails the same files Promtail watches and ships a filtered subset to Log Analytics through the [Logs Ingestion API](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/logs-ingestion-api-overview).

This runs **alongside** the Loki pipeline and does not modify it — Promtail, Loki, and Grafana behave exactly as before. See [LOCAL_MONITORING_STACK.md](LOCAL_MONITORING_STACK.md).

```
logs/*.log ─┬─> Promtail ──> Loki ──> Grafana                       (unfiltered, unchanged)
            └─> Fluent Bit ──> DCE ──> DCR ──> Log Analytics        (health-filtered)
```

> **Do not use the legacy HTTP Data Collector API.** It was retired on 14 September 2026. Post-retirement it still accepts requests, returns **HTTP 200**, and even auto-creates custom tables with an inferred schema — but ingests nothing. Verified on 24 September 2026: three tables existed with correct columns and **zero queryable rows across a 20-year window**. A 200 from that API is not evidence of working ingestion; only a successful query is.

## Why Fluent Bit and not Promtail

Promtail only speaks the Loki push protocol, and Loki has no outbound exporter, so a second shipper is required.

## Azure prerequisites

Create these once, in the subscription holding your workspace.

1. **Data Collection Endpoint (DCE)** in the same region as the workspace. Note its *Logs ingestion* URI.
2. **Custom table** `DocIntelLocal_CL` in the workspace with these columns:

   | Column | Type | Description |
   | --- | --- | --- |
   | `TimeGenerated` | datetime | Required by Log Analytics |
   | `Service` | string | `backend-services`, `temporal-worker`, `frontend`, `ches-adapter` |
   | `Project` | string | `host` or `monitoring` (mirrors the Promtail label) |
   | `Level` | string | `warn`, `error`, `info`, or `unknown` |
   | `StatusCode` | int | Present only on failed HTTP request records |
   | `AlertType` | string | Present when the line carries `alertType` |
   | `RawData` | string | The original log line, ANSI stripped |

3. **Data Collection Rule (DCR)** bound to that DCE and workspace, with a stream declaration
   `Custom-DocIntelLocal_CL` listing the columns above plus `EventTime` (string), and this transform:

   ```kusto
   source
   | extend _eventTime = todatetime(EventTime)
   | extend TimeGenerated = iff(isnull(_eventTime), TimeGenerated, _eventTime)
   | project TimeGenerated, Service, Project, Level, StatusCode, AlertType, RawData
   ```

   DCR transformations implement only a [subset of KQL](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/data-collection-transformations-kql). `coalesce` is **not** available and fails validation with `InvalidTransformQuery`; `iff`/`isnull` are. Testing the converted value rather than the raw string also covers a malformed `EventTime`, which would otherwise produce a null `TimeGenerated` and get the record rejected.

   Record the DCR's **immutable ID** (`dcr-…`) from its JSON view.

4. **Ingestion permission.** This setup authenticates as *you* via a local token broker, so grant your own user **Monitoring Metrics Publisher** on the DCR. A workspace-scoped grant is not sufficient and yields 403 on ingest.

   ```bash
   DCR_RES_ID=$(az monitor data-collection rule show -g "$RG" -n docintel-local-dcr --query id -o tsv)
   az role assignment create \
     --assignee-object-id "$(az ad signed-in-user show --query id -o tsv)" \
     --assignee-principal-type User \
     --role "Monitoring Metrics Publisher" --scope "$DCR_RES_ID"
   ```

Full walkthrough: [Tutorial: Send data to Azure Monitor Logs with Logs ingestion API](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/tutorial-logs-ingestion-portal).

## Authentication: local token broker

The Logs Ingestion API requires an Entra token. Rather than an app registration and a long-lived client secret, [`scripts/azure-token-broker.js`](../../scripts/azure-token-broker.js) serves the developer's own token from their `az login` session at a loopback OAuth2 endpoint, and Fluent Bit's `auth_url` points at it.

```bash
npm run token-broker
```

It starts automatically with the **Dev: all + monitoring** VS Code task. `Dev: all` does not start it.

Three constraints make this work, and breaking any one of them breaks ingestion:

- **Fluent Bit 5.1 or newer.** `auth_url` does not exist before then; 4.x and 5.0 reject it as an unknown property and the output fails to initialise. The image is pinned to `5.1.2` for this reason.
- **Host networking on the container.** The plugin only permits plain HTTP for `auth_url` when the address is loopback, so `127.0.0.1` must mean the host. `host.docker.internal` is not a loopback address and would require HTTPS.
- **An active `az login` session.** The broker shells out to `az account get-access-token`; it reads no credential files itself and binds to `127.0.0.1` only, so the token never leaves the host.

### Limitations

Conditional access will eventually force interactive re-authentication, after which the broker returns 500 and delivery stops until you run `az login` again. Fluent Bit buffers and retries meanwhile, so short gaps lose nothing. **This is a local development mechanism — it is not suitable for unattended or shared deployments.**

### Alternative: app registration

For unattended use, register an app, grant it **Monitoring Metrics Publisher** on the DCR, and replace `auth_url` with credentials:

```yaml
      tenant_id: ${AZURE_LOGS_TENANT_ID}
      client_id: ${AZURE_LOGS_CLIENT_ID}
      client_secret: ${AZURE_LOGS_CLIENT_SECRET}
```

Drop `network_mode: host` from the compose service at the same time; it is only needed for the broker.

## Configuration

Add to the repo-root `.env` (gitignored). With the token broker there is no secret to store:

```bash
AZURE_LOGS_AUTH_URL=http://127.0.0.1:8899/token
AZURE_LOGS_DCE_URL=https://<dce-name>.<region>.ingest.monitor.azure.com
AZURE_LOGS_DCR_ID=dcr-<immutable id>
AZURE_LOGS_TABLE_NAME=DocIntelLocal_CL
```

Start it with the rest of the monitoring stack:

```bash
npm run token-broker &
docker compose --profile monitoring up -d
docker compose logs -f fluent-bit
```

The mirror is part of the `monitoring` profile, so `npm run pod:base` and `npm run pod:all` pick it up too.

## What gets mirrored

Filtering is deliberately aggressive: the SRE agent needs health signal, and Log Analytics bills per ingested GB. Loki keeps the complete, unfiltered record for detailed debugging. Rules live in [`deployments/local/fluent-bit/filters.lua`](../../deployments/local/fluent-bit/filters.lua).

| Source | Mirrored | Dropped |
| --- | --- | --- |
| `backend-services`, `temporal-worker` | NDJSON lines at or above `MIN_RANK` in [`filters.lua`](../../deployments/local/fluent-bit/filters.lua); `Request completed` / `Request failed` lines with `statusCode` >= 400; unstructured lines matching failure patterns (`ERROR`, `Error:`, `Exception`, `ECONNREFUSED`, `EADDRINUSE`, `Cannot find module`, …) | Lines below `MIN_RANK`, NestJS bootstrap chatter, webpack bundle output |
| `frontend` | Allowlist only — Vite has no level field, so lines are matched against error/warning patterns (`Pre-transform error`, `Internal server error`, `EADDRINUSE`, `Failed`, `Warning`, …) | Startup banner, HMR updates, page reloads, dependency re-optimization, npm script echo |
| `ches-adapter` | Everything (low volume, sits on the alert-delivery path) | Blank lines only |

`MIN_RANK` controls the structured-log threshold: `30` mirrors warn and above (lowest volume), `20` also includes every `info` line, which adds successful request records and routine startup logs at a substantial increase in ingested volume.

Both log files carry ANSI colour codes from NestJS and Vite; these are stripped before sending.

### Coverage note: pre-handler rejections

Nest runs guards and route matching before interceptors, so 404s and 401/403s never reach `RequestLoggingInterceptor`. `RequestFailureLoggingFilter` logs them as `warn`, which is what makes them visible here — see [LOGGING.md](LOGGING.md). Before that filter existed, hitting an unknown URL produced no log line at all and therefore nothing to mirror.

### Two filtering pitfalls worth knowing

- **`alertType` is not an alert marker.** It is attached to routine `info`/`debug` lines such as `Wrote blob` and `Ensured container exists`. It only drives Prometheus counters at `warn`/`error` (see [LOGGING.md](LOGGING.md)), so it must not be used to force-retain a line.
- **Noise patterns must be narrow.** Frontend keep-patterns are evaluated *before* noise patterns precisely because a loose noise pattern silently destroys real failures — `"ready in "` matches `"address already in use"`, which would have discarded every port-conflict error.

## Schema and timestamps

The DCR transform projects the columns directly, so KQL uses unsuffixed names:

| Field sent | Column in `DocIntelLocal_CL` | Notes |
| --- | --- | --- |
| `TimeGenerated` | `TimeGenerated` | Fluent Bit's read time, overridden by `EventTime` in the DCR transform when present |
| `EventTime` | *(consumed by the transform)* | The app's own ISO-8601 timestamp, when the line had one |
| `Service` | `Service` | `backend-services`, `temporal-worker`, `frontend`, `ches-adapter` |
| `Project` | `Project` | `host` or `monitoring` (mirrors the Promtail label) |
| `Level` | `Level` | `warn`, `error`, `info`, or `unknown` |
| `StatusCode` | `StatusCode` | Present only on failed HTTP request records |
| `AlertType` | `AlertType` | Present when the line carries `alertType` |
| `RawData` | `RawData` | The original log line, ANSI stripped |

Structured lines keep their app timestamp because the DCR transform prefers `EventTime`. Unstructured lines (NestJS bootstrap output, Vite errors) have none, so they fall back to Fluent Bit's read time — within a second on a live tail.

## Verifying

```kusto
DocIntelLocal_CL
| where TimeGenerated > ago(1h)
| summarize count() by Service, Level
```

```kusto
DocIntelLocal_CL
| where TimeGenerated > ago(1h) and Level == "error"
| project TimeGenerated, Service, StatusCode, AlertType, RawData
| order by TimeGenerated desc
```

Rows only arrive once something actually logs a warn/error. A request to an unmatched route produces one (see the coverage note above):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/api/does-not-exist
```

**Confirm with a query, not a status code.** Ingestion acknowledgement does not prove the data is queryable — that is exactly how the retired legacy API misleads.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `unknown configuration property 'auth_url'` | Fluent Bit older than 5.1 |
| `oauth2` / connection refused to `127.0.0.1:8899` | Broker not running (`npm run token-broker`), or the container lacks `network_mode: host` |
| Broker returns 500 | `az login` session expired — re-authenticate |
| HTTP 403 | Missing **Monitoring Metrics Publisher** on the DCR — a workspace-scoped grant is not enough |
| HTTP 404 | Wrong DCR immutable ID, or the stream is not named `Custom-<table>` |
| HTTP 400 on every record | Stream declaration does not match the fields Fluent Bit sends |
| `http_status=204` but no rows | Usually just first-write latency; measured at ~7 minutes on a new table. Re-query before assuming failure |
| No rows, no errors | Everything was filtered out — confirm with `docker compose logs fluent-bit`, or temporarily swap the output for `name: stdout` with `format: json_lines` |

Tail positions persist in the `fluent_bit_data` volume, so a container restart does not re-send history. Remove it with `docker compose --profile monitoring down -v` to force a full re-read.

## Alternative destination: Azure Data Explorer (Kusto)

Not in use — recorded because an Azure SRE Agent can also read logs through a Kusto client, and because switching is cheap if that turns out to be the better-supported integration.

Fluent Bit ships a supported [`azure_kusto`](https://docs.fluentbit.io/manual/data-pipeline/outputs/azure_kusto) output that uses queued ingestion. **The tail inputs and all Lua filtering stay unchanged** — only the output block differs.

### It does not avoid the app registration

The plugin's auth modes are `service_principal` (default), `managed_identity` (requires Azure compute), and `workload_identity` (requires AKS). A local container has the same constraint as the Logs Ingestion API, so ADX is not a way around tenant policy blocking app registrations.

### Setup

```kusto
.create table DocIntelLocal (log:dynamic, tag:string, timestamp:datetime)
.add database <db> ingestors ('aadapp=<client-id>;<tenant-id>')
```

Authorization is a Kusto command, not an Azure RBAC role assignment.

```yaml
    - name: azure_kusto
      match: app.*
      tenant_id: ${AZURE_LOGS_TENANT_ID}
      client_id: ${AZURE_LOGS_CLIENT_ID}
      client_secret: ${AZURE_LOGS_CLIENT_SECRET}
      ingestion_endpoint: https://ingest-<cluster>.<region>.kusto.windows.net
      database_name: ${AZURE_KUSTO_DATABASE}
      table_name: ${AZURE_KUSTO_TABLE}
      compression_enabled: true
```

By default the plugin nests the whole record into the `log` dynamic column, so queries dereference it:

```kusto
DocIntelLocal
| where timestamp > ago(1h) and tostring(log.Level) == "error"
| project timestamp, Service = tostring(log.Service),
          Status = toint(log.StatusCode), Raw = tostring(log.RawData)
```

Use `ingestion_mapping_reference` with a [JSON ingestion mapping](https://learn.microsoft.com/en-us/kusto/management/mappings) if flat typed columns are preferred.

### Tradeoffs

- **Cost:** a paid ADX cluster is always-on compute and far more expensive than Log Analytics at this volume. A [free cluster](https://dataexplorer.azure.com/freecluster) costs nothing and needs no subscription, which suits a local test — but whether free clusters permit *service principal* ingestion is **unverified**; they are aimed at interactive user auth. Confirm before relying on it.
- **Latency:** queued ingestion batches, so expect up to ~5 minutes by default. Relax with
  `.alter table DocIntelLocal policy ingestionbatching '{"MaximumBatchingTimeSpan":"00:00:30"}'`.
- **Querying:** richer KQL surface and faster queries than Log Analytics.

### Why Log Analytics was kept

The DCE, DCR, and `DocIntelLocal_CL` table already exist, leaving only the app registration. ADX needs that same app registration *plus* a cluster, database, table, and ingestion grant — strictly more work for no gain unless the SRE Agent specifically requires Kusto.

