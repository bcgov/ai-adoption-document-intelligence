/**
 * `useDynamicNode` — TanStack Query hook for `GET /api/dynamic-nodes/:slug`.
 *
 * Phase 6 US-176 (Milestone E). Surfaces the full version history of a
 * single dynamic-node lineage — newest-first — for the editor's edit
 * mode (CodePane hydrates from `headVersion.script` / VersionHistoryPane
 * renders the per-version rows + view modal).
 *
 * Query key: `['dynamic-node', slug]`. The companion mutation hooks
 * (`useDynamicNodePublish`, `useDynamicNodeDelete`) invalidate this key
 * on success so the version-history pane refetches after a publish or
 * a revert without a page reload.
 *
 * Disabled until a slug is provided (create-mode in the editor shell
 * passes `slug` undefined).
 */

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../sources/useSourceUpload";
import { type DynamicNodeDetail, fetchDynamicNode } from "./dynamic-node-api";

export type { DynamicNodeDetail } from "./dynamic-node-api";

/**
 * Build the canonical query key for a lineage's detail query. Exported so
 * the mutation hooks can invalidate the per-slug entry without
 * re-declaring the literal.
 */
export function dynamicNodeQueryKey(slug: string): readonly [string, string] {
  return ["dynamic-node", slug] as const;
}

export function useDynamicNode(slug: string | undefined) {
  return useQuery<DynamicNodeDetail, ApiError>({
    queryKey: slug ? dynamicNodeQueryKey(slug) : ["dynamic-node", null],
    queryFn: () => {
      // `enabled: !!slug` below guards against this branch — TanStack
      // never calls `queryFn` when the query is disabled.
      if (slug === undefined) {
        throw new Error("useDynamicNode: queryFn called without slug");
      }
      return fetchDynamicNode(slug);
    },
    enabled: slug !== undefined,
    retry: false,
  });
}
