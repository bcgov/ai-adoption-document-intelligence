/**
 * `useNodeStatuses` — TanStack Query hook backing the V2 editor's live
 * status badges + active-edge animation while a Try is in progress.
 *
 *   GET /api/workflows/:workflowId/runs/:runId/node-statuses
 *
 * Polls every 1.5s (within the 1–2s budget — see
 * [TRY_IN_PLACE_DESIGN.md §3.3](../../../../../../docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md)),
 * pauses when the browser tab is backgrounded, and stops polling
 * automatically once every node in the returned map is in a terminal
 * state.
 *
 * Consumers:
 *   - `WorkflowEditorV2Page` — drives status badges + active edges with
 *     `opts.active = true` (default).
 *   - `RunHistoryDrawer` — replay flow (US-154) uses `opts.active = false`
 *     so the query fires once and never polls. The hook still returns
 *     the historical status map verbatim.
 *
 * On non-2xx responses the hook surfaces a typed `ApiError`
 * (re-exported from the Phase 8 sibling hook `useSourceUpload`) via
 * the standard TanStack `error` field, carrying both the HTTP status
 * (so US-138 / US-141 can branch on 404 vs 410) and the body's
 * `message` field.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L29
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-137-use-node-statuses-hook.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §3.3
 */

import { type UseQueryResult, useQuery } from "@tanstack/react-query";

import { API_BASE_URL } from "../../../shared/constants";
import { ApiError } from "../sources/useSourceUpload";
import {
  type NodeStatusesMap,
  TERMINAL_NODE_STATUSES,
} from "./node-status.types";

/** Re-exported so consumers can `instanceof`-check + branch on `status`. */
export { ApiError } from "../sources/useSourceUpload";

/**
 * Polling cadence in milliseconds. Matches the design doc's 1.5s
 * cadence; exported so tests can assert it without duplicating the
 * magic number.
 */
export const NODE_STATUSES_POLL_INTERVAL_MS = 1500;

interface ErrorResponseBody {
  message?: string | string[];
}

/**
 * Pulls the CSRF token from the `csrf_token` cookie. Mirrors the
 * helper in `api.service.ts` rather than importing it so this hook
 * stays decoupled from axios. (`GET` requests don't need the CSRF
 * token per the backend's CSRF guard, but we keep the helper here for
 * symmetry with sibling fetch-based hooks.)
 */
function readCsrfToken(): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  return match?.split("=")[1];
}

/**
 * Builds the headers for the node-statuses request. Mirrors the auth
 * shape used by other fetch-based hooks (`useSourceUpload`) — the
 * `x-api-key` is forwarded so the backend's `ApiKeyAuthGuard` accepts
 * the request in `NODE_ENV=test` / dev mode.
 */
function buildAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {};
  const testApiKey = import.meta.env.VITE_TEST_API_KEY;
  if (typeof testApiKey === "string" && testApiKey.length > 0) {
    headers["x-api-key"] = testApiKey;
  }
  const csrfToken = readCsrfToken();
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  return headers;
}

/**
 * Performs the GET and maps non-2xx responses to typed `ApiError`s.
 * Extracted (and exported) so the consumer-facing hook stays focused
 * on the TanStack wiring; tests exercise the hook end-to-end and can
 * therefore stub `globalThis.fetch` once.
 */
export async function fetchNodeStatuses(
  workflowId: string,
  runId: string,
): Promise<NodeStatusesMap> {
  const url = `${API_BASE_URL}/workflows/${workflowId}/runs/${runId}/node-statuses`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    let message = response.statusText || "Failed to fetch node statuses";
    try {
      const body = (await response.json()) as ErrorResponseBody;
      const raw = body?.message;
      if (typeof raw === "string" && raw.length > 0) {
        message = raw;
      } else if (Array.isArray(raw)) {
        message = raw.join(", ");
      }
    } catch {
      // Body wasn't JSON — fall back to statusText.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as NodeStatusesMap;
}

/**
 * Returns `true` when every node in the map is in a terminal state.
 * An empty map is *not* terminal — it means the workflow has only
 * just started and no transitions have been recorded yet, so polling
 * must continue.
 */
function isMapTerminal(map: NodeStatusesMap | undefined): boolean {
  if (!map) return false;
  const entries = Object.values(map);
  if (entries.length === 0) return false;
  return entries.every((entry) =>
    (TERMINAL_NODE_STATUSES as readonly string[]).includes(entry.status),
  );
}

export interface UseNodeStatusesOptions {
  /**
   * When `false`, the query fires once on mount and never polls — the
   * replay flow (US-154 / RunHistoryDrawer) uses this mode to fetch
   * the historical status map verbatim. Defaults to `true`.
   */
  active?: boolean;
}

/**
 * TanStack hook polling the node-statuses endpoint at 1.5s while the
 * Try is in progress.
 *
 * @param workflowId  Lineage id of the workflow.
 * @param runId       Temporal workflow id of the active run (or
 *                    `null` while no Try is in flight).
 * @param opts        `{ active }`: defaults to `true`. Set to `false`
 *                    for the replay flow — fires once, never polls.
 */
export function useNodeStatuses(
  workflowId: string,
  runId: string | null,
  opts?: UseNodeStatusesOptions,
): UseQueryResult<NodeStatusesMap, ApiError> {
  const active = opts?.active !== false;

  return useQuery<NodeStatusesMap, ApiError>({
    queryKey: ["node-statuses", workflowId, runId],
    queryFn: () => {
      // `enabled` below guarantees `runId` is non-null when this runs.
      // The non-null assertion is therefore safe.
      return fetchNodeStatuses(workflowId, runId as string);
    },
    // The query is enabled whenever a `runId` is set — the `active` flag
    // gates only the polling cadence, not whether the query fires. This
    // gives the replay flow (US-154 — `opts.active = false`) a single
    // on-mount fetch with no polling (Scenario 4) while keeping the live
    // Try flow (`opts.active = true` / undefined) polling at 1.5s.
    enabled: !!runId,
    refetchInterval: (query) => {
      // Replay flow: fire once and never poll, regardless of terminal state.
      if (!active) return false;
      // Stop polling the moment the query errors. A run that fails before
      // any node executes resolves the node-statuses endpoint to a 404/410
      // (or any non-2xx) — without this guard the empty-map check below
      // never trips and the hook would poll every 1.5s forever. The
      // consumer surfaces the terminal error via the `error` field.
      if (query.state.status === "error") return false;
      // Stop polling once every status is terminal (succeeded / failed /
      // skipped / cancelled). The interval stays armed while data is
      // absent (initial load) or while any non-terminal entry remains.
      if (isMapTerminal(query.state.data)) return false;
      return NODE_STATUSES_POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
  });
}
