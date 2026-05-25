/**
 * Wire helpers for the `/api/dynamic-nodes/*` mutation surface
 * (Phase 6 Milestone B — US-165 / US-166 / US-167).
 *
 * Used by `useDynamicNodePublish` + `useDynamicNodeDelete` (US-175 sets
 * these up so the catalog hook's invalidation path is wired; the full
 * editor wiring lands in Milestone E US-176).
 */

import { API_BASE_URL } from "../../../shared/constants";
import { ApiError } from "../sources/useSourceUpload";

function readCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  return match?.split("=")[1];
}

function buildAuthHeaders(contentType?: string): HeadersInit {
  const headers: Record<string, string> = {};
  if (contentType !== undefined) headers["Content-Type"] = contentType;
  const testApiKey = import.meta.env.VITE_TEST_API_KEY;
  if (typeof testApiKey === "string" && testApiKey.length > 0) {
    headers["x-api-key"] = testApiKey;
  }
  const csrfToken = readCsrfToken();
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  return headers;
}

interface ErrorResponseBody {
  message?: string | string[];
}

/**
 * Server-returned signature (mirrors backend's
 * `DynamicNodeSignatureDto`). Surfaced to the editor's preview pane.
 */
export interface DynamicNodeSignatureWire {
  name: string;
  description: string;
  category: string;
  deterministic: boolean;
  inputs: Array<{
    name: string;
    kind: string;
    required?: boolean;
    description?: string;
  }>;
  outputs: Array<{
    name: string;
    kind: string;
    required?: boolean;
    description?: string;
  }>;
  paramsSchema: Record<string, unknown>;
  allowNet: string[];
  timeoutMs: number;
  maxMemoryMB: number;
}

/**
 * Server-returned publish response (mirrors backend's
 * `DynamicNodePublishResponseDto`). The full editor wires this into
 * its signature-preview pane in US-176; this story just provides the
 * round-trip shape so the invalidation path lands.
 */
export interface DynamicNodePublishResult {
  slug: string;
  version: number;
  signature: DynamicNodeSignatureWire;
  errors: unknown[];
}

/**
 * Server-returned delete response (mirrors backend's
 * `DynamicNodeDeletedResponseDto`).
 */
export interface DynamicNodeDeletedResult {
  slug: string;
  deletedAt: string;
  usedInWorkflowCount: number;
}

async function parseErrorResponse(response: Response): Promise<never> {
  let message = response.statusText || "Dynamic-node request failed";
  try {
    const body = (await response.json()) as ErrorResponseBody;
    const raw = body?.message;
    if (typeof raw === "string" && raw.length > 0) message = raw;
    else if (Array.isArray(raw)) message = raw.join(", ");
  } catch {
    // Body wasn't JSON.
  }
  throw new ApiError(response.status, message);
}

export async function publishDynamicNode(
  script: string,
): Promise<DynamicNodePublishResult> {
  const response = await fetch(`${API_BASE_URL}/dynamic-nodes`, {
    method: "POST",
    credentials: "include",
    headers: buildAuthHeaders("application/json"),
    body: JSON.stringify({ script }),
  });
  if (!response.ok) await parseErrorResponse(response);
  return (await response.json()) as DynamicNodePublishResult;
}

export async function updateDynamicNode(
  slug: string,
  script: string,
): Promise<DynamicNodePublishResult> {
  const response = await fetch(
    `${API_BASE_URL}/dynamic-nodes/${encodeURIComponent(slug)}`,
    {
      method: "PUT",
      credentials: "include",
      headers: buildAuthHeaders("application/json"),
      body: JSON.stringify({ script }),
    },
  );
  if (!response.ok) await parseErrorResponse(response);
  return (await response.json()) as DynamicNodePublishResult;
}

export async function deleteDynamicNode(
  slug: string,
): Promise<DynamicNodeDeletedResult> {
  const response = await fetch(
    `${API_BASE_URL}/dynamic-nodes/${encodeURIComponent(slug)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: buildAuthHeaders(),
    },
  );
  if (!response.ok) await parseErrorResponse(response);
  return (await response.json()) as DynamicNodeDeletedResult;
}
