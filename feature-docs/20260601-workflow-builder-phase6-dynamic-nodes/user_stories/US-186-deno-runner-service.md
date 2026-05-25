# US-186: `deno-runner` HTTP sidecar service — image + docker-compose + OpenShift kustomize

**As a** devops + backend + worker engineer,
**I want** a containerized `deno-runner` service that exposes `POST /execute` + `POST /check` + `GET /health` on port 9090,
**So that** the backend (publish-time validation) and the worker (runtime `dyn.run`) both delegate every Deno invocation to a single isolated container — never spawning Deno on the host process — and the service slots into both the local docker-compose stack and the OpenShift kustomize deployment with the same shape as the existing apps.

## Acceptance Criteria

- [x] **Scenario 1**: New `apps/deno-runner/` directory with Dockerfile + HTTP server
    - **Given** the repository root
    - **When** `apps/deno-runner/` is read after the change
    - **Then** it contains: `Dockerfile`, `src/main.ts` (HTTP server), `src/execute.ts` (execute handler), `src/check.ts` (check handler), `src/kinds.d.ts` (ambient types baked in), `src/health.ts` (health handler), `README.md`
    - **And** `Dockerfile` is `FROM denoland/deno:alpine-latest`, copies `src/` to `/app/`, exposes 9090, runs as non-root user, and starts the HTTP server with the minimal permissions needed (`--allow-net`, `--allow-read=/app,/tmp`, `--allow-write=/tmp`, `--allow-run=deno`, `--allow-env`)

- [x] **Scenario 2**: `POST /execute` runs the script + returns structured response
    - **Given** the runner is running
    - **When** a client POSTs `{ script, inputCtx, parameters, allowNet, ambientEnv, timeoutMs, maxMemoryMB }` to `/execute`
    - **Then** the runner writes the script to `/tmp/<requestId>.ts`, spawns `Deno.Command("deno", { args: ["run", "--allow-net=<allowNet joined>", "--allow-env=<ambientEnv keys joined>", "--no-prompt", "--v8-flags=--max-old-space-size=<maxMemoryMB>", tempPath], env: ambientEnv, stdin: "piped", stdout: "piped", stderr: "piped" })`, writes `{ inputCtx, parameters }` to stdin, enforces `timeoutMs` via AbortSignal, and returns `{ stdout, stderr, exitCode, durationMs, timedOut }` as JSON
    - **And** stdout is capped at 5 MB — if exceeded, the runner SIGKILLs the subprocess and returns `{ stdoutTooLarge: true, ...partial }`
    - **And** the temp file is deleted after the subprocess exits (even on error)

- [x] **Scenario 3**: `POST /check` runs `deno check` + returns structured errors
    - **Given** the runner is running
    - **When** a client POSTs `{ script }` to `/check`
    - **Then** the runner writes the script + the baked-in `kinds.d.ts` to `/tmp/check-<requestId>/`, spawns `deno check <tempPath>`, parses stderr into `{ line, column, message }[]` entries
    - **And** returns `{ ok: true, errors: [] }` on exit code 0
    - **And** returns `{ ok: false, errors: [...] }` on non-zero exit with parsed line-anchored errors

- [x] **Scenario 4**: `GET /health` returns runner liveness + Deno version
    - **Given** the runner is running
    - **When** a client GETs `/health`
    - **Then** the response is 200 with `{ ok: true, denoVersion: "<deno --version output>" }`
    - **And** the response is fast (no subprocess spawn — Deno version is cached at startup)

- [x] **Scenario 5**: Local docker-compose entry at `deployments/local/docker-compose.deno.yml`
    - **Given** the file is read after the change
    - **When** the developer runs `docker compose -f deployments/local/docker-compose.deno.yml up -d`
    - **Then** a `deno-runner` service starts from the locally-built image (build context `apps/deno-runner`), binds port 9090 to localhost, has a healthcheck against `GET /health`, and has `restart: unless-stopped`
    - **And** the file follows the existing `deployments/local/docker-compose.monitoring.yml` shape (network, healthcheck, labels) for consistency

- [x] **Scenario 6**: OpenShift kustomize base at `deployments/openshift/kustomize/base/deno-runner/`
    - **Given** the directory after the change
    - **When** read
    - **Then** it contains: `deployment.yml`, `service.yml`, `networkpolicy.yml`, `kustomization.yml` (matching the shape of `deployments/openshift/kustomize/base/backend-services/`)
    - **And** `deployment.yml` declares a Deployment with `replicas: 1`, the image tag pulled from `image-streams`, `resources.limits.memory: 512Mi`, `resources.limits.cpu: 500m`, liveness + readiness probes against `/health`, and runs as non-root
    - **And** `service.yml` declares a ClusterIP service on port 9090 named `deno-runner` (no Route — internal-only)
    - **And** `networkpolicy.yml` permits ingress on port 9090 ONLY from pods labelled `app: backend-services` and `app.kubernetes.io/part-of: temporal` (the worker)
    - **And** `deployments/openshift/kustomize/base/kustomization.yml` is updated to include `- deno-runner` in the resources list

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/deno-runner/Dockerfile` — new
- `apps/deno-runner/src/main.ts` — new
- `apps/deno-runner/src/execute.ts` — new
- `apps/deno-runner/src/check.ts` — new
- `apps/deno-runner/src/kinds.d.ts` — new (ambient types — generated or hand-mirrored from `@ai-di/graph-workflow/kinds`)
- `apps/deno-runner/src/health.ts` — new
- `apps/deno-runner/README.md` — new
- `apps/deno-runner/.dockerignore` — new
- `deployments/local/docker-compose.deno.yml` — new
- `deployments/openshift/kustomize/base/deno-runner/deployment.yml` — new
- `deployments/openshift/kustomize/base/deno-runner/service.yml` — new
- `deployments/openshift/kustomize/base/deno-runner/networkpolicy.yml` — new
- `deployments/openshift/kustomize/base/deno-runner/kustomization.yml` — new
- `deployments/openshift/kustomize/base/kustomization.yml` — include the new base
- `deployments/openshift/kustomize/base/image-streams/` (or wherever image streams are defined) — add the deno-runner image stream

## Technical notes

- The runner is itself a Deno application — keep `package.json` out, use Deno's native module resolution. The harness suffix that wraps user scripts (US-169) lives in the runner; the worker just sends the raw user script.
- `kinds.d.ts` mirrors `packages/graph-workflow/src/kinds/index.ts` (US-160). For 6.0, copy the source file into the runner image at build time (`Dockerfile` `COPY ../../packages/graph-workflow/src/kinds/index.ts ./src/kinds.d.ts` — verify the build context allows this). Filed for later: a small `npm` package or symlink to dedupe.
- Non-root user: use the `deno` user provided by `denoland/deno:alpine-latest`. Mount `/tmp` as the writable working area.
- Service-side `--allow-net` for the runner ITSELF (i.e. for the HTTP server) is `--allow-net=0.0.0.0:9090`. The runner does NOT need outbound network access for itself; only the subprocesses it spawns need it (and that's gated by the per-execute `allowNet` flags).
- The runner does NOT run `npm install` — Deno's std lib comes with the base image. If we need third-party Deno modules (e.g. for HTTP routing), use `import_map.json` or `deno.json` to pin them.
- This story is a Phase 6 prerequisite — Milestones A is independent, but Milestone B (publish endpoints) and Milestone C (`dyn.run`) both require US-186 to exist. Sequence accordingly: US-186 lands as Milestone B0 (or simply alongside Milestone B's first endpoint story).
- Image tagging: follow the existing artifactory.developer.gov.bc.ca/kfd3-fd34fb-local convention seen in `deployments/openshift/kustomize/base/backend-services/deployment.yml`.
- After landing: no Vite restart (infrastructure-only). Backend + worker will need to be restarted to pick up `DENO_RUNNER_URL` if they were already running.
