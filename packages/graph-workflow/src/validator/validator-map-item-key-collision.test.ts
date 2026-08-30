import type { GraphValidationError, GraphWorkflowConfig } from "../types";
import { validateGraphConfig } from "./validator";

/**
 * D24 — the palette now seeds a new map's `itemCtxKey` with "currentSegment",
 * so a second dropped loop starts life sharing the first one's item variable.
 * That is legal (each iteration gets its own branch ctx) but ambiguous for
 * anything that reads the key, and destructive when one loop is nested inside
 * the other — so it must be VISIBLE and must never block Save.
 */
function mapNode(
  id: string,
  label: string,
  itemCtxKey: string,
  bodyId: string,
) {
  return {
    id,
    type: "map",
    label,
    collectionCtxKey: "segments",
    itemCtxKey,
    maxConcurrency: 5,
    bodyEntryNodeId: bodyId,
    bodyExitNodeId: bodyId,
  };
}

function bodyNode(id: string) {
  return {
    id,
    type: "activity",
    label: `Body ${id}`,
    activityType: "azureOcr.submit",
  };
}

function configWithMaps(
  maps: Array<{ id: string; label: string; itemCtxKey: string }>,
): GraphWorkflowConfig {
  const nodes: Record<string, unknown> = {};
  for (const m of maps) {
    const bodyId = `${m.id}_body`;
    nodes[m.id] = mapNode(m.id, m.label, m.itemCtxKey, bodyId);
    nodes[bodyId] = bodyNode(bodyId);
  }
  return {
    schemaVersion: "1.0",
    entryNodeId: maps[0]?.id ?? "",
    nodes,
    edges: [],
    ctx: { segments: { type: "array" } },
    metadata: {},
  } as unknown as GraphWorkflowConfig;
}

const collisionIssues = (cfg: GraphWorkflowConfig) =>
  (validateGraphConfig(cfg).errors ?? []).filter((e: GraphValidationError) =>
    e.message.includes("reuses the item variable"),
  );

describe("map item ctx key collisions (D24)", () => {
  it("is silent when two maps use different item variables", () => {
    const issues = collisionIssues(
      configWithMaps([
        { id: "m1", label: "Loop A", itemCtxKey: "currentSegment" },
        { id: "m2", label: "Loop B", itemCtxKey: "currentPage" },
      ]),
    );
    expect(issues).toHaveLength(0);
  });

  it("is silent for a single map — the default is not itself a problem", () => {
    const issues = collisionIssues(
      configWithMaps([
        { id: "m1", label: "Loop A", itemCtxKey: "currentSegment" },
      ]),
    );
    expect(issues).toHaveLength(0);
  });

  it("warns once when a second map reuses the key", () => {
    const issues = collisionIssues(
      configWithMaps([
        { id: "m1", label: "Loop A", itemCtxKey: "currentSegment" },
        { id: "m2", label: "Loop B", itemCtxKey: "currentSegment" },
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
  });

  it("anchors the warning on the SECOND map, leaving the first clean", () => {
    const issues = collisionIssues(
      configWithMaps([
        { id: "m1", label: "Loop A", itemCtxKey: "currentSegment" },
        { id: "m2", label: "Loop B", itemCtxKey: "currentSegment" },
      ]),
    );
    expect(issues[0].path).toBe("nodes.m2.itemCtxKey");
  });

  it("names both loops by label, and says what happens and what to do", () => {
    const [issue] = collisionIssues(
      configWithMaps([
        { id: "m1", label: "Loop A", itemCtxKey: "currentSegment" },
        { id: "m2", label: "Loop B", itemCtxKey: "currentSegment" },
      ]),
    );
    // The offender, the incumbent, and the key itself.
    expect(issue.message).toContain('"Loop B"');
    expect(issue.message).toContain('map node "Loop A"');
    expect(issue.message).toContain("currentSegment");
    // What will happen …
    expect(issue.message).toContain("bind to the wrong loop");
    expect(issue.message).toContain("inner item replaces the outer one");
    // … and what to do about it.
    expect(issue.message).toContain("Give this loop its own item variable");
  });

  it("does not name the incumbent when both loops carry the same label", () => {
    // Two palette-dropped maps are BOTH called "Run for each item", so the
    // obvious phrasing reads `"Run for each item" reuses … which "Run for each
    // item" already writes` and identifies nothing.
    const [issue] = collisionIssues(
      configWithMaps([
        { id: "m1", label: "Run for each item", itemCtxKey: "currentSegment" },
        { id: "m2", label: "Run for each item", itemCtxKey: "currentSegment" },
      ]),
    );
    expect(issue.message).toContain("another loop on this canvas");
    expect(issue.message).not.toContain('which map node "Run for each item"');
  });

  it("falls back to the node id when a map has no label", () => {
    const [issue] = collisionIssues(
      configWithMaps([
        { id: "m1", label: "", itemCtxKey: "currentSegment" },
        { id: "m2", label: "", itemCtxKey: "currentSegment" },
      ]),
    );
    expect(issue.message).toContain('"m2"');
    expect(issue.message).toContain('map node "m1"');
  });

  it("warns on every extra map, not just the second", () => {
    const issues = collisionIssues(
      configWithMaps([
        { id: "m1", label: "Loop A", itemCtxKey: "currentSegment" },
        { id: "m2", label: "Loop B", itemCtxKey: "currentSegment" },
        { id: "m3", label: "Loop C", itemCtxKey: "currentSegment" },
      ]),
    );
    expect(issues.map((i) => i.path)).toEqual([
      "nodes.m2.itemCtxKey",
      "nodes.m3.itemCtxKey",
    ]);
  });

  it("treats keys differing only by surrounding whitespace as the same key", () => {
    const issues = collisionIssues(
      configWithMaps([
        { id: "m1", label: "Loop A", itemCtxKey: "currentSegment" },
        { id: "m2", label: "Loop B", itemCtxKey: "  currentSegment  " },
      ]),
    );
    expect(issues).toHaveLength(1);
  });

  it("does not report two EMPTY keys as a collision — that is already an error", () => {
    const cfg = configWithMaps([
      { id: "m1", label: "Loop A", itemCtxKey: "" },
      { id: "m2", label: "Loop B", itemCtxKey: "" },
    ]);
    expect(collisionIssues(cfg)).toHaveLength(0);
    // The pre-existing required-field error is untouched.
    const emptyKeyErrors = (validateGraphConfig(cfg).errors ?? []).filter(
      (e: GraphValidationError) => e.path.endsWith(".itemCtxKey"),
    );
    expect(emptyKeyErrors).toHaveLength(2);
    expect(emptyKeyErrors.every((e) => e.severity === "error")).toBe(true);
  });

  it("never blocks Save — a collision on its own keeps the config valid", () => {
    const cfg = configWithMaps([
      { id: "m1", label: "Loop A", itemCtxKey: "currentSegment" },
      { id: "m2", label: "Loop B", itemCtxKey: "currentSegment" },
    ]);
    const blocking = (validateGraphConfig(cfg).errors ?? []).filter(
      (e: GraphValidationError) =>
        e.severity === "error" &&
        e.message.includes("reuses the item variable"),
    );
    expect(blocking).toHaveLength(0);
  });
});
