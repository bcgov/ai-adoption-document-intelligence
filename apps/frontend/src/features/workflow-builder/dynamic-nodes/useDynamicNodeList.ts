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
import { useGroup } from "../../../auth/GroupContext";
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
  const { activeGroup } = useGroup();
  const activeGroupId = activeGroup?.id ?? null;
  return useQuery<DynamicNodeListResponse, ApiError>({
    // The group is part of the key so switching groups refetches rather than
    // serving another group's lineages from cache. Mutation hooks invalidate
    // the bare `DYNAMIC_NODE_LIST_QUERY_KEY`, which still matches by prefix.
    queryKey: [...DYNAMIC_NODE_LIST_QUERY_KEY, activeGroupId ?? "no-group"],
    queryFn: () => fetchDynamicNodeList(activeGroupId),
    retry: false,
  });
}
