/**
 * HTTP client helpers for Azure AI Content Understanding REST API.
 *
 * Endpoints (api-version `2025-11-01`):
 *   PUT  /contentunderstanding/analyzers/{analyzerId}                 — upsert analyzer
 *   GET  /contentunderstanding/analyzers/{analyzerId}                 — read deployed analyzer
 *   POST /contentunderstanding/analyzers/{analyzerId}:analyze         — submit a document
 *   GET  /contentunderstanding/analyzerResults/{request-id}           — poll long-running result
 *
 * Authentication: the documented quickstart uses `Ocp-Apim-Subscription-Key`.
 * Foundry deployments may also accept `Authorization: Bearer`. We send the
 * Ocp-Apim-Subscription-Key header by default and fall back to `Authorization: Bearer`
 * if the auth-mode flag is set, mirroring the Mistral-on-Foundry split.
 */

import axios, { AxiosError, type AxiosInstance } from "axios";

export const CU_API_VERSION = "2025-11-01";
export const CU_BASE_PATH = "/contentunderstanding";

/**
 * Authentication mode for the CU endpoint.
 *  - `subscription-key` — `Ocp-Apim-Subscription-Key: <key>` (Microsoft Learn quickstart default)
 *  - `bearer`           — `Authorization: Bearer <key>` (Foundry-style; matches Mistral on Foundry)
 */
export type CuAuthMode = "subscription-key" | "bearer";

export interface CuClientOptions {
  endpoint: string;
  apiKey: string;
  authMode?: CuAuthMode;
  /** Override timeout (ms) per call. Default 600 s — generous for poll cycles. */
  timeoutMs?: number;
}

function buildBaseUrl(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

function buildAuthHeaders(
  apiKey: string,
  authMode: CuAuthMode,
): Record<string, string> {
  if (authMode === "bearer") {
    return { Authorization: `Bearer ${apiKey}` };
  }
  return { "Ocp-Apim-Subscription-Key": apiKey };
}

export function createCuAxiosInstance(opts: CuClientOptions): AxiosInstance {
  const baseURL = buildBaseUrl(opts.endpoint);
  const authMode = opts.authMode ?? "subscription-key";
  const headers = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(opts.apiKey, authMode),
  };
  return axios.create({
    baseURL,
    headers,
    timeout: opts.timeoutMs ?? 600_000,
    validateStatus: () => true,
  });
}

export function cuAnalyzerUrl(analyzerId: string): string {
  return `${CU_BASE_PATH}/analyzers/${encodeURIComponent(analyzerId)}?api-version=${CU_API_VERSION}`;
}

export function cuAnalyzeUrl(analyzerId: string): string {
  return `${CU_BASE_PATH}/analyzers/${encodeURIComponent(analyzerId)}:analyze?api-version=${CU_API_VERSION}`;
}

export function cuAnalyzeResultUrlFromOperation(
  operationLocation: string,
): string {
  // The header value is an absolute URL; for axios-with-baseURL we strip the
  // origin so the relative path lands on the same baseURL. If the URL is
  // already relative we return it untouched.
  try {
    const u = new URL(operationLocation);
    return `${u.pathname}${u.search}`;
  } catch {
    return operationLocation;
  }
}

export function cuAnalyzeResultUrlFromId(requestId: string): string {
  return `${CU_BASE_PATH}/analyzerResults/${encodeURIComponent(requestId)}?api-version=${CU_API_VERSION}`;
}

/**
 * Returns true if two analyzer JSON definitions are equivalent for the
 * purpose of skipping a deploy. We compare the ground-truth fields of the
 * outgoing definition (description, baseAnalyzerId, config, fieldSchema)
 * against whatever subset the deployed analyzer exposes; CU's GET response
 * may include server-side metadata (createdAt, status, etc.) we ignore.
 */
export function analyzerDefinitionMatches(
  desired: Record<string, unknown>,
  deployed: Record<string, unknown> | null | undefined,
): boolean {
  if (!deployed) return false;
  const interestingKeys = [
    "description",
    "baseAnalyzerId",
    "models",
    "config",
    "fieldSchema",
  ] as const;
  for (const key of interestingKeys) {
    const a = JSON.stringify(desired[key] ?? null);
    const b = JSON.stringify(deployed[key] ?? null);
    if (a !== b) return false;
  }
  return true;
}

/** Extract a status-code-friendly message from an axios error response. */
export function describeAxiosFailure(err: unknown): {
  status: number | undefined;
  message: string;
  body: unknown;
} {
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError;
    return {
      status: e.response?.status,
      message: e.message,
      body: e.response?.data,
    };
  }
  return {
    status: undefined,
    message: err instanceof Error ? err.message : String(err),
    body: undefined,
  };
}
