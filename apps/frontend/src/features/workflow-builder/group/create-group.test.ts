/**
 * Tests for the pure `createGroupFromSelection` helper (US-041).
 *
 * Each test maps to an acceptance scenario:
 *   - Scenario 3: happy path — new group entry with the right shape.
 *   - Scenario 4: single-membership rule — a node can only belong to one
 *     group; old groups that become empty are dropped.
 *   - Scenario 5: auto-numbering label gap-fill.
 *   - Plus input-validation cases (< 2 ids; ids missing from
 *     `config.nodes`).
 */

import { describe, expect, it } from "vitest";
import type {
  ActivityNode,
  GraphWorkflowConfig,
  NodeGroup,
} from "../../../types/workflow";
import {
  createGroupFromSelection,
  filterOutSyntheticBodyMembers,
} from "./create-group";

function makeActivity(id: string): ActivityNode {
  return {
    id,
    type: "activity",
    label: id,
    activityType: "data.transform",
    parameters: {},
  };
}

function makeConfig(
  nodeIds: string[],
  nodeGroups?: Record<string, NodeGroup>,
): GraphWorkflowConfig {
  const nodes: GraphWorkflowConfig["nodes"] = {};
  for (const id of nodeIds) nodes[id] = makeActivity(id);
  return {
    schemaVersion: "1.0",
    metadata: { name: "fixture", version: "1.0.0" },
    nodes,
    edges: [],
    entryNodeId: nodeIds[0] ?? "",
    ctx: {},
    nodeGroups,
  };
}

describe("createGroupFromSelection — Scenario 3 (happy path)", () => {
  it("adds a new nodeGroups entry with the selected ids, default label, and empty exposedParams", () => {
    const config = makeConfig(["n1", "n2"]);
    const { config: nextConfig, newGroupId } = createGroupFromSelection(
      config,
      ["n1", "n2"],
    );
    expect(newGroupId).toBe("group_1");
    expect(nextConfig.nodeGroups).toBeDefined();
    expect(nextConfig.nodeGroups?.[newGroupId]).toEqual({
      label: "Group 1",
      nodeIds: ["n1", "n2"],
      exposedParams: [],
    });
    // Pure helper — the original config must not be mutated.
    expect(config.nodeGroups).toBeUndefined();
  });

  it("preserves the order of incoming ids in nodeIds", () => {
    const config = makeConfig(["n1", "n2", "n3"]);
    const { config: nextConfig, newGroupId } = createGroupFromSelection(
      config,
      ["n3", "n1", "n2"],
    );
    expect(nextConfig.nodeGroups?.[newGroupId]?.nodeIds).toEqual([
      "n3",
      "n1",
      "n2",
    ]);
  });
});

describe("createGroupFromSelection — Scenario 5 (auto-numbering)", () => {
  it("fills the lowest label/id gap (existing Group 1 + Group 3 -> new Group 2)", () => {
    const config = makeConfig(["n1", "n2", "n3", "n4"], {
      group_1: { label: "Group 1", nodeIds: ["n3"] },
      group_3: { label: "Group 3", nodeIds: ["n4"] },
    });
    const { config: nextConfig, newGroupId } = createGroupFromSelection(
      config,
      ["n1", "n2"],
    );
    expect(newGroupId).toBe("group_2");
    expect(nextConfig.nodeGroups?.[newGroupId]?.label).toBe("Group 2");
  });

  it("defaults to Group 1 / group_1 when no groups exist yet", () => {
    const config = makeConfig(["n1", "n2"]);
    const { config: nextConfig, newGroupId } = createGroupFromSelection(
      config,
      ["n1", "n2"],
    );
    expect(newGroupId).toBe("group_1");
    expect(nextConfig.nodeGroups?.[newGroupId]?.label).toBe("Group 1");
  });

  it("picks the next-up number when the existing labels are contiguous (1, 2 -> 3)", () => {
    const config = makeConfig(["n1", "n2", "n3", "n4"], {
      group_1: { label: "Group 1", nodeIds: ["n3"] },
      group_2: { label: "Group 2", nodeIds: ["n4"] },
    });
    const { newGroupId, config: nextConfig } = createGroupFromSelection(
      config,
      ["n1", "n2"],
    );
    expect(newGroupId).toBe("group_3");
    expect(nextConfig.nodeGroups?.[newGroupId]?.label).toBe("Group 3");
  });

  it("ignores custom-labelled groups when scanning for the next 'Group N' label", () => {
    const config = makeConfig(["n1", "n2", "n3", "n4"], {
      // Custom labels don't reserve numbers.
      group_custom: { label: "My fancy cluster", nodeIds: ["n3"] },
      group_1: { label: "Group 1", nodeIds: ["n4"] },
    });
    const { config: nextConfig, newGroupId } = createGroupFromSelection(
      config,
      ["n1", "n2"],
    );
    expect(nextConfig.nodeGroups?.[newGroupId]?.label).toBe("Group 2");
  });

  it("honours the idPrefix option when computing the new id", () => {
    const config = makeConfig(["n1", "n2"], {
      grp_1: { label: "Group 1", nodeIds: ["n1"] },
    });
    const { newGroupId } = createGroupFromSelection(config, ["n1", "n2"], {
      idPrefix: "grp",
    });
    expect(newGroupId).toBe("grp_2");
  });
});

describe("createGroupFromSelection — Scenario 4 (single-membership rule)", () => {
  it("removes the moved node from the old group", () => {
    const config = makeConfig(["n1", "n2", "n3"], {
      group_1: { label: "Group 1", nodeIds: ["n1", "n3"] },
    });
    const { config: nextConfig, newGroupId } = createGroupFromSelection(
      config,
      ["n1", "n2"],
    );
    // Old group still exists because it still has n3 in it.
    expect(nextConfig.nodeGroups?.group_1).toBeDefined();
    expect(nextConfig.nodeGroups?.group_1?.nodeIds).toEqual(["n3"]);
    // n1 is in the new group.
    expect(nextConfig.nodeGroups?.[newGroupId]?.nodeIds).toContain("n1");
  });

  it("drops the old group entirely when its nodeIds becomes empty", () => {
    const config = makeConfig(["n1", "n2"], {
      group_1: { label: "Group 1", nodeIds: ["n1"] },
    });
    const { config: nextConfig, newGroupId } = createGroupFromSelection(
      config,
      ["n1", "n2"],
    );
    // group_1 had only n1, which moved to the new group → group_1
    // disappears.
    expect(nextConfig.nodeGroups?.group_1).toBeUndefined();
    expect(nextConfig.nodeGroups?.[newGroupId]).toBeDefined();
    expect(nextConfig.nodeGroups?.[newGroupId]?.nodeIds).toEqual(["n1", "n2"]);
  });

  it("drops multiple emptied groups in one pass", () => {
    const config = makeConfig(["n1", "n2", "n3"], {
      group_1: { label: "Group 1", nodeIds: ["n1"] },
      group_2: { label: "Group 2", nodeIds: ["n2"] },
      group_3: { label: "Group 3", nodeIds: ["n3"] },
    });
    const { config: nextConfig, newGroupId } = createGroupFromSelection(
      config,
      ["n1", "n2"],
    );
    expect(nextConfig.nodeGroups?.group_1).toBeUndefined();
    expect(nextConfig.nodeGroups?.group_2).toBeUndefined();
    // group_3 untouched.
    expect(nextConfig.nodeGroups?.group_3).toBeDefined();
    expect(nextConfig.nodeGroups?.group_3?.nodeIds).toEqual(["n3"]);
    expect(nextConfig.nodeGroups?.[newGroupId]?.nodeIds).toEqual(["n1", "n2"]);
  });

  it("collapses to nodeGroups: undefined when every group is emptied AND no other groups exist", () => {
    // When the only group that existed empties out and no new groups are
    // kept, the nodeGroups map should be absent or empty. We pick `{}`
    // here — the helper documents the choice.
    const config = makeConfig(["n1", "n2"], {
      group_1: { label: "Group 1", nodeIds: ["n1"] },
    });
    const { config: nextConfig, newGroupId } = createGroupFromSelection(
      config,
      ["n1", "n2"],
    );
    // The new group is created → nodeGroups is not empty.
    expect(nextConfig.nodeGroups?.[newGroupId]).toBeDefined();
    // The emptied old group is removed.
    expect(Object.keys(nextConfig.nodeGroups ?? {})).toEqual([newGroupId]);
  });
});

describe("createGroupFromSelection — input validation", () => {
  it("throws when fewer than 2 node ids are supplied", () => {
    const config = makeConfig(["n1", "n2"]);
    expect(() => createGroupFromSelection(config, [])).toThrowError(
      /at least 2/i,
    );
    expect(() => createGroupFromSelection(config, ["n1"])).toThrowError(
      /at least 2/i,
    );
  });

  it("throws when any supplied id is missing from config.nodes", () => {
    const config = makeConfig(["n1", "n2"]);
    expect(() =>
      createGroupFromSelection(config, ["n1", "n_missing"]),
    ).toThrowError(/n_missing/);
  });

  it("does not mutate the original config when validation fails", () => {
    const config = makeConfig(["n1", "n2"], {
      group_1: { label: "Group 1", nodeIds: ["n1"] },
    });
    expect(() =>
      createGroupFromSelection(config, ["n1", "n_missing"]),
    ).toThrow();
    expect(config.nodeGroups?.group_1?.nodeIds).toEqual(["n1"]);
  });
});

describe("filterOutSyntheticBodyMembers", () => {
  it("returns the selection unchanged when no map bodies are present", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t", version: "1.0.0" },
      ctx: {},
      nodes: {
        a: {
          id: "a",
          type: "activity",
          label: "a",
          activityType: "noop",
          inputs: [],
          outputs: [],
          parameters: {},
        },
        b: {
          id: "b",
          type: "activity",
          label: "b",
          activityType: "noop",
          inputs: [],
          outputs: [],
          parameters: {},
        },
      },
      edges: [],
      entryNodeId: "a",
    };
    expect(filterOutSyntheticBodyMembers(config, ["a", "b"])).toEqual([
      "a",
      "b",
    ]);
  });

  it("drops node ids that belong to a synthetic map-body group", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t", version: "1.0.0" },
      ctx: {},
      nodes: {
        outer: {
          id: "outer",
          type: "activity",
          label: "outer",
          activityType: "noop",
          inputs: [],
          outputs: [],
          parameters: {},
        },
        mapNode: {
          id: "mapNode",
          type: "map",
          label: "m",
          collectionCtxKey: "x",
          itemCtxKey: "y",
          bodyEntryNodeId: "bodyA",
          bodyExitNodeId: "bodyA",
        },
        bodyA: {
          id: "bodyA",
          type: "activity",
          label: "bodyA",
          activityType: "noop",
          inputs: [],
          outputs: [],
          parameters: {},
        },
      },
      edges: [],
      entryNodeId: "outer",
    };
    expect(
      filterOutSyntheticBodyMembers(config, ["outer", "bodyA", "mapNode"]),
    ).toEqual(["outer", "mapNode"]);
  });
});
