import { APIRequestContext, expect } from "@playwright/test";
import { BACKEND_URL, TEST_API_KEY } from "./wb-test";

const headers = {
  "x-api-key": TEST_API_KEY,
  "Content-Type": "application/json",
};

/**
 * A minimal, publish-valid dynamic-node script (mirrors the Phase 6 walkthrough
 * fixture). Publishing runs jsdoc-parse → signature-semantics → ts-check
 * (via the deno-runner sidecar) → allowlist, so callers of `publishDynamicNode`
 * MUST be in the @infra tier.
 */
export function validDynamicNodeScript(name: string): string {
  return `import type { Document } from "@ai-di/graph-workflow/kinds";

/**
 * @workflow-node
 * @name ${name}
 * @description Uppercases the documentUrl field.
 * @inputs { document: { kind: "Document", required: true } }
 * @outputs { result: { kind: "Artifact" } }
 */
export default async function dynamicNode(
  ctx: { document: Document },
  _params: Record<string, unknown>,
): Promise<{ result: { url: string } }> {
  const url = String((ctx.document as { url?: string }).url ?? "");
  return { result: { url: url.toUpperCase() } };
}`;
}

export async function publishDynamicNode(
  request: APIRequestContext,
  name: string,
): Promise<{ slug: string; version: number }> {
  const res = await request.post(`${BACKEND_URL}/api/dynamic-nodes`, {
    headers,
    data: { script: validDynamicNodeScript(name) },
  });
  expect(
    res.ok(),
    `publish dynamic node failed: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  return (await res.json()) as { slug: string; version: number };
}

export async function deleteDynamicNode(
  request: APIRequestContext,
  slug: string,
): Promise<void> {
  await request.delete(`${BACKEND_URL}/api/dynamic-nodes/${slug}`, { headers });
}

/** One structured publish-time validation error (see `PublishValidationError`). */
export interface PublishStageError {
  stage: "jsdoc-parse" | "signature-semantics" | "ts-check" | "allowlist";
  message: string;
  rejectedHost?: string;
  line?: number;
  column?: number;
}

export interface PublishAttemptResult {
  status: number;
  body: { errors?: PublishStageError[]; slug?: string; version?: number };
}

/**
 * POST an arbitrary script to the publish endpoint and return the raw
 * status + parsed body WITHOUT asserting success — for the negative security
 * tests that expect a validation rejection (e.g. allowlist stage). Publishing
 * runs the real deno toolchain (ts-check → allowlist) so callers MUST be @infra.
 */
export async function attemptPublishScript(
  request: APIRequestContext,
  script: string,
): Promise<PublishAttemptResult> {
  const res = await request.post(`${BACKEND_URL}/api/dynamic-nodes`, {
    headers,
    data: { script },
  });
  return {
    status: res.status(),
    body: (await res.json()) as PublishAttemptResult["body"],
  };
}

/**
 * The deno-runner sidecar base URL. The runner is a prerequisite of the @infra
 * tier (published/run dynamic nodes execute inside it); tests that hit it
 * directly exercise the per-invocation Deno permission sandbox — the same
 * fast-path the manual test plan documents for the security checks.
 */
export const DENO_RUNNER_URL =
  process.env.DENO_RUNNER_URL ?? "http://localhost:9099";

/** Shape returned by the deno-runner `POST /execute` endpoint. */
export interface RunnerExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  stdoutTooLarge?: boolean;
}

/**
 * Run a user script directly against the deno-runner sandbox. Mirrors the
 * request shape the worker's `dyn.run` activity sends. `allowNet`/`ambientEnv`
 * default to the maximally-restricted empty sets so a bare call proves the
 * default-deny posture; pass hosts/env explicitly to prove the gate opens.
 */
export async function execViaRunner(
  request: APIRequestContext,
  opts: {
    script: string;
    allowNet?: string[];
    ambientEnv?: Record<string, string>;
    timeoutMs?: number;
    maxMemoryMB?: number;
  },
): Promise<RunnerExecuteResult> {
  const res = await request.post(`${DENO_RUNNER_URL}/execute`, {
    headers: { "Content-Type": "application/json" },
    data: {
      script: opts.script,
      inputCtx: {},
      parameters: {},
      allowNet: opts.allowNet ?? [],
      ambientEnv: opts.ambientEnv ?? {},
      timeoutMs: opts.timeoutMs ?? 5000,
      maxMemoryMB: opts.maxMemoryMB ?? 128,
    },
  });
  expect(
    res.ok(),
    `deno-runner /execute failed: ${res.status()} ${await res.text()}`,
  ).toBeTruthy();
  return (await res.json()) as RunnerExecuteResult;
}
