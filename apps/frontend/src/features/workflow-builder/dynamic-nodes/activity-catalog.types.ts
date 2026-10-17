/**
 * Wire-format type for `GET /api/activity-catalog` (US-173).
 *
 * Mirrors the backend's `ActivityCatalogEntryDto` shape — the
 * Phase 6 dynamic-entry fields (`dynamicNodeSlug`, `dynamicNodeVersion`,
 * `allowNet`) are populated for dynamic nodes and `undefined` for
 * static entries.
 *
 * The static catalog continues to live in `@ai-di/graph-workflow`'s
 * `ACTIVITY_CATALOG`; consumers that need the Zod `parametersSchema`
 * for static entries still read it from the shared package. The
 * merged endpoint surfaces `paramsSchema` (JSON Schema 7) for dynamic
 * entries — static entries carry `paramsSchema: undefined` and the
 * frontend converts the package's Zod schema via
 * `getActivityParametersJsonSchema` when needed.
 */
export interface ActivityCatalogPortDescriptor {
  name: string;
  label: string;
  description?: string;
  required?: boolean;
  kind?: string;
}

export interface ActivityCatalogEntry {
  activityType: string;
  displayName?: string;
  category: string;
  description: string;
  iconHint: string;
  colorHint: string;
  inputs: ActivityCatalogPortDescriptor[];
  outputs: ActivityCatalogPortDescriptor[];
  paramsSchema?: Record<string, unknown>;
  nonCacheable?: boolean;
  dynamicNodeSlug?: string;
  dynamicNodeVersion?: number;
  allowNet?: string[];
}

export interface ActivityCatalogResponse {
  entries: ActivityCatalogEntry[];
}

/**
 * Canonical TanStack query key for the catalog hook.
 *
 * Single literal so the mutation hooks below
 * (`useDynamicNodePublish`, `useDynamicNodeDelete`) can call
 * `queryClient.invalidateQueries({ queryKey: ACTIVITY_CATALOG_QUERY_KEY })`
 * without re-declaring the literal.
 */
export const ACTIVITY_CATALOG_QUERY_KEY = ["activity-catalog"] as const;
