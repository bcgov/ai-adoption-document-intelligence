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

/**
 * Lightweight head-version summary (mirrors backend's
 * `DynamicNodeVersionSummaryDto` — no `script`).
 */
export interface DynamicNodeHeadVersionSummary {
  versionNumber: number;
  signature: DynamicNodeSignatureWire;
  publishedAt: string;
}

/**
 * Full per-version row used by the detail endpoint's `versions[]`
 * (mirrors backend's `DynamicNodeVersionDto` — includes `script` so the
 * version-history pane (US-179) can mount the view modal without an
 * additional round-trip).
 */
export interface DynamicNodeVersionDetail {
  versionNumber: number;
  script: string;
  signature: DynamicNodeSignatureWire;
  allowNet: string[];
  deterministic: boolean;
  publishedAt: string;
  publishedByUserId?: string;
}

/**
 * `GET /api/dynamic-nodes/:slug` response (mirrors backend's
 * `DynamicNodeDetailResponseDto`). `versions` is newest-first.
 */
export interface DynamicNodeDetail {
  slug: string;
  headVersion: DynamicNodeHeadVersionSummary;
  versions: DynamicNodeVersionDetail[];
}

/**
 * One row in the list response (mirrors backend's
 * `DynamicNodeListItemDto`).
 */
export interface DynamicNodeListItem {
  slug: string;
  headVersion: DynamicNodeHeadVersionSummary;
  versionCount: number;
  usedInWorkflowCount: number;
}

/**
 * `GET /api/dynamic-nodes` response (mirrors backend's
 * `DynamicNodeListResponseDto`).
 */
export interface DynamicNodeListResponse {
  items: DynamicNodeListItem[];
}

async function parseErrorResponse(response: Response): Promise<never> {
  let message = response.statusText || "Dynamic-node request failed";
  let body: unknown;
  try {
    body = await response.json();
    const typed = body as ErrorResponseBody;
    const raw = typed?.message;
    if (typeof raw === "string" && raw.length > 0) message = raw;
    else if (Array.isArray(raw)) message = raw.join(", ");
    // Phase 6 (sweep): the publish endpoints return 400 with
    // `{ errors: ParseError[] }`; lift `errors` into the message so callers
    // that only read `error.message` still see something useful while
    // structured consumers read `error.body.errors`.
    const errors = (body as { errors?: unknown })?.errors;
    if (
      Array.isArray(errors) &&
      errors.length > 0 &&
      message === (response.statusText || "Dynamic-node request failed")
    ) {
      message = `Publish failed (${errors.length} error${errors.length === 1 ? "" : "s"})`;
    }
  } catch {
    // Body wasn't JSON.
  }
  throw new ApiError(response.status, message, body);
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

/**
 * `GET /api/dynamic-nodes/:slug` — full version history (newest first).
 * Backs the `useDynamicNode` hook (Phase 6 US-176).
 */
export async function fetchDynamicNode(
  slug: string,
): Promise<DynamicNodeDetail> {
  const response = await fetch(
    `${API_BASE_URL}/dynamic-nodes/${encodeURIComponent(slug)}`,
    {
      method: "GET",
      credentials: "include",
      headers: buildAuthHeaders(),
    },
  );
  if (!response.ok) await parseErrorResponse(response);
  return (await response.json()) as DynamicNodeDetail;
}

/**
 * `GET /api/dynamic-nodes` — list the calling group's non-deleted
 * lineages. Backs the `useDynamicNodeList` hook (Phase 6 US-176).
 */
export async function fetchDynamicNodeList(): Promise<DynamicNodeListResponse> {
  const response = await fetch(`${API_BASE_URL}/dynamic-nodes`, {
    method: "GET",
    credentials: "include",
    headers: buildAuthHeaders(),
  });
  if (!response.ok) await parseErrorResponse(response);
  return (await response.json()) as DynamicNodeListResponse;
}
