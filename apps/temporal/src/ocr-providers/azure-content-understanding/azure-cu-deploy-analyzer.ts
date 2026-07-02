/**
 * Idempotent Azure Content Understanding analyzer deployment.
 *
 * The activity:
 *   1. Computes a deterministic hash of the desired analyzer body so we can
 *      avoid re-deploying when nothing changed.
 *   2. GETs the existing analyzer; if it matches the desired definition,
 *      returns immediately.
 *   3. Otherwise PUTs the analyzer (CU's PUT is upsert).
 *
 * In-memory cache keyed by `analyzerId + bodyHash` short-circuits repeated
 * deploys within the same worker process. The PUT itself is idempotent on
 * the CU side, so worker restarts simply repeat the no-op.
 *
 * This activity is intentionally side-effect-only (no return body of
 * substance) — the caller is the analyze activity which knows the
 * analyzer-id contract.
 */

import { getErrorMessage } from "@ai-di/shared-logging";
import { createActivityLogger } from "../../logger";
import {
  type CuAnalyzerDefinition,
  hashCuAnalyzerDefinition,
} from "./analyzer-schema-builder";
import {
  analyzerDefinitionMatches,
  type CuAuthMode,
  createCuAxiosInstance,
  cuAnalyzerUrl,
  describeAxiosFailure,
} from "./azure-cu-client";

const deployCache = new Map<string, string>();

export interface AzureCuDeployAnalyzerParams {
  analyzerId: string;
  analyzer: CuAnalyzerDefinition;
  endpoint?: string;
  apiKey?: string;
  authMode?: CuAuthMode;
  requestId?: string;
}

export interface AzureCuDeployAnalyzerResult {
  analyzerId: string;
  status: "deployed" | "updated" | "noop_cached" | "noop_remote_match";
  bodyHash: string;
}

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

const READY_POLL_INTERVAL_MS = 1000;
const READY_POLL_MAX_ATTEMPTS = 90; // ~90 s — analyzer creation is usually < 5 s.

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAnalyzerReady(
  client: ReturnType<typeof createCuAxiosInstance>,
  url: string,
  analyzerId: string,
  log: ReturnType<typeof createActivityLogger>,
): Promise<void> {
  for (let attempt = 0; attempt < READY_POLL_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(READY_POLL_INTERVAL_MS);
    const resp = await client.get(url);
    if (resp.status !== 200) {
      log.warn("Azure CU analyzer status probe transient", {
        event: "ready_probe_transient",
        analyzerId,
        attempt: String(attempt),
        httpStatus: String(resp.status),
      });
      continue;
    }
    const body = resp.data as { status?: string };
    if (body.status === "ready") return;
    if (body.status === "failed") {
      throw new Error(
        `Azure CU analyzer ${analyzerId} entered terminal state 'failed' after PUT.`,
      );
    }
    // creating | unknown — keep polling
  }
  throw new Error(
    `Azure CU analyzer ${analyzerId} did not become ready within ${(READY_POLL_MAX_ATTEMPTS * READY_POLL_INTERVAL_MS) / 1000}s.`,
  );
}

export function __resetDeployCacheForTests(): void {
  deployCache.clear();
}

export async function azureCuDeployAnalyzer(
  params: AzureCuDeployAnalyzerParams,
): Promise<AzureCuDeployAnalyzerResult> {
  const activityName = "azureCuDeployAnalyzer";
  const log = createActivityLogger(activityName, {
    ...(params.requestId && { requestId: params.requestId }),
  });
  const startTime = Date.now();
  const useMock = process.env.MOCK_AZURE_CU === "true";

  if (!params.analyzerId.trim()) {
    throw new Error("azureCuDeployAnalyzer: analyzerId is required.");
  }

  const bodyHash = hashCuAnalyzerDefinition(params.analyzer);
  const cacheKey = `${params.analyzerId}::${bodyHash}`;

  if (useMock) {
    deployCache.set(cacheKey, bodyHash);
    log.info("Azure CU deploy analyzer (mock)", {
      event: "deploy_mock",
      analyzerId: params.analyzerId,
      bodyHash,
      durationMs: Date.now() - startTime,
    });
    return { analyzerId: params.analyzerId, status: "deployed", bodyHash };
  }

  if (deployCache.get(cacheKey) === bodyHash) {
    log.info("Azure CU deploy analyzer cached (no-op)", {
      event: "deploy_cached_noop",
      analyzerId: params.analyzerId,
      bodyHash,
      durationMs: Date.now() - startTime,
    });
    return {
      analyzerId: params.analyzerId,
      status: "noop_cached",
      bodyHash,
    };
  }

  const endpoint = params.endpoint ?? readEnv("AZURE_CU_ENDPOINT");
  const apiKey = params.apiKey ?? readEnv("AZURE_CU_KEY");
  if (!endpoint) {
    throw new Error(
      "Azure Content Understanding endpoint not configured. Set AZURE_CU_ENDPOINT environment variable.",
    );
  }
  if (!apiKey) {
    throw new Error(
      "Azure Content Understanding API key not configured. Set AZURE_CU_KEY environment variable.",
    );
  }

  const client = createCuAxiosInstance({
    endpoint,
    apiKey,
    authMode: params.authMode,
  });
  const url = cuAnalyzerUrl(params.analyzerId);

  // 1. Probe — does an analyzer with this id already exist?
  const existing = await client.get(url);
  if (existing.status === 200) {
    if (
      analyzerDefinitionMatches(
        params.analyzer as unknown as Record<string, unknown>,
        existing.data as Record<string, unknown> | undefined,
      )
    ) {
      deployCache.set(cacheKey, bodyHash);
      log.info("Azure CU deploy analyzer remote match (no-op)", {
        event: "deploy_remote_noop",
        analyzerId: params.analyzerId,
        bodyHash,
        durationMs: Date.now() - startTime,
      });
      return {
        analyzerId: params.analyzerId,
        status: "noop_remote_match",
        bodyHash,
      };
    }
    // CU's PATCH endpoint can only update `description` and `tags`. To
    // change `fieldSchema` / `models` / `config`, the analyzer has to be
    // deleted first — a plain PUT against an existing analyzerId returns
    // 409 ModelExists. So when the deployed body diverges from the
    // desired body, delete it first and PUT a fresh copy.
    log.info("Azure CU deploy analyzer body changed; deleting before PUT", {
      event: "deploy_delete_before_put",
      analyzerId: params.analyzerId,
    });
    const del = await client.delete(url);
    if (!(del.status >= 200 && del.status < 300) && del.status !== 404) {
      log.error("Azure CU deploy analyzer DELETE failed", {
        event: "deploy_delete_error",
        analyzerId: params.analyzerId,
        httpStatus: String(del.status),
        body: typeof del.data === "object" ? del.data : String(del.data),
      });
      throw new Error(
        `Azure CU deploy analyzer DELETE failed: HTTP ${del.status}`,
      );
    }
  } else if (existing.status !== 404) {
    log.warn("Azure CU deploy analyzer probe returned unexpected status", {
      event: "deploy_probe_unexpected",
      analyzerId: params.analyzerId,
      status: String(existing.status),
      body:
        typeof existing.data === "object"
          ? existing.data
          : String(existing.data),
    });
  }

  // 2. Upsert via PUT (now guaranteed the analyzer doesn't exist).
  try {
    const put = await client.put(url, params.analyzer);
    if (put.status >= 200 && put.status < 300) {
      // CU returns the analyzer immediately but `status: "creating"` —
      // analyze calls fail with `ScenarioNotReady` until status is
      // `ready`. Poll until terminal.
      await waitForAnalyzerReady(client, url, params.analyzerId, log);
      deployCache.set(cacheKey, bodyHash);
      const status: AzureCuDeployAnalyzerResult["status"] =
        existing.status === 200 ? "updated" : "deployed";
      log.info("Azure CU deploy analyzer complete", {
        event: "deploy_complete",
        analyzerId: params.analyzerId,
        bodyHash,
        httpStatus: String(put.status),
        durationMs: Date.now() - startTime,
        status,
      });
      return { analyzerId: params.analyzerId, status, bodyHash };
    }
    log.error("Azure CU deploy analyzer non-2xx", {
      event: "deploy_error",
      analyzerId: params.analyzerId,
      httpStatus: String(put.status),
      body: typeof put.data === "object" ? put.data : String(put.data),
    });
    throw new Error(`Azure CU deploy analyzer failed: HTTP ${put.status}`);
  } catch (err) {
    const { status, message } = describeAxiosFailure(err);
    log.error("Azure CU deploy analyzer error", {
      event: "deploy_error",
      analyzerId: params.analyzerId,
      httpStatus: status !== undefined ? String(status) : undefined,
      error: getErrorMessage(err),
    });
    throw new Error(
      `Azure CU deploy analyzer failed${status ? ` (${status})` : ""}: ${message}`,
    );
  }
}
