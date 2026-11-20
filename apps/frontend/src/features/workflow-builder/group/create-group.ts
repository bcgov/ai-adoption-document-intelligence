/**
 * Pure helper that produces a new `GraphWorkflowConfig` with the supplied
 * node ids grouped together under a fresh `nodeGroups[<id>]` entry
 * (US-041). Side-effect-free — never mutates the input config.
 *
 * Naming policy (Scenario 5):
 *   - Auto-numbered label fills the smallest positive-integer gap among
 *     existing groups whose label matches /^Group (\d+)$/.
 *   - Auto-numbered id is `<idPrefix>_<n>` (default prefix: "group") where
 *     n is the smallest positive integer not already used as
 *     `<idPrefix>_<n>` in `config.nodeGroups`.
 *   - Label-gap and id-gap are computed independently. They usually
 *     coincide because the canvas creates both via this helper, but the
 *     id allocator stays robust to manual edits in the JSON view.
 *
 * Single-membership rule (Scenario 4):
 *   - Any of the incoming `nodeIds` already present in another group's
 *     `nodeIds` are removed from that group.
 *   - Any old group whose `nodeIds` is left empty is removed from
 *     `config.nodeGroups` entirely.
 *
 * Validation:
 *   - At least two ids must be supplied.
 *   - Every id must exist in `config.nodes`.
 *   - Both checks throw a typed `Error` with a descriptive message; the
 *     caller (the top-bar button) keeps the helper guarded via a
 *     `disabled` state but the helper enforces invariants on its own
 *     boundary too.
 */

import type { GraphWorkflowConfig, NodeGroup } from "../../../types/workflow";
import { synthesizeMapBodyGroups } from "../canvas/map-body-groups";

export interface CreateGroupOptions {
  /**
   * Prefix used for the auto-generated group id (default: "group"). The
   * helper picks `<idPrefix>_<n>` where n is the smallest positive
   * integer not already present in `config.nodeGroups`.
   */
  idPrefix?: string;
}

export interface CreateGroupResult {
  config: GraphWorkflowConfig;
  newGroupId: string;
}

const DEFAULT_ID_PREFIX = "group";

function smallestMissingPositiveInteger(used: Set<number>): number {
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

function nextGroupLabel(nodeGroups: Record<string, NodeGroup>): string {
  const used = new Set<number>();
  for (const group of Object.values(nodeGroups)) {
    const match = /^Group (\d+)$/.exec(group.label);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n > 0) used.add(n);
    }
  }
  return `Group ${smallestMissingPositiveInteger(used)}`;
}

function nextGroupId(
  nodeGroups: Record<string, NodeGroup>,
  idPrefix: string,
): string {
  const used = new Set<number>();
  const re = new RegExp(`^${escapeRegex(idPrefix)}_(\\d+)$`);
  for (const key of Object.keys(nodeGroups)) {
    const match = re.exec(key);
    if (match) {
      const n = Number.parseInt(match[1], 10);
      if (Number.isFinite(n) && n > 0) used.add(n);
    }
  }
  return `${idPrefix}_${smallestMissingPositiveInteger(used)}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createGroupFromSelection(
  config: GraphWorkflowConfig,
  nodeIds: string[],
  options: CreateGroupOptions = {},
): CreateGroupResult {
  if (nodeIds.length < 2) {
    throw new Error(
      `createGroupFromSelection: requires at least 2 node ids (got ${nodeIds.length}).`,
    );
  }
  const missing = nodeIds.filter((id) => !config.nodes[id]);
  if (missing.length > 0) {
    throw new Error(
      `createGroupFromSelection: node id(s) not found in config.nodes: ${missing.join(
        ", ",
      )}.`,
    );
  }
  const idPrefix = options.idPrefix ?? DEFAULT_ID_PREFIX;
  const incomingIds = new Set(nodeIds);

  // Phase 1: strip the incoming ids from every other group; drop empty
  // groups. Build a fresh map so we never mutate the input.
  const updatedGroups: Record<string, NodeGroup> = {};
  for (const [groupId, group] of Object.entries(config.nodeGroups ?? {})) {
    const filteredNodeIds = group.nodeIds.filter((id) => !incomingIds.has(id));
    if (filteredNodeIds.length === 0) {
      // Old group emptied → drop it entirely.
      continue;
    }
    if (filteredNodeIds.length === group.nodeIds.length) {
      // No change for this group — keep the original reference.
      updatedGroups[groupId] = group;
      continue;
    }
    updatedGroups[groupId] = {
      ...group,
      nodeIds: filteredNodeIds,
    };
  }

  // Phase 2: allocate id + label off the ORIGINAL groups so we don't
  // reuse a slot that just freed up in this same pass. Reusing an
  // emptied id would make change-tracking ambiguous for the host
  // (the user would see "group_1 still here" when really the original
  // group_1 was deleted and a new one took its slot).
  const originalGroups = config.nodeGroups ?? {};
  const newGroupId = nextGroupId(originalGroups, idPrefix);
  const newGroupLabel = nextGroupLabel(originalGroups);

  const newGroup: NodeGroup = {
    label: newGroupLabel,
    nodeIds: [...nodeIds],
    exposedParams: [],
  };

  return {
    config: {
      ...config,
      nodeGroups: {
        ...updatedGroups,
        [newGroupId]: newGroup,
      },
    },
    newGroupId,
  };
}

/**
 * Returns a subset of `selectedNodeIds` excluding any node that belongs to a
 * synthetic map-body group. Used by the "Group selected" top-bar action so
 * the user can't merge body nodes into a manual group — those are managed
 * automatically by the map node.
 */
export function filterOutSyntheticBodyMembers(
  config: GraphWorkflowConfig,
  selectedNodeIds: string[],
): string[] {
  const synthetic = synthesizeMapBodyGroups(config);
  const blocked = new Set<string>();
  for (const group of Object.values(synthetic)) {
    for (const id of group.nodeIds) blocked.add(id);
  }
  return selectedNodeIds.filter((id) => !blocked.has(id));
}
