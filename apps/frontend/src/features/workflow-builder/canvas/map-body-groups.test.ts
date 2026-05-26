import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  isSyntheticMapBodyGroupId,
  mergeNodeGroups,
  SYNTHETIC_MAP_BODY_PREFIX,
  stripSyntheticMapBodyGroups,
  synthesizeMapBodyGroups,
} from "./map-body-groups";

function makeMapConfig(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t", version: "1.0.0" },
    ctx: {},
    nodes: {
      pre: {
        id: "pre",
        type: "activity",
        label: "pre",
        activityType: "noop",
        inputs: [],
        outputs: [],
        parameters: {},
        metadata: { position: { x: 0, y: 0 } },
      },
      mapNode: {
        id: "mapNode",
        type: "map",
        label: "Process Each",
        collectionCtxKey: "items",
        itemCtxKey: "item",
        bodyEntryNodeId: "router",
        bodyExitNodeId: "exit",
      },
      router: {
        id: "router",
        type: "activity",
        label: "router",
        activityType: "noop",
        inputs: [],
        outputs: [],
        parameters: {},
        metadata: { position: { x: 100, y: 200 } },
      },
      branchA: {
        id: "branchA",
        type: "activity",
        label: "A",
        activityType: "noop",
        inputs: [],
        outputs: [],
        parameters: {},
        metadata: { position: { x: 300, y: 200 } },
      },
      exit: {
        id: "exit",
        type: "activity",
        label: "exit",
        activityType: "noop",
        inputs: [],
        outputs: [],
        parameters: {},
        metadata: { position: { x: 500, y: 200 } },
      },
      post: {
        id: "post",
        type: "activity",
        label: "post",
        activityType: "noop",
        inputs: [],
        outputs: [],
        parameters: {},
        metadata: { position: { x: 700, y: 0 } },
      },
    },
    edges: [
      { id: "e1", source: "pre", target: "mapNode", type: "normal" },
      { id: "e2", source: "router", target: "branchA", type: "normal" },
      { id: "e3", source: "branchA", target: "exit", type: "normal" },
      { id: "e4", source: "mapNode", target: "post", type: "normal" },
    ],
    entryNodeId: "pre",
  };
}

describe("synthesizeMapBodyGroups", () => {
  it("returns an empty record when no map nodes are present", () => {
    const config = makeMapConfig();
    delete (config.nodes as Record<string, unknown>).mapNode;
    expect(synthesizeMapBodyGroups(config)).toEqual({});
  });

  it("synthesizes a group containing every body node reachable from entry to exit", () => {
    const synthesised = synthesizeMapBodyGroups(makeMapConfig());
    const keys = Object.keys(synthesised);
    expect(keys).toHaveLength(1);
    const groupId = keys[0];
    expect(groupId).toBe(`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`);
    expect(synthesised[groupId].nodeIds.sort()).toEqual(
      ["branchA", "exit", "router"].sort(),
    );
    expect(synthesised[groupId].label).toContain("Process Each");
  });

  it("skips map nodes missing bodyEntryNodeId or bodyExitNodeId", () => {
    const config = makeMapConfig();
    (config.nodes.mapNode as { bodyEntryNodeId?: string }).bodyEntryNodeId =
      undefined;
    expect(synthesizeMapBodyGroups(config)).toEqual({});
  });
});

describe("isSyntheticMapBodyGroupId", () => {
  it("returns true for ids with the synthetic prefix", () => {
    expect(isSyntheticMapBodyGroupId(`${SYNTHETIC_MAP_BODY_PREFIX}foo`)).toBe(
      true,
    );
  });
  it("returns false otherwise", () => {
    expect(isSyntheticMapBodyGroupId("group_1")).toBe(false);
  });
});

describe("stripSyntheticMapBodyGroups", () => {
  it("removes only synthetic group entries from a nodeGroups map", () => {
    const result = stripSyntheticMapBodyGroups({
      group_1: { label: "user", nodeIds: ["a", "b"] },
      [`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`]: {
        label: "syn",
        nodeIds: ["c"],
      },
    });
    expect(Object.keys(result)).toEqual(["group_1"]);
  });
});

describe("mergeNodeGroups", () => {
  it("returns user-named groups verbatim when no synthetic input is supplied", () => {
    const user = { group_1: { label: "u", nodeIds: ["a"] } };
    expect(mergeNodeGroups(user, {})).toEqual(user);
  });
  it("favours user-named groups when the same node is in both", () => {
    const user = { group_1: { label: "u", nodeIds: ["router"] } };
    const synth = {
      [`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`]: {
        label: "syn",
        nodeIds: ["router", "branchA"],
      },
    };
    const merged = mergeNodeGroups(user, synth);
    // Synthetic still present, but `router` removed from it.
    expect(merged[`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`].nodeIds).toEqual([
      "branchA",
    ]);
    expect(merged.group_1.nodeIds).toEqual(["router"]);
  });
  it("drops synthetic groups whose members are entirely consumed by user groups", () => {
    const user = {
      group_1: { label: "u", nodeIds: ["router", "branchA", "exit"] },
    };
    const synth = {
      [`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`]: {
        label: "syn",
        nodeIds: ["router", "branchA", "exit"],
      },
    };
    const merged = mergeNodeGroups(user, synth);
    expect(merged[`${SYNTHETIC_MAP_BODY_PREFIX}mapNode`]).toBeUndefined();
  });
});
