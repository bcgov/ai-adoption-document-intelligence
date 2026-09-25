import { Injectable, Logger } from "@nestjs/common";

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
 * Human-facing headline for an unreachable runner (D3).
 *
 * What the reviewer saw was `Failed to reach deno-runner /check at
 * http://localhost:9099` — an internal service name and an internal URL, with
 * no statement of what the reader should do. The URL is not the message; it is
 * the evidence, and it now travels on `DenoRunnerUnavailableError.details`
 * (surfaced as the response's `details` field and written to the server log).
 *
 * The instruction differs by deployment, so it is derived rather than fixed:
 * a loopback `baseUrl` means a developer's own machine, where the fix is a
 * command they can run; anything else is a deployed sidecar they cannot start
 * themselves, where the honest advice is retry-then-escalate.
 */
export function denoRunnerUnavailableMessage(baseUrl: string): string {
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(
    baseUrl,
  );
  return isLocal
    ? "The custom-node checker is not running, so this script could not be type-checked. Start it with `docker compose -f deployments/local/docker-compose.deno.yml up -d`, then publish again."
    : "The custom-node checker is not responding, so this script could not be type-checked. It may be restarting — try again in a moment, and contact an administrator if it keeps failing.";
}

/**
 * Raised by `DenoRunnerClient` when the sidecar is unreachable OR returns a
 * non-success HTTP status from a `/check` call. The service maps this to a
 * 503 with `{ code: "DENO_RUNNER_UNAVAILABLE", message, details }` per US-164
 * Scenario 5.
 *
 * `message` is what a person reads (see `denoRunnerUnavailableMessage`);
 * `details` is the diagnostic — endpoint, URL and underlying failure — kept
 * for the log and the response's secondary line.
 */
export class DenoRunnerUnavailableError extends Error {
  readonly details: string;
  readonly cause?: unknown;
  constructor(args: { baseUrl: string; details: string; cause?: unknown }) {
    super(denoRunnerUnavailableMessage(args.baseUrl));
    this.name = "DenoRunnerUnavailableError";
    this.details = args.details;
    this.cause = args.cause;
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
/**
 * Ceiling on a `/check` call. The runner's own execution clamp is 60s, but
 * that applies to `/execute` (script runs, worker-side); a publish-time
 * `deno check` of a single bounded script settles in seconds. 30s is
 * generous for a cold type-check while still turning a wedged runner (a
 * container that accepts the connection and hangs) into the structured 503
 * instead of an indefinite spinner.
 */
export const DENO_RUNNER_CHECK_TIMEOUT_MS = 30_000;

/** Ceiling on a `/health` probe — liveness answers are immediate or never. */
export const DENO_RUNNER_HEALTH_TIMEOUT_MS = 5_000;

/**
 * `AbortSignal.timeout` rejects the fetch with a DOMException named
 * `TimeoutError` (`AbortError` on some runtimes). Matched by name so no DOM
 * lib types are needed.
 */
function isAbortLikeError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    ((err as { name: unknown }).name === "TimeoutError" ||
      (err as { name: unknown }).name === "AbortError")
  );
}

@Injectable()
export class DenoRunnerClient {
  private readonly logger = new Logger(DenoRunnerClient.name);
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
        // A runner that accepts the connection and hangs (wedged container,
        // dying pod) must surface as the structured 503, not hold the
        // publish request open until Node's socket timeout.
        signal: AbortSignal.timeout(DENO_RUNNER_CHECK_TIMEOUT_MS),
      });
    } catch (err) {
      if (isAbortLikeError(err)) {
        throw this.unavailable(
          `POST ${this.baseUrl}/check timed out after ${DENO_RUNNER_CHECK_TIMEOUT_MS / 1000}s`,
          err,
        );
      }
      throw this.unavailable(
        `POST ${this.baseUrl}/check could not be reached: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err,
      );
    }
    if (!res.ok) {
      throw this.unavailable(
        `POST ${this.baseUrl}/check returned ${res.status} ${res.statusText}`,
      );
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw this.unavailable(
        `POST ${this.baseUrl}/check returned a non-JSON response`,
        err,
      );
    }
    if (!isDenoCheckResponse(body)) {
      throw this.unavailable(
        `POST ${this.baseUrl}/check returned an unexpected response shape`,
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
        signal: AbortSignal.timeout(DENO_RUNNER_HEALTH_TIMEOUT_MS),
      });
    } catch (err) {
      if (isAbortLikeError(err)) {
        throw this.unavailable(
          `GET ${this.baseUrl}/health timed out after ${DENO_RUNNER_HEALTH_TIMEOUT_MS / 1000}s`,
          err,
        );
      }
      throw this.unavailable(
        `GET ${this.baseUrl}/health could not be reached: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err,
      );
    }
    if (!res.ok) {
      throw this.unavailable(
        `GET ${this.baseUrl}/health returned ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as DenoHealthResponse;
    return body;
  }

  /**
   * Builds the error AND writes the diagnostic to the server log, so the
   * endpoint/URL/status survives even though it is no longer the headline the
   * user reads.
   */
  private unavailable(
    details: string,
    cause?: unknown,
  ): DenoRunnerUnavailableError {
    this.logger.warn(`deno-runner unavailable — ${details}`);
    return new DenoRunnerUnavailableError({
      baseUrl: this.baseUrl,
      details,
      cause,
    });
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
