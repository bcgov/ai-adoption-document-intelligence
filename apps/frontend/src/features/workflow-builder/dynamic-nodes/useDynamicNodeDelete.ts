/**
 * `useDynamicNodeDelete` — TanStack mutation that soft-deletes a
 * dynamic-node lineage via `DELETE /api/dynamic-nodes/:slug`.
 *
 * Phase 6 US-175 Scenario 4: on success the catalog query is
 * invalidated; the palette's "Custom" section drops the entry, and
 * any canvas instances of `dyn.<deleted-slug>` immediately resolve to
 * "missing from catalog" — the US-183 "Deleted" badge takes over from
 * there.
 *
 * Phase 6 US-176 (Milestone E) wraps this hook with the management
 * page's confirm-delete modal; this story ships only the mutation +
 * invalidation wiring.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../sources/useSourceUpload";
import { ACTIVITY_CATALOG_QUERY_KEY } from "./activity-catalog.types";
import {
  type DynamicNodeDeletedResult,
  deleteDynamicNode,
} from "./dynamic-node-api";
import { dynamicNodeQueryKey } from "./useDynamicNode";
import { DYNAMIC_NODE_LIST_QUERY_KEY } from "./useDynamicNodeList";

export type { DynamicNodeDeletedResult } from "./dynamic-node-api";

/**
 * Mutation hook. The mutation function takes the lineage slug.
 * On success: invalidates the merged catalog query so the palette /
 * settings panel / canvas re-render without the deleted entry; also
 * busts the per-lineage detail query + the list query so the editor
 * + management page reflect the deletion immediately (US-176
 * Scenario 4).
 */
export function useDynamicNodeDelete() {
  const queryClient = useQueryClient();
  return useMutation<DynamicNodeDeletedResult, ApiError, string>({
    mutationFn: (slug) => deleteDynamicNode(slug),
    onSuccess: (result) => {
      // US-175 Scenario 4 — invalidate the merged catalog key so
      // `useActivityCatalog` refetches and the deleted entry
      // disappears from every consumer in lock-step.
      queryClient.invalidateQueries({
        queryKey: ACTIVITY_CATALOG_QUERY_KEY,
      });
      // US-176 Scenario 4 — drop the lineage's detail cache + refetch
      // the management list so the post-delete state is consistent.
      queryClient.invalidateQueries({
        queryKey: dynamicNodeQueryKey(result.slug),
      });
      queryClient.invalidateQueries({
        queryKey: DYNAMIC_NODE_LIST_QUERY_KEY,
      });
    },
  });
}
