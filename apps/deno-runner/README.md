# deno-runner

HTTP sidecar service that executes Phase 6 dynamic-node scripts inside an isolated Deno subprocess. The backend (publish-time validation) and the Temporal worker (runtime `dyn.run` activity) both delegate every Deno invocation to this service via HTTP — neither process spawns Deno directly.

## Endpoints

| Verb + Path | Purpose | Request | Response |
|---|---|---|---|
| `POST /execute` | Run a user script against an input ctx | `{ script, inputCtx, parameters, allowNet, ambientEnv, timeoutMs, maxMemoryMB }` | `{ stdout, stderr, exitCode, durationMs, timedOut, stdoutTooLarge? }` |
| `POST /check` | Type-check a script via `deno check` | `{ script }` | `{ ok, errors: [{ line?, column?, message }] }` |
| `GET /health` | Liveness probe | — | `{ ok: true, denoVersion }` |

## Architecture

The runner is itself a Deno application (`src/main.ts`) that listens on port 9090. On `POST /execute`:

1. Validate the request body (shape + types).
2. Cap `timeoutMs` at 60s and `maxMemoryMB` at 256MB (hardcoded ceilings in 6.0).
3. Write the user script (with the auto-appended subprocess harness from `src/subprocess-harness.ts`) to `/tmp/deno-runner/<uuid>.ts`.
4. Spawn `deno run --allow-net=<intersected hosts> --allow-env=<ambient keys> --no-prompt --v8-flags=--max-old-space-size=<cap> <tempPath>` with `env: ambientEnv` (NOT the runner's full process env — scripts cannot see other env vars).
5. Pipe `{ inputCtx, parameters }` to stdin as a single JSON line.
6. Buffer stdout (capped at 5MB — SIGKILL on overflow) and stderr.
7. AbortController fires `timeoutMs` ms in; on abort, returns `timedOut: true`.
8. Delete the temp file. Return the structured response.

On `POST /check`:

1. Write the user script + the ambient `src/kinds.d.ts` to `/tmp/deno-runner/check-<uuid>/`.
2. Rewrite the script's `from "@ai-di/graph-workflow/kinds"` import to a relative path so `deno check` can resolve the types without the full shared package.
3. Run `deno check <scriptPath>`, parse stderr into structured `{ line, column, message }` entries.
4. Delete the temp dir. Return `{ ok, errors }`.

## Running locally

### Via docker-compose (recommended)

```bash
docker compose -f deployments/local/docker-compose.deno.yml up -d
```

Verify with:

```bash
curl http://localhost:9099/health
# → {"ok":true,"denoVersion":"2.1.4"}
```

### Directly (requires Deno installed)

```bash
cd apps/deno-runner
deno task start
```

## Smoke-testing the endpoints

```bash
# /execute — runs a one-shot uppercase script
curl -X POST http://localhost:9099/execute -H "content-type: application/json" -d '{
  "script": "export default async function ({ url }) { return { uppercased: url.toUpperCase() }; }",
  "inputCtx": { "url": "foo.pdf" },
  "parameters": {},
  "allowNet": [],
  "ambientEnv": {},
  "timeoutMs": 5000,
  "maxMemoryMB": 128
}'

# /check — type-checks a syntactically invalid script
curl -X POST http://localhost:9099/check -H "content-type: application/json" -d '{
  "script": "export default function (): number { return \"not a number\"; }"
}'
```

## Production deployment

OpenShift manifests live at [`deployments/openshift/kustomize/base/deno-runner/`](../../deployments/openshift/kustomize/base/deno-runner/). The service is `ClusterIP` only (no Route); ingress on port 9090 is restricted by `networkpolicy.yml` to pods labelled `app: backend-services` and `app.kubernetes.io/part-of: temporal`.

## Security posture

- The runner container runs as the non-root `deno` user.
- Subprocesses run with `--no-prompt` (no interactive permission escalation).
- `--allow-read`, `--allow-write`, `--allow-run`, `--allow-ffi`, `--allow-sys` are NEVER granted to user scripts.
- `--allow-net` is restricted to the host list passed in the request body (which the backend pre-intersected against the global `DYNAMIC_NODE_ALLOW_NET` allowlist + the API base host).
- `--allow-env` is restricted to the ambient env var names passed in the request (in 6.0: exactly `AI_DI_API_BASE_URL`, `AI_DI_API_KEY`, `AI_DI_GROUP_ID`, `AI_DI_WORKFLOW_RUN_ID`).
- The runner's own `env` passed to the subprocess is the `ambientEnv` only — NOT the runner container's full env — so no leakage of other secrets.
- Stdout is capped at 5MB per execution; the subprocess is SIGKILLed on overflow.
- Per-execution `--v8-flags=--max-old-space-size` caps v8 heap.
- Container-level `resources.limits.memory: 512Mi` + `cpu: 500m` cap aggregate runner usage.

## Related design docs

- [DYNAMIC_NODES_DESIGN.md §1 + §1.5](../../docs-md/workflow-builder/DYNAMIC_NODES_DESIGN.md) — runner architecture
- [REQUIREMENTS.md L28 + L32 + L49 + L50](../../feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/REQUIREMENTS.md) — locked decisions
- [US-186](../../feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/user_stories/US-186-deno-runner-service.md) — this service's story
