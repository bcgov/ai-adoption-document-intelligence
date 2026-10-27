/**
 * Phase 6 Milestone C (US-170) — typed HTTP client for the `deno-runner`
 * sidecar's `/execute` endpoint.
 *
 * The worker NEVER spawns Deno directly. Every dynamic-node invocation goes
 * through this thin client, which mirrors the backend's `/check` client
 * (`apps/backend-services/src/dynamic-nodes/deno-runner.client.ts`) — kept
 * separate per app on purpose, so each app stays independently deployable
 * (no shared package needed).
 *
 * The runner's contract is documented in `apps/deno-runner/src/execute.ts`.
 */

/**
 * Default URL used when `DENO_RUNNER_URL` is unset. Matches the local-dev
 * sidecar exposed by `deployments/local/docker-compose.deno.yml` (`9099`).
 * In compose / OpenShift this is overridden to `http://deno-runner:9090`.
 */
export const DEFAULT_DENO_RUNNER_URL = "http://localhost:9099";

/**
 * Request body the worker POSTs to `${DENO_RUNNER_URL}/execute`.
 *
 *  - `script` — user-authored TypeScript (the runner appends its own harness)
 *  - `inputCtx` — consumed ctx slice (the script receives this as its first arg)
 *  - `parameters` — static node parameters (the script's second arg)
 *  - `allowNet` — intersected host allow-list (global ∩ signature ∪ API host)
 *  - `ambientEnv` — exactly the four `AI_DI_*` env vars (US-170 Scenario 3)
 *  - `timeoutMs` — capped server-side at 60_000 (matches signature default)
 *  - `maxMemoryMB` — capped server-side at 256 (matches signature default)
 */
export interface DenoExecuteRequest {
  script: string;
  inputCtx: Record<string, unknown>;
  parameters: Record<string, unknown>;
  allowNet: string[];
  ambientEnv: Record<string, string>;
  timeoutMs: number;
  maxMemoryMB: number;
}

/**
 * Response body returned by `/execute`. Shape matches
 * `apps/deno-runner/src/execute.ts`.
 *
 * Failure modes the activity must distinguish (US-170 Scenario 5):
 *   - `timedOut: true`             → DynamicNodeTimeoutError
 *   - `stdoutTooLarge: true`       → DynamicNodeStdoutTooLargeError
 *   - `exitCode != 0`              → DynamicNodeRuntimeError
 *   - non-JSON stdout              → DynamicNodeOutputInvalidJsonError
 */
export interface DenoExecuteResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  stdoutTooLarge?: boolean;
}

/**
 * Raised when the runner is unreachable, returns a non-2xx, or responds
 * with a malformed body. The `dyn.run` activity catches this and surfaces
 * it as a runtime error mapped to "deno runner unavailable" in
 * `NodeRunStatus.errorMessage` (US-170 Scenario 5 + US-172 Scenario 5).
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
 * Typed HTTP client for the `deno-runner` sidecar. The activity body
 * (`dyn-run.activity.ts`) constructs one per invocation OR reuses a
 * module-level instance — the client is intentionally cheap to instantiate.
 */
export class DenoRunnerClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { baseUrl?: string; fetchImpl?: typeof fetch } = {}) {
    this.baseUrl =
      options.baseUrl ?? process.env.DENO_RUNNER_URL ?? DEFAULT_DENO_RUNNER_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * POST `/execute`. The caller supplies an `AbortSignal` so the worker
   * can enforce its own timeout (typically `signature.timeoutMs + 5000`)
   * slightly higher than the runner's own enforcement — the runner's
   * `timedOut` signal should fire first, but the buffer prevents an
   * indefinite hang if the runner is slow to return.
   */
  async execute(
    request: DenoExecuteRequest,
    signal?: AbortSignal,
  ): Promise<DenoExecuteResponse> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
      });
    } catch (err) {
      throw new DenoRunnerUnavailableError(
        `Failed to reach deno-runner /execute at ${this.baseUrl}`,
        err,
      );
    }
    if (!res.ok) {
      throw new DenoRunnerUnavailableError(
        `deno-runner /execute returned ${res.status} ${res.statusText}`,
      );
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new DenoRunnerUnavailableError(
        `deno-runner /execute returned non-JSON response`,
        err,
      );
    }
    if (!isDenoExecuteResponse(body)) {
      throw new DenoRunnerUnavailableError(
        `deno-runner /execute returned an unexpected response shape`,
      );
    }
    return body;
  }
}

function isDenoExecuteResponse(value: unknown): value is DenoExecuteResponse {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.stdout !== "string") return false;
  if (typeof obj.stderr !== "string") return false;
  if (typeof obj.exitCode !== "number") return false;
  if (typeof obj.durationMs !== "number") return false;
  if (typeof obj.timedOut !== "boolean") return false;
  if (
    obj.stdoutTooLarge !== undefined &&
    typeof obj.stdoutTooLarge !== "boolean"
  ) {
    return false;
  }
  return true;
}
