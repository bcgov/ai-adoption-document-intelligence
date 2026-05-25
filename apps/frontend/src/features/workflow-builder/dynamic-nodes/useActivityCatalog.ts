/**
 * `useActivityCatalog` — TanStack Query hook backing the merged activity
 * catalog (Phase 6 US-175).
 *
 * Subscribes to `GET /api/activity-catalog` (US-173). The response
 * contains every static catalog entry followed by the calling group's
 * non-deleted dynamic-node lineages — consumers (`ActivityPalette`,
 * `NodeSettingsPanel`, canvas `getEntry` lookup) treat the merged list
 * uniformly. Phase-6-specific UI (DYN pill, "Edit script" right-click)
 * gates on `entry.dynamicNodeSlug` being present.
 *
 * Query key `['activity-catalog']` is the canonical invalidation
 * target. The sibling mutation hooks
 * (`useDynamicNodePublish`, `useDynamicNodeDelete`) call
 * `queryClient.invalidateQueries({ queryKey: ACTIVITY_CATALOG_QUERY_KEY })`
 * on success so the catalog refetches without a Vite restart or page
 * reload.
 *
 * 401 / 403 responses surface as `ApiError` — consumers re-render the
 * empty state. 500 surfaces similarly. The hook deliberately does NOT
 * retry on error (TanStack default would hammer the backend) — it
 * relies on TanStack's standard refetch-on-mount + manual
 * `invalidateQueries` triggers.
 */

import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "../../../shared/constants";
import { ApiError } from "../sources/useSourceUpload";
import {
  ACTIVITY_CATALOG_QUERY_KEY,
  type ActivityCatalogEntry,
  type ActivityCatalogResponse,
} from "./activity-catalog.types";

export { ApiError } from "../sources/useSourceUpload";
export {
  ACTIVITY_CATALOG_QUERY_KEY,
  type ActivityCatalogEntry,
  type ActivityCatalogPortDescriptor,
  type ActivityCatalogResponse,
} from "./activity-catalog.types";

interface ErrorResponseBody {
  message?: string | string[];
}

function readCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  return match?.split("=")[1];
}

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
 * Exported so the mutation hooks' tests can stub it via
 * `vi.mock`/`jest.mock` without standing up a `fetch` polyfill.
 */
export async function fetchActivityCatalog(): Promise<ActivityCatalogResponse> {
  const response = await fetch(`${API_BASE_URL}/activity-catalog`, {
    method: "GET",
    credentials: "include",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    let message = response.statusText || "Failed to fetch activity catalog";
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

  return (await response.json()) as ActivityCatalogResponse;
}

export interface UseActivityCatalogResult {
  /** Merged static + dynamic entries; empty array while pending. */
  entries: ActivityCatalogEntry[];
  /** True while the query is in-flight (TanStack `isPending` semantics). */
  isLoading: boolean;
  /** Surfaced when the fetch fails. `null` otherwise. */
  error: ApiError | null;
}

/**
 * TanStack hook fetching the merged activity catalog. Single query
 * key (`['activity-catalog']`) — the same hook instance is shared
 * across the palette, settings panel, canvas, and binding-walk
 * validator surfaces. Mutation hooks invalidate this key on every
 * publish / update / delete success to drive hot-reload.
 */
export function useActivityCatalog(): UseActivityCatalogResult {
  const query = useQuery<ActivityCatalogResponse, ApiError>({
    queryKey: ACTIVITY_CATALOG_QUERY_KEY,
    queryFn: () => fetchActivityCatalog(),
    retry: false,
  });

  return {
    entries: query.data?.entries ?? [],
    isLoading: query.isPending,
    error: query.error ?? null,
  };
}
