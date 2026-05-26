/**
 * `useDynamicNodeList` — TanStack Query hook for `GET /api/dynamic-nodes`.
 *
 * Phase 6 US-176 (Milestone E). Returns the calling group's non-deleted
 * lineages, sorted by slug ascending. Backs the management page's table
 * view (US-180) and the catalog-related affordances.
 *
 * Query key: `['dynamic-node-list']`. The companion mutation hooks
 * (`useDynamicNodePublish`, `useDynamicNodeDelete`) invalidate this key
 * on success so the list refetches after a publish / revert / delete
 * without a page reload.
 */

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../sources/useSourceUpload";
import {
  type DynamicNodeListResponse,
  fetchDynamicNodeList,
} from "./dynamic-node-api";

export type {
  DynamicNodeListItem,
  DynamicNodeListResponse,
} from "./dynamic-node-api";

export const DYNAMIC_NODE_LIST_QUERY_KEY = ["dynamic-node-list"] as const;

export function useDynamicNodeList() {
  return useQuery<DynamicNodeListResponse, ApiError>({
    queryKey: DYNAMIC_NODE_LIST_QUERY_KEY,
    queryFn: () => fetchDynamicNodeList(),
    retry: false,
  });
}
