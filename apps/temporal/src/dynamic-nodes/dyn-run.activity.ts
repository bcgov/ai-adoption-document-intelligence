/**
 * Phase 6 Milestone C (US-170) — the single `dyn.run` Temporal activity.
 *
 * The activity is a thin HTTP client to the `deno-runner` sidecar's
 * `/execute` endpoint. The worker process NEVER spawns Deno directly —
 * sandboxing lives entirely in the runner container.
 *
 * Per the executor (US-171), `dyn.run` receives a resolved immutable
 * `versionId` along with the slug, parameters, consumed ctx slice,
 * groupId, workflowRunId, and the originating request's API key. The
 * activity:
 *   1. Looks up the cached script + signature + allowNet by `versionId`
 *      (US-169 cache; on miss SELECTs from `dynamic_node_version`).
 *   2. Computes the intersected `allowNet`:
 *        `(global ∩ signature.allowNet) ∪ {API_BASE_URL host}`
 *   3. Composes the runner request with the four `AI_DI_*` ambient env
 *      vars and POSTs to `/execute`.
 *   4. Maps runner failures to the typed errors from US-168.
 *   5. Validates that every declared output port is present in the
 *      parsed JSON and returns the object.
 *
 * Spec: feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/REQUIREMENTS.md
 * §3.3 L30 + L32 + L34, user_stories/US-170-dyn-run-activity.md.
 */

import type { DynamicNodeSignature } from "@ai-di/graph-workflow";
import type { PrismaClient } from "@generated/client";
import { getPrismaClient } from "../activities/database-client";
import {
  type DenoExecuteRequest,
  type DenoExecuteResponse,
  DenoRunnerClient,
  DenoRunnerUnavailableError,
} from "./deno-runner.client";
import {
  DynamicNodeOutputInvalidJsonError,
  DynamicNodeOutputShapeError,
  DynamicNodeRuntimeError,
  DynamicNodeStdoutTooLargeError,
  DynamicNodeTimeoutError,
} from "./errors";
import { loadVersion, type ScriptCacheEntry } from "./version-cache";

/** Runner-enforced cap on stdout (matches `apps/deno-runner/src/execute.ts`). */
const STDOUT_CAP_BYTES = 5 * 1024 * 1024;

/** Worker-side HTTP timeout cushion above the runner's own enforcement. */
const HTTP_TIMEOUT_BUFFER_MS = 5_000;

/** Max stderr text the worker keeps in `DynamicNodeRuntimeError.stderrTail`. */
const STDERR_TAIL_BYTES = 2_048;

/** Max stdout text the worker keeps in `DynamicNodeOutputInvalidJsonError`. */
const STDOUT_HEAD_CHARS = 500;

/**
 * Input shape passed by the executor (US-171). All fields are required —
 * the executor resolves head→versionId and ambient context before invoking
 * `dyn.run`.
 *
 * Item 4 (security): the platform API key is intentionally absent from this
 * input. Temporal records activity inputs in durable workflow history, so a
 * caller key passed here would be persisted in cleartext. The activity
 * instead reads the platform key server-side from worker config
 * (`PLATFORM_API_KEY`).
 */
export interface DynRunInput {
  slug: string;
  versionId: string;
  parameters: Record<string, unknown>;
  inputCtx: Record<string, unknown>;
  groupId: string;
  workflowRunId: string;
}

/**
 * Dependency-injection seam for tests. Production callers omit; tests can
 * stub the runner client / prisma / env reader.
 */
export interface DynRunDeps {
  client?: DenoRunnerClient;
  prisma?: PrismaClient;
  readEnv?: (name: string) => string | undefined;
}

/**
 * The `dyn.run` activity body. Returns the parsed stdout JSON object on
 * success; throws a typed `DynamicNodeError` subclass on failure.
 */
export async function dynRun(
  args: DynRunInput,
  deps: DynRunDeps = {},
): Promise<Record<string, unknown>> {
  const readEnv = deps.readEnv ?? ((name: string) => process.env[name]);
  const prisma = deps.prisma ?? getPrismaClient();
  const client = deps.client ?? new DenoRunnerClient();

  // (1) Cache lookup → SELECT on miss.
  const entry: ScriptCacheEntry = await loadVersion(args.versionId, prisma);
  const signature = entry.signature;

  // (2) Compute the intersected allowNet.
  const globalAllowlist = parseAllowlist(readEnv("DYNAMIC_NODE_ALLOW_NET"));
  const apiBaseUrl = readEnv("AI_DI_API_BASE_URL") ?? "http://localhost:3002";
  const apiHost = extractHost(apiBaseUrl);
  const allowNet = computeAllowNet(globalAllowlist, entry.allowNet, apiHost);

  // (3) Compose runner request.
  //
  // Item 4 (security): the platform API key injected as `AI_DI_API_KEY` is
  // sourced SERVER-SIDE from the worker's own config (`PLATFORM_API_KEY`),
  // NOT from the activity input. Temporal persists activity inputs in durable
  // history, so threading the caller's `x-api-key` through the input chain
  // would leak it in cleartext. Reading it here keeps it out of history while
  // still giving dynamic-node scripts a key to call back into the platform.
  const platformApiKey = readEnv("PLATFORM_API_KEY") ?? "";
  const timeoutMs = signature.timeoutMs ?? 60_000;
  const maxMemoryMB = signature.maxMemoryMB ?? 256;
  const ambientEnv: Record<string, string> = {
    AI_DI_API_BASE_URL: apiBaseUrl,
    AI_DI_API_KEY: platformApiKey,
    AI_DI_GROUP_ID: args.groupId,
    AI_DI_WORKFLOW_RUN_ID: args.workflowRunId,
  };
  const request: DenoExecuteRequest = {
    script: entry.script,
    inputCtx: args.inputCtx,
    parameters: args.parameters,
    allowNet,
    ambientEnv,
    timeoutMs,
    maxMemoryMB,
  };

  // (4) POST with a worker-side timeout buffer above the runner's own.
  let response: DenoExecuteResponse;
  try {
    response = await client.execute(
      request,
      AbortSignal.timeout(timeoutMs + HTTP_TIMEOUT_BUFFER_MS),
    );
  } catch (err) {
    if (err instanceof DenoRunnerUnavailableError) {
      throw new Error(`deno runner unavailable: ${err.message}`);
    }
    throw err;
  }

  // (5) Map runner failures to typed errors.
  if (response.timedOut) {
    throw new DynamicNodeTimeoutError(args.slug, args.versionId, timeoutMs);
  }
  if (response.stdoutTooLarge) {
    throw new DynamicNodeStdoutTooLargeError(
      args.slug,
      args.versionId,
      STDOUT_CAP_BYTES,
    );
  }
  if (response.exitCode !== 0) {
    throw new DynamicNodeRuntimeError(
      args.slug,
      args.versionId,
      response.exitCode,
      tail(response.stderr, STDERR_TAIL_BYTES),
    );
  }

  // (6) Parse + structural-check output.
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.stdout);
  } catch {
    throw new DynamicNodeOutputInvalidJsonError(
      args.slug,
      args.versionId,
      response.stdout.slice(0, STDOUT_HEAD_CHARS),
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DynamicNodeOutputInvalidJsonError(
      args.slug,
      args.versionId,
      response.stdout.slice(0, STDOUT_HEAD_CHARS),
    );
  }
  const obj = parsed as Record<string, unknown>;

  const missingPorts = collectMissingPorts(signature, obj);
  if (missingPorts.length > 0) {
    throw new DynamicNodeOutputShapeError(
      args.slug,
      args.versionId,
      missingPorts,
    );
  }
  return obj;
}

/**
 * Parse `DYNAMIC_NODE_ALLOW_NET` (comma-separated) into a host set.
 * Mirror of `parseGlobalAllowlist` in the backend service.
 */
function parseAllowlist(raw: string | undefined): ReadonlySet<string> {
  if (raw === undefined || raw.trim() === "") {
    return new Set();
  }
  return new Set(
    raw
      .split(",")
      .map((h) => h.trim())
      .filter((h) => h !== ""),
  );
}

/**
 * Compute the effective allowNet per L32:
 *   `(signature ∩ global) ∪ {API_BASE_URL host}`
 *
 * Fail-closed: a signature host is kept only if it is explicitly present in
 * the global allowlist. An empty global allowlist therefore yields just the
 * API host. This mirrors the publish-time gate (`validateAllowlist`), which
 * already rejects any host absent from the global allowlist — so the two
 * layers now agree, and a version row that somehow carries a non-allowlisted
 * host (e.g. one inserted outside the publish path) cannot widen run-time
 * egress. The worker's `DYNAMIC_NODE_ALLOW_NET` MUST match the backend's.
 */
export function computeAllowNet(
  global: ReadonlySet<string>,
  signatureAllowNet: string[],
  apiHost: string | null,
): string[] {
  const hosts = new Set<string>();
  for (const host of signatureAllowNet) {
    if (global.has(host)) {
      hosts.add(host);
    }
  }
  if (apiHost !== null) {
    hosts.add(apiHost);
  }
  return Array.from(hosts).sort();
}

/**
 * Extract the `host[:port]` portion of a URL. Returns `null` if the URL
 * can't be parsed.
 */
export function extractHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Required-port check: every signature output that has `required !== false`
 * must be present in the script's returned object (`undefined` counts as
 * missing). Returns the list of missing port names for the typed error.
 */
function collectMissingPorts(
  signature: DynamicNodeSignature,
  output: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const port of signature.outputs) {
    if (port.required === false) continue;
    const value = output[port.name];
    if (value === undefined) {
      missing.push(port.name);
    }
  }
  return missing;
}

/**
 * Keep the last `cap` bytes of `text`. Used to bound `stderr` payload
 * carried in `DynamicNodeRuntimeError.stderrTail`. (The byte budget is
 * measured in UTF-8 bytes, not characters; for ASCII these match.)
 */
function tail(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return text.slice(text.length - cap);
}
