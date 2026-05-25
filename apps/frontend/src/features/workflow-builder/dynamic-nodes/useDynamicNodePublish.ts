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
 * On success: invalidates the catalog query so the palette / canvas
 * / settings panel re-render with the latest entry.
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
    onSuccess: () => {
      // US-175 Scenarios 2 + 3 — invalidate the merged catalog key so
      // `useActivityCatalog` refetches and consumers re-render with
      // the new dynamic entry.
      queryClient.invalidateQueries({
        queryKey: ACTIVITY_CATALOG_QUERY_KEY,
      });
    },
  });
}
