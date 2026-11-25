# Azure Log Analytics Log Mirror

Mirrors local and OpenShift application logs to an Azure Log Analytics workspace so an **Azure SRE Agent** can assess app health. Fluent Bit tails the same files Promtail watches and ships a filtered subset to Log Analytics through the [Logs Ingestion API](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/logs-ingestion-api-overview).

This runs **alongside** the Loki pipeline and does not modify it — Promtail, Loki, and Grafana behave exactly as before. See [LOCAL_MONITORING_STACK.md](LOCAL_MONITORING_STACK.md).

The mirror is off unless it is configured. Locally it has its own Compose profile; on OpenShift the deploy adds it only to environments where every required `AZURE_LOGS_*` setting is set. Before a kept line is sent, the fields that identify a person are removed from it (see [What gets mirrored](#what-gets-mirrored)).

```
logs/*.log ─┬─> Promtail ──> Loki ──> Grafana                       (unfiltered, unchanged)
            └─> Fluent Bit ──> DCE ──> DCR ──> Log Analytics        (health-filtered, identifiers removed)
```

This uses `azure_logs_ingestion` with an Entra application/service principal and client secret, not the legacy workspace-ID/shared-key `azure` output. No workspace shared key is needed.

## Why Fluent Bit and not Promtail

Promtail only speaks the Loki push protocol, and Loki has no outbound exporter, so a second shipper is required.

## Azure prerequisites

Create these once, in the subscription holding your workspace.

1. **Data Collection Endpoint (DCE)** in the same region as the workspace. Note its *Logs ingestion* URI.
2. **Custom table** `DocIntelLocal_CL` in the workspace with these columns:

   | Column | Type | Description |
   | --- | --- | --- |
   | `TimeGenerated` | datetime | Required by Log Analytics |
   | `Service` | string | `backend-services`, `temporal-worker`, `frontend`, `ches-adapter`, or OpenShift `temporal-server` |
   | `Project` | string | Local: `host` or `monitoring`; OpenShift: namespace |
   | `Level` | string | `warn`, `error`, `info`, or `unknown` |
   | `StatusCode` | int | Present only on failed HTTP request records |
   | `AlertType` | string | Present when the line carries `alertType` |
   | `RawData` | string | The log line, ANSI stripped, without the fields removed under [What gets mirrored](#what-gets-mirrored) |

3. **Data Collection Rule (DCR)** bound to that DCE and workspace, with a stream declaration
   `Custom-DocIntelLocal_CL` listing the columns above plus `EventTime` (string), and this transform:

   ```kusto
   source
   | extend _eventTime = todatetime(EventTime)
   | extend TimeGenerated = iff(isnull(_eventTime), TimeGenerated, _eventTime)
   | project TimeGenerated, Service, Project, Level, StatusCode, AlertType, RawData
   ```

   DCR transformations implement a [subset of KQL](https://learn.microsoft.com/en-us/azure/azure-monitor/essentials/data-collection-transformations-kql). Testing the converted value also covers a malformed `EventTime`, which would otherwise produce a null `TimeGenerated`.

   Record the DCR's **immutable ID** (`dcr-…`) from its JSON view.

4. **App registration** with a client secret, granted the **Monitoring Metrics Publisher** role *on the DCR*. A workspace-scoped grant is not sufficient and yields 403 on ingest.

Full walkthrough: [Tutorial: Send data to Azure Monitor Logs with Logs ingestion API](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/tutorial-logs-ingestion-portal).

## Local configuration

Set these in the shell that launches Compose, or in the repo-root `.env` (gitignored; never commit credentials or paste them into logs/chat):

```bash
AZURE_LOGS_TENANT_ID=<tenant guid>
AZURE_LOGS_CLIENT_ID=<app registration client id>
AZURE_LOGS_CLIENT_SECRET=<app registration client secret>
AZURE_LOGS_DCE_URL=https://<dce-name>.<region>.ingest.monitor.azure.com
AZURE_LOGS_DCR_ID=dcr-<immutable id>
AZURE_LOGS_TABLE_NAME=DocIntelLocal_CL
```

Use the **secret value**, not its Azure secret ID. The tenant/client IDs belong to the Entra app; the DCR ID is the **immutable ID**, not its ARM resource path. The table name includes `_CL`, without the `Custom-` prefix: the plugin adds `Custom-` when selecting the DCR stream. The stream must therefore be named `Custom-<AZURE_LOGS_TABLE_NAME>`. The table defaults to `DocIntelLocal_CL` if omitted.

The mirror has its own `azure-logs` Compose profile. Start it on its own (no Loki, Grafana, CHES, or application dependencies are started):

```bash
mkdir -p logs
docker compose --profile azure-logs up -d fluent-bit
docker compose logs -f fluent-bit
```

Run the app locally using the root scripts, which tee stdout/stderr into the files Fluent Bit tails:

```bash
npm run dev
# Or separately: npm run dev:backend, npm run dev:frontend,
# npm run dev:temporal-worker
```

For a compiled backend instead of watch mode, after the normal build:

```bash
mkdir -p logs
(cd apps/backend-services && npm run start:prod) 2>&1 | tee logs/backend-services.log
```

This configuration reads **host log files**, not Docker application stdout. The `app`/`temporal-worker` Compose profiles do not write those files; running those profiles alone does not collect their logs. CHES is the exception: it already writes to the shared `ches_adapter_logs` volume.

The `monitoring` profile does not include the mirror, so full monitoring startup, `npm run pod:base`, and `npm run pod:all` leave it off. Set the Azure variables before starting it: without them Fluent Bit stops at startup (`property 'client_id' is not defined`) and Compose keeps restarting it. To run it with the rest of monitoring, add the profile: `docker compose --profile monitoring --profile azure-logs up -d`. After changing variables, recreate it with `docker compose --profile azure-logs up -d --force-recreate fluent-bit`. Use `podman compose` in place of `docker compose` if that is your local runtime.

## OpenShift deployment

Mirroring is off unless every required `AZURE_LOGS_*` setting is configured for the environment (see [Credential provisioning](#credential-provisioning)). When they are, the deploy adds the [`azure-log-mirror`](../../deployments/openshift/kustomize/components/azure-log-mirror/) Kustomize component: a Fluent Bit sidecar reads each pod's existing `/var/log/app` volume for backend-services, frontend, Temporal server, and Temporal worker. The PLG Helm chart adds the same sidecar to CHES (`azureLogs.enabled`) when CHES notifications are deployed. Promtail and Loki are unchanged.

The shared Fluent Bit files live under [`deployments/fluent-bit/`](../../deployments/fluent-bit/). `scripts/lib/generate-overlay.sh --with-azure-log-mirror` copies the component, `openshift.yaml` and the same `filters.lua` used locally into the generated overlay, where Kustomize generates `<instance>-fluent-bit-config` from them; the CHES chart references this ConfigMap rather than keeping a separate copy. The sidecars use the pod's arbitrary non-root UID, read-only log/config mounts and root filesystem, dropped capabilities, and a writable per-pod `emptyDir` for positions and buffered chunks. No Docker socket, host paths, privileged SCC, or fixed UID is needed.

### Credential provisioning

Configure the same six `AZURE_LOGS_*` settings listed above in the target **GitHub environment secrets** (`dev`, `test`, or `prod`) for CI, or in the selected `deployments/openshift/config/<env>.env` / instance override for `scripts/oc-deploy-instance.sh`. The repo-root local `.env` is **not** used by the OpenShift deployment paths.

`AZURE_LOGS_TABLE_NAME` defaults to `DocIntelLocal_CL`. Whether the mirror is deployed depends on the other five:

| Settings present | Deploy |
| --- | --- |
| All five | Validates them (an HTTPS ingestion endpoint and a `dcr-` ID; an invalid value fails the deploy), creates or updates `<instance>-azure-logs-secrets` **before** applying the workloads, and adds the sidecars |
| None | Deploys without the mirror |
| Some | Deploys without the mirror, and the deploy log warns which settings are missing (names only) |

Only Fluent Bit receives the dedicated Secret; application containers do not. `--skip-plg` skips the Helm stack, not the application's log-mirror sidecars. Removing the settings later removes the sidecars on the next deploy but leaves `<instance>-azure-logs-secrets` in the namespace; delete it if the credentials should go too.

The base kustomization does not include the mirror; the component is built only through the overlay generator, which supplies the Fluent Bit files and the instance name. For a standalone CHES Helm install, set `azureLogs.enabled=true` and supply the ConfigMap and Secret through `azureLogs.configMapName` / `azureLogs.secretName`.

The service principal still needs **Monitoring Metrics Publisher on the DCR**. Allow DNS and outbound HTTPS to `login.microsoftonline.com` and the configured ingestion endpoint in any namespace egress controls. No Azure resource or role assignment is created by these manifests.

### Operation and verification

Use the normal deployment workflow/script: configuring the settings is what turns the mirror on, and no separate flag is required. Each sidecar requests 10m CPU / 64Mi memory and limits usage to 100m / 128Mi, so account for this per replica in namespace quotas.

```bash
oc logs deployment/<instance>-backend-services -c fluent-bit -n <namespace>
oc logs deployment/<instance>-temporal-worker -c fluent-bit -n <namespace>
```

Look for successful OAuth authentication and ingestion `http_status=204`, then confirm the record in the custom table (an acknowledgement alone is not enough). Generate a uniquely named 404 against the deployed backend and query `RawData` for that path.

```kusto
DocIntelLocal_CL
| where TimeGenerated > ago(1h) and Project == "<namespace>"
| summarize count() by Service, Level
```

`Project` uses the namespace to distinguish OpenShift logs from local logs without changing the table schema. Instances sharing a namespace share this value. OpenShift tails new per-pod files from the beginning so early startup warnings are captured. Positions survive sidecar restarts within the same pod, but pod replacement loses positions and buffered chunks; there is no shared multi-replica log/state PVC.

The existing 10 MB app-log truncation remains in place. The mirror also caps its output queue at 64 MB and its state volume at 128Mi. Outages can therefore lose records, and this mirror is not an audit archive. ConfigMap or Secret changes alone do not restart application pods: restart the affected deployments unless a workload change already triggers a rollout. The CHES Helm chart includes configuration/credential checksums, so its next Helm upgrade rolls the adapter when these change; manual changes still require a restart.

## What gets mirrored

Filtering is deliberately aggressive: the SRE agent needs health signal, and Log Analytics bills per ingested GB. Loki retains its existing filtering and retention for detailed debugging. Rules live in [`deployments/fluent-bit/filters.lua`](../../deployments/fluent-bit/filters.lua).

| Source | Mirrored | Dropped |
| --- | --- | --- |
| `backend-services`, `temporal-worker`, OpenShift `temporal-server` | NDJSON lines at or above `MIN_RANK` in [`filters.lua`](../../deployments/fluent-bit/filters.lua); `Request completed` / `Request failed` lines with `statusCode` >= 400; unstructured lines matching failure patterns (`ERROR`, `Error:`, `Exception`, `ECONNREFUSED`, `EADDRINUSE`, `Cannot find module`, …) | Lines below `MIN_RANK`, NestJS bootstrap chatter, webpack bundle output |
| Local `frontend` | Allowlist only — Vite has no level field, so lines are matched against error/warning patterns (`Pre-transform error`, `Internal server error`, `EADDRINUSE`, `Failed`, `Warning`, …) | Startup banner, HMR updates, page reloads, dependency re-optimization, npm script echo |
| OpenShift `frontend` | nginx access lines with status >= 400 (`warn` for 4xx, `error` for 5xx); nginx error-log entries at warn or higher | Successful access logs (including healthy probes), notice/info logs |
| `ches-adapter` | Everything (low volume, sits on the alert-delivery path) | Blank lines only |

### What is removed before sending

A kept line loses what identifies a person; Loki keeps the full line.

- **Structured lines** (`backend-services`, `temporal-worker`, `temporal-server`): the request-context fields `userId`, `actorId`, `sessionId`, `apiKeyId` and `clientIp` are removed wherever they appear in the JSON. `requestId` is kept, so the full line can be found in Loki. A line that is not a single JSON object (framework text, a truncated object) keeps its text, with those fields' values replaced by `[removed]`.
- **OpenShift `frontend` access lines** are reduced to the method, the path without its query string, and the status, for example `GET /api/documents 401`. The client and forwarded addresses, referer and user agent are not sent.
- **OpenShift `frontend` error-log entries** lose their `client` and `referrer` fields and the query strings on `request` and `upstream`.
- **Free text is sent as written:** error messages and stack traces, file names in worker failures, and `ches-adapter` lines (including alert recipients).

`MIN_RANK` controls the structured-log threshold: `30` mirrors warn and above (lowest volume), `20` also includes every `info` line, which adds successful request records and routine startup logs at a substantial increase in ingested volume. Keep the application `LOG_LEVEL` at its default `info` (or `debug`) to retain failed request entries logged at `info`; setting it to `warn` suppresses those entries before Fluent Bit can inspect their status codes.

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
| `Service` | `Service` | `backend-services`, `temporal-worker`, `frontend`, `ches-adapter`, OpenShift `temporal-server` |
| `Project` | `Project` | Local: `host` or `monitoring`; OpenShift: namespace |
| `Level` | `Level` | `warn`, `error`, `info`, or `unknown` |
| `StatusCode` | `StatusCode` | Present only on failed HTTP request records |
| `AlertType` | `AlertType` | Present when the line carries `alertType` |
| `RawData` | `RawData` | The log line, ANSI stripped, without the fields under [What is removed before sending](#what-is-removed-before-sending) |

Structured lines keep their app timestamp because the DCR transform prefers `EventTime`. Unstructured lines (NestJS bootstrap output, Vite/nginx errors) have none, so they fall back to Fluent Bit's read time.

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
curl -H "x-api-key: $API_KEY" -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:3002/api/does-not-exist
```

**Confirm with a query, not just an ingestion response.** Allow a few minutes for rows to become queryable. Generate the request after Fluent Bit starts: new files are tailed from the end by default, not backfilled.

For a smoke test without running the app, append a synthetic warning after the mirror has started and had a few seconds to discover the log file:

```bash
mkdir -p logs
touch logs/backend-services.log
# Wait at least 5 seconds for tail discovery before appending.
printf '%s\n' '{"level":"warn","message":"Azure log mirror smoke test"}' >> logs/backend-services.log
```

Query for `RawData has "Azure log mirror smoke test"`. This exercises authentication, the DCR schema, and delivery independently of the app.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Failed to get access token` | Wrong tenant/client/secret, or the secret expired |
| HTTP 403 | Missing **Monitoring Metrics Publisher** on the DCR — a workspace-scoped grant is not enough |
| HTTP 404 | Wrong DCR immutable ID, or the stream is not named `Custom-<table>` |
| HTTP 400 on every record | Stream declaration does not match the fields Fluent Bit sends |
| No rows after an accepted request | Check the selected workspace/table, DCR destination/transform, query time range, and ingestion delay |
| No rows, no errors | Check that `logs/*.log` are being written after tail discovery and contain warn/error or HTTP >= 400 records; inspect `docker compose logs fluent-bit` |

Tail positions and buffered chunks persist in the `fluent_bit_data` volume, so restarts do not normally re-send history. Each input has its own positions database. Existing file contents are skipped on first discovery (`read_from_head` defaults to false). Do not use `compose down -v` just to reset the mirror: that can delete application and other monitoring volumes too.

The output retries a failed chunk up to five times; after that Fluent Bit can discard it. This is a best-effort local health mirror, not a durable audit sink.

## Configuration regression checks

With dependencies installed and `kubectl`, Helm 3, and Docker available:

```bash
node --test scripts/validate-log-mirror.test.mjs
bash scripts/lib/azure-logs-secret.test.sh
bash scripts/lib/generate-overlay.test.sh
```

These check that the base and the instance template deploy no mirror, that a generated overlay adds it only with `--with-azure-log-mirror` and the CHES chart only with `azureLogs.enabled`, and that the component is added and filled in correctly. They also run the actual Fluent Bit image with an arbitrary non-root UID and read-only filesystem against the structured, Vite and nginx filters (including the removals above) and the production health endpoint, and test the configured, partial and absent cases and Secret validation and provisioning, all without live Azure credentials or cluster writes.
