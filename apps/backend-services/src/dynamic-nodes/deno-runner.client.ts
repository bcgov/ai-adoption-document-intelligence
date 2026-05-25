import { Injectable } from "@nestjs/common";

/**
 * Default Deno runner URL used when the `DENO_RUNNER_URL` env var is not set.
 *
 * Matches the local-dev sidecar exposed by `deployments/local/docker-compose.deno.yml`
 * (port `9099` in dev; mapped to the runner's internal `9090`). In OpenShift / the
 * compose stack, this is overridden to `http://deno-runner:9090`.
 */
export const DEFAULT_DENO_RUNNER_URL = "http://localhost:9099";

/**
 * Response shape returned by `POST /check` on the `deno-runner` sidecar.
 *
 * Mirrors the runner's contract per `apps/deno-runner/README.md` / US-186:
 *  - `ok` is `true` when `deno check` exited cleanly.
 *  - `errors` is the parsed list of TypeScript diagnostics (file:line:col + message).
 *
 * Wrapped by `DynamicNodesService.publish` into stage-tagged
 * `TsCheckError` entries before surfacing to the client.
 */
export interface DenoCheckResponse {
  ok: boolean;
  errors: DenoCheckError[];
}

export interface DenoCheckError {
  line: number;
  column: number;
  message: string;
}

/**
 * Response shape returned by `GET /health` on the `deno-runner` sidecar.
 * Used by the publish endpoint's pre-flight to fail-fast with a structured
 * `DENO_RUNNER_UNAVAILABLE` error when the runner is unreachable.
 */
export interface DenoHealthResponse {
  ok: boolean;
  denoVersion?: string;
}

/**
 * Raised by `DenoRunnerClient` when the sidecar is unreachable OR returns a
 * non-success HTTP status from a `/check` call. The service maps this to a
 * 503 with `{ code: "DENO_RUNNER_UNAVAILABLE" }` per US-164 Scenario 5.
 */
export class DenoRunnerUnavailableError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "DenoRunnerUnavailableError";
    this.cause = cause;
  }
}

/**
 * Typed HTTP client for the Phase 6 `deno-runner` sidecar service.
 *
 * Backend reaches the runner via `${DENO_RUNNER_URL}/check` for publish-time
 * `deno check` validation (this client). The Temporal worker reaches the
 * same runner via `/execute` for activity-time invocation (a sibling client
 * lives in `apps/temporal/src/dynamic-nodes/` per US-170).
 *
 * Per Phase 6 design (REQUIREMENTS.md L49 + DYNAMIC_NODES_DESIGN.md §1.5),
 * the backend NEVER spawns Deno directly — the runner is the single
 * sandboxed execution surface and every TS check / script execution goes
 * through this HTTP boundary.
 */
@Injectable()
export class DenoRunnerClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { baseUrl?: string; fetchImpl?: typeof fetch } = {}) {
    this.baseUrl =
      options.baseUrl ?? process.env.DENO_RUNNER_URL ?? DEFAULT_DENO_RUNNER_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * POST `/check` — run `deno check` against the script source and return
   * structured diagnostics.
   *
   * Throws `DenoRunnerUnavailableError` on network failure, non-2xx HTTP
   * response, or malformed JSON body. The service layer catches and remaps
   * to a 503 with the documented `DENO_RUNNER_UNAVAILABLE` code.
   */
  async check(script: string): Promise<DenoCheckResponse> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script }),
      });
    } catch (err) {
      throw new DenoRunnerUnavailableError(
        `Failed to reach deno-runner /check at ${this.baseUrl}`,
        err,
      );
    }
    if (!res.ok) {
      throw new DenoRunnerUnavailableError(
        `deno-runner /check returned ${res.status} ${res.statusText}`,
      );
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new DenoRunnerUnavailableError(
        `deno-runner /check returned non-JSON response`,
        err,
      );
    }
    if (!isDenoCheckResponse(body)) {
      throw new DenoRunnerUnavailableError(
        `deno-runner /check returned an unexpected response shape`,
      );
    }
    return body;
  }

  /**
   * GET `/health` — quick liveness check. Returns `{ ok: true, denoVersion }`
   * when the runner is up; throws `DenoRunnerUnavailableError` otherwise.
   *
   * Currently used only by tests + future ops endpoints; the publish path
   * relies on `check`'s own error mapping rather than a separate preflight.
   */
  async health(): Promise<DenoHealthResponse> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/health`, {
        method: "GET",
      });
    } catch (err) {
      throw new DenoRunnerUnavailableError(
        `Failed to reach deno-runner /health at ${this.baseUrl}`,
        err,
      );
    }
    if (!res.ok) {
      throw new DenoRunnerUnavailableError(
        `deno-runner /health returned ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as DenoHealthResponse;
    return body;
  }
}

function isDenoCheckResponse(value: unknown): value is DenoCheckResponse {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.ok !== "boolean") return false;
  if (!Array.isArray(obj.errors)) return false;
  for (const err of obj.errors) {
    if (typeof err !== "object" || err === null) return false;
    const e = err as Record<string, unknown>;
    if (typeof e.line !== "number") return false;
    if (typeof e.column !== "number") return false;
    if (typeof e.message !== "string") return false;
  }
  return true;
}
