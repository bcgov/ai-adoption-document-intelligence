# Logging (shared package)

The `@ai-di/shared-logging` package provides structured NDJSON logging used by `backend-services` and the Temporal worker. See feature spec in [`feature-docs/007-logging-system`](../../feature-docs/007-logging-system/REQUIREMENTS.md).

## Package location

- `packages/logging` — source and tests.

## Usage

- **Backend:** `AppLoggerService` wraps `createLogger("backend-services")` (see `apps/backend-services/src/logging`). Request-scoped `requestId`, `actorId`, `userId`, `sessionId`, `apiKeyId`, and `clientIp` are merged into every log via middleware and request context. The `requestId` is always generated server-side (a new UUID per request); any client-supplied `x-request-id` header is ignored so logs and audit cannot be confused by reused IDs. The `sessionId` is extracted from the Keycloak JWT `session_state` claim (via `req.user.session_state`) in the `RequestLoggingInterceptor` and stored in `AsyncLocalStorage`. For API key-authenticated requests (validated by `ApiKeyAuthGuard`), the `apiKeyId` field is set to the stored key prefix (first 8 characters) instead of `sessionId`; the two fields are mutually exclusive. The full API key value is never written to log output. The `clientIp` is extracted by the `LoggingMiddleware` using the priority: `X-Forwarded-For` (first entry) > `X-Real-IP` > `req.socket.remoteAddress`. On OpenShift, the client IP arrives via `X-Forwarded-For` due to reverse proxy/ingress; locally, `req.socket.remoteAddress` is used as fallback. For unauthenticated requests, both `sessionId` and `apiKeyId` are omitted from log output. `RequestLoggingInterceptor` (registered globally as `APP_INTERCEPTOR` in `LoggingModule`) logs each completed HTTP request as NDJSON ("Request completed" with requestId, method, path, statusCode, durationMs) in all environments. The logger also accepts a metrics hook: warn/error logs carrying an `alertType` in context increment Prometheus alert counters, which drive the alerting pipeline (see [ALERTING.md](ALERTING.md)).
- **Temporal worker:** `createLogger("temporal-worker")` and `createActivityLogger(activityName, context)` (see `apps/temporal/src/logger.ts`). Activities that receive `requestId` in workflow input should pass it in `context` so logs can be traced by requestId across backend and worker. **SDK internal logs** (e.g. "Activity failed", "Workflow failed") are routed through the same shared logger via a custom Runtime logger and native log forwarding (`apps/temporal/src/temporal-runtime-logger.ts`), so all worker process output is NDJSON and respects `LOG_LEVEL`.

## Testing

The package has a small Jest test suite in `packages/logging/src/logger.test.ts` (plus `logger.no-process.test.ts`).

- **Run tests:** From `packages/logging`: `npm test` (or `npm run test:watch`); from repo root: `npm test -w packages/logging`.
- **Coverage:** `getLogLevel()` (default/invalid/valid/case-insensitive), NDJSON shape (timestamp, level, service, message, context), LOG_LEVEL filtering (debug suppressed when level is info; only warn/error when level is warn), redaction of sensitive keys (e.g. `apiKey`, `token`, `password`), child logger context merging, development pretty-print mode, metrics hook invocation on `alertType`, and no-throw behavior when stdout.write fails.

## Audit table (document access)

The backend records **who accessed documents and when** in the `audit_events` table. For each successful access to document metadata (GET/list/update), document file (GET view or download), or OCR result (GET OCR), an event with `event_type` `document_accessed` is written with `actor_id`, `document_id`, `group_id`, `request_id`, and `payload.action` (`metadata`, `view`, `download`, or `ocr`). Other modules that serve document content (HITL, benchmark datasets, template models) write the same event type. See [`AUDIT.md`](../architecture/AUDIT.md) and [`feature-docs/007-logging-system/REQUIREMENTS-AUDIT.md`](../../feature-docs/007-logging-system/REQUIREMENTS-AUDIT.md) for the full audit schema and event types.

## OpenShift: the log file and how it stays small

Where logs live, and which copy to reach for:

| Copy | Retention | How to read it |
|---|---|---|
| **Loki** — the durable, searchable copy | 30 days (`retention_period: 720h`) | Grafana, or the Loki query API |
| **Container stdout**, kept by the node | node-managed rotation, a few days in practice | `oc logs` |
| **The file** at `/var/log/app/<service>.log` | seconds — it is a buffer, not an archive | `oc exec` (below) |

- **Tee:** the main process stdout/stderr is piped through `tee -a /var/log/app/<service>.log`, so the same stream reaches both the container runtime (and from there `oc logs`) and the file.
- **Why a file at all:** promtail can only read files. It cannot attach to another container's stdout — that stream belongs to the container runtime and is written to a node path a sidecar cannot mount. So the file exists purely to give the promtail sidecar something readable, and only has to hold what promtail has not yet shipped. Loki is the record.
- **`emptyDir`, one per pod:** the volume is node ephemeral storage, private to the pod. It must **not** be a `ReadWriteMany` PVC shared across replicas: NFS has no atomic append, so each replica writes at the end-of-file its own client has cached, overwriting other replicas' lines and zero-filling the gaps between them.
- **`log-rotator` sidecar:** checks the file every 60 seconds and truncates it in place past 10 MB. Truncating rather than renaming keeps the inode, so both `tee -a` and promtail carry on without a restart. It is a shell loop rather than `logrotate(8)` — the sidecar image does not carry that binary.

To read the file directly:

- Backend: `oc exec -it deployment/backend-services -c backend-services -- tail -n 200 /var/log/app/backend.log`
- Temporal worker: `oc exec -it deployment/temporal-worker -c temporal-worker -- tail -n 200 /var/log/app/worker.log`

For anything older than the last few minutes, query Loki instead.

Config is in `deployments/openshift/kustomize/base/<service>/deployment.yml` — the `logs` volume, the `tee` command and the `log-rotator` sidecar. The ches-adapter carries the same three in `deployments/openshift/helm/plg/templates/ches-adapter-deployment.yaml`.

### Probe and scrape requests are logged at `debug`

`/health/*` and `/metrics` are hit every few seconds per replica by the kubelet and Prometheus, and unfiltered they are the overwhelming majority of request log volume. `RequestLoggingInterceptor` logs them at `debug` instead of `info`, so they are suppressed at the normal log level and return by raising `LOG_LEVEL` — which is what you want when a probe itself is being investigated. The promtail configs carry matching `drop` stages, so a probe line that is emitted at `debug` in a lower environment still does not reach Loki.
