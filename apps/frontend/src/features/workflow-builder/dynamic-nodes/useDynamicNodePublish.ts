/**
 * `useDynamicNodePublish` — TanStack mutation that publishes a
 * dynamic-node script via `POST /api/dynamic-nodes` (create-mode)
 * or `PUT /api/dynamic-nodes/:slug` (update-mode).
 *
 * Phase 6 US-175: the canonical seam where the catalog hook's
 * invalidation path lands. Every successful publish (POST or PUT)
 * invalidates the `['activity-catalog']` query key so
 * `useActivityCatalog` refetches automatically — palette + canvas +
 * settings panel + binding-walk validator all re-derive with the new
 * dynamic entry visible.
 *
 * Phase 6 US-176 (Milestone E) wraps this hook with the editor's full
 * UX (validation-error surfacing, "Publish" button state, etc.). This
 * story ships only the mutation + invalidation wiring; the editor
 * consumes the hook as-is.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../sources/useSourceUpload";
import { ACTIVITY_CATALOG_QUERY_KEY } from "./activity-catalog.types";
import {
  type DynamicNodePublishResult,
  publishDynamicNode,
  updateDynamicNode,
} from "./dynamic-node-api";
import { dynamicNodeQueryKey } from "./useDynamicNode";
import { DYNAMIC_NODE_LIST_QUERY_KEY } from "./useDynamicNodeList";

export type { DynamicNodePublishResult } from "./dynamic-node-api";

export interface PublishDynamicNodeInput {
  /** Slug omitted = create-mode (POST). Set = update-mode (PUT). */
  slug?: string;
  script: string;
}

/**
 * Mutation hook. The mutation function accepts either:
 *  - `{ script }` — POST a new lineage (v1)
 *  - `{ slug, script }` — PUT a new version on the existing lineage
 *
 * On success: invalidates the merged catalog query so the palette /
 * canvas / settings panel re-render with the latest entry, plus the
 * per-lineage detail query (`['dynamic-node', slug]`) and the list
 * query (`['dynamic-node-list']`) so the editor's version-history
 * pane (US-179) and the management page's table (US-180) refetch
 * automatically after a publish — closing the loop end-to-end.
 */
export function useDynamicNodePublish() {
  const queryClient = useQueryClient();
  return useMutation<
    DynamicNodePublishResult,
    ApiError,
    PublishDynamicNodeInput
  >({
    mutationFn: async (input) => {
      if (input.slug === undefined) {
        return publishDynamicNode(input.script);
      }
      return updateDynamicNode(input.slug, input.script);
    },
    onSuccess: (result) => {
      // US-175 Scenarios 2 + 3 — invalidate the merged catalog key so
      // `useActivityCatalog` refetches and consumers re-render with
      // the new dynamic entry.
      queryClient.invalidateQueries({
        queryKey: ACTIVITY_CATALOG_QUERY_KEY,
      });
      // US-176 Scenario 4 — invalidate the per-lineage detail + the
      // list so the editor's version-history pane + the management
      // page table refetch with the new version row.
      queryClient.invalidateQueries({
        queryKey: dynamicNodeQueryKey(result.slug),
      });
      queryClient.invalidateQueries({
        queryKey: DYNAMIC_NODE_LIST_QUERY_KEY,
      });
    },
  });
}
