/**
 * Backend Graph Schema Validator
 *
 * Thin wrapper around the shared @ai-di/graph-workflow validateGraphConfig,
 * supplying the backend's own activity registry plus the shared catalog
 * adapter for per-activity parameter validation.
 *
 * Phase 6 US-174: adds `validateGraphConfigWithDynamicNodes`, an async
 * sibling that pre-loads the workflow's group dynamic-node lineages
 * (head versions + any version-pinned older snapshots referenced by the
 * graph) and builds a merged catalog adapter the shared validator's
 * binding-walk pass consumes. The static sync entry point continues to
 * work unchanged for call sites that don't have a group context
 * (benchmark candidates, test fixtures, etc.).
 *
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md Section 9.2 +
 * docs-md/workflow-builder/DYNAMIC_NODES_DESIGN.md §7.2.
 */

import {
  type ActivityCatalogEntry,
  type ActivityNode,
  createCatalogParameterValidator,
  type DynamicNodeSignature,
  type GraphValidationError,
  type GraphWorkflowConfig,
  type PollUntilNode,
  getActivityCatalogEntry as staticGetActivityCatalogEntry,
  type ValidateGraphConfigOptions,
  validateGraphConfig as validateGraphCfg,
} from "@ai-di/graph-workflow";
import type { DynamicNodeRepository } from "@/dynamic-nodes/dynamic-node.repository";
import { signatureToCatalogEntry } from "@/dynamic-nodes/dynamic-nodes.service";
import { isRegisteredActivityType } from "./activity-registry";

const validateActivityParameters = createCatalogParameterValidator();

/**
 * Validate a graph workflow config at save time.
 * Uses the backend activity registry for activity-type registration checks
 * and the @ai-di/graph-workflow catalog for per-activity parameter
 * validation.
 *
 * Static-only: this entry point does NOT resolve `dyn.<slug>` activity
 * types. Callers with group context (`workflowService` / library
 * snapshot creation) should use
 * `validateGraphConfigWithDynamicNodes` instead so the binding-walk
 * resolves dynamic-node ports correctly.
 *
 * @param config - The graph workflow configuration to validate.
 * @returns Validation result with errors.
 */
export function validateGraphConfig(config: GraphWorkflowConfig): {
  valid: boolean;
  errors: GraphValidationError[];
} {
  return validateGraphCfg(config, {
    isRegisteredActivityType,
    validateActivityParameters,
  });
}

/**
 * Phase 6 US-174 — async validator wrapping `validateGraphConfig` so the
 * binding-walk pass resolves `dyn.<slug>` references against the
 * calling workflow's group dynamic-node lineages.
 *
 * Pre-load strategy: walk the graph once to discover every `dyn.<slug>`
 * reference + each reference's optional `dynamicNodeVersion` pin.
 * Make ONE call to `listForGroup(groupId)` to load all non-deleted
 * lineages with their head versions, then make N targeted
 * `findVersionByNumber` calls for the version-pinned references
 * (typically 0; a workflow that pins every node still bounds N by the
 * number of distinct `(slug, version)` pairs in the graph). Correctness
 * over efficiency in 6.0; we can batch this with a single `IN` query
 * in 6.x if profiling shows it matters.
 *
 * `isRegisteredActivityType` is extended to ALSO accept any `dyn.<slug>`
 * whose slug is present in the loaded set — so the existing
 * "Activity type ... is not registered" check doesn't fire spuriously
 * on dynamic nodes. Soft-deleted lineages are deliberately excluded
 * from this set so the new
 * `"Workflow references deleted dynamic node 'dyn.<slug>'"` check in
 * the shared validator fires instead.
 */
export async function validateGraphConfigWithDynamicNodes(
  config: GraphWorkflowConfig,
  groupId: string,
  dynamicNodeRepository: DynamicNodeRepository,
): Promise<{ valid: boolean; errors: GraphValidationError[] }> {
  // -- Step 1: collect every dyn.<slug> reference + any version pins.
  // Guard for malformed configs — the shared validator surfaces the
  // structured "Config must be a non-null object" / "Graph must contain
  // at least one node" errors. We must not throw before it runs.
  const nodes =
    config && typeof config === "object" && config.nodes
      ? Object.values(config.nodes)
      : [];
  const referencedSlugs = new Set<string>();
  const pinnedVersions = new Map<string, Set<number>>();
  for (const node of nodes) {
    let activityType: string | undefined;
    let pin: number | undefined;
    if (node.type === "activity") {
      const activityNode = node as ActivityNode;
      activityType = activityNode.activityType;
      pin = activityNode.dynamicNodeVersion;
    } else if (node.type === "pollUntil") {
      const pollNode = node as PollUntilNode;
      activityType = pollNode.activityType;
      // `PollUntilNode` doesn't expose `dynamicNodeVersion` in 6.0
      // (the design limits dyn nodes to `activity` nodes). Leave pin
      // undefined.
    }
    if (activityType === undefined) continue;
    if (!activityType.startsWith("dyn.")) continue;
    const slug = activityType.slice("dyn.".length);
    referencedSlugs.add(slug);
    if (pin !== undefined) {
      const existing = pinnedVersions.get(slug);
      if (existing !== undefined) {
        existing.add(pin);
      } else {
        pinnedVersions.set(slug, new Set([pin]));
      }
    }
  }

  // -- Step 2: load non-deleted lineages with head versions (one query).
  const lineages = await dynamicNodeRepository.listForGroup(groupId);
  const headEntriesBySlug = new Map<string, ActivityCatalogEntry>();
  const lineageIdsBySlug = new Map<string, string>();
  for (const lineage of lineages) {
    lineageIdsBySlug.set(lineage.slug, lineage.id);
    if (lineage.headVersion === null) continue;
    const signature = lineage.headVersion
      .signature as unknown as DynamicNodeSignature;
    headEntriesBySlug.set(
      lineage.slug,
      signatureToCatalogEntry(signature, lineage.headVersion.versionNumber),
    );
  }

  // -- Step 3: load each pinned older version specifically (US-174 Scenario 4).
  const pinnedEntriesByKey = new Map<string, ActivityCatalogEntry>();
  for (const [slug, versionSet] of pinnedVersions.entries()) {
    const lineageId = lineageIdsBySlug.get(slug);
    if (lineageId === undefined) continue;
    for (const versionNumber of versionSet) {
      // Skip the case where the pin matches head — we already loaded
      // that signature into `headEntriesBySlug`.
      const head = headEntriesBySlug.get(slug);
      if (head !== undefined && head.dynamicNodeVersion === versionNumber) {
        continue;
      }
      const version = await dynamicNodeRepository.findVersionByNumber(
        lineageId,
        versionNumber,
      );
      if (version === null) continue;
      const signature = version.signature as unknown as DynamicNodeSignature;
      pinnedEntriesByKey.set(
        `${slug}@${versionNumber}`,
        signatureToCatalogEntry(signature, version.versionNumber),
      );
    }
  }

  // -- Step 4: build the validator's catalog adapter + activity-type registry.
  const lookupDynEntry = (
    activityType: string,
    node?: ActivityNode | PollUntilNode,
  ): ActivityCatalogEntry | undefined => {
    if (!activityType.startsWith("dyn.")) return undefined;
    const slug = activityType.slice("dyn.".length);
    // Version-pin path — only meaningful on activity nodes in 6.0.
    if (node?.type === "activity") {
      const activityNode = node as ActivityNode;
      const pin = activityNode.dynamicNodeVersion;
      if (pin !== undefined) {
        const pinned = pinnedEntriesByKey.get(`${slug}@${pin}`);
        if (pinned !== undefined) return pinned;
        // Pin not found among pre-loaded versions — fall through to
        // head so we don't double-error. The "Workflow references
        // deleted dynamic node" check covers the missing-lineage path.
      }
    }
    return headEntriesBySlug.get(slug);
  };

  const options: ValidateGraphConfigOptions = {
    isRegisteredActivityType: (type) => {
      if (isRegisteredActivityType(type)) return true;
      if (type.startsWith("dyn.")) {
        const slug = type.slice("dyn.".length);
        return headEntriesBySlug.has(slug);
      }
      return false;
    },
    validateActivityParameters,
    getActivityCatalogEntry: (activityType, node) => {
      // Phase 6 lookup path first — falls back to the static catalog
      // for non-`dyn.*` types so the shared walker continues to see
      // static activity port kinds through the same adapter.
      const dyn = lookupDynEntry(activityType, node);
      if (dyn !== undefined) return dyn;
      return staticGetActivityCatalogEntry(activityType);
    },
  };

  return validateGraphCfg(config, options);
}
