import type { GraphValidationError, GraphWorkflowConfig } from "../types";
import { validateGraphConfig } from "./validator";

/**
 * G-067 / G-077 — a map with no `maxConcurrency` fans out UNBOUNDED. Every
 * shipped workflow sets a limit by hand, so the defect only ever bit
 * palette-created maps; the skeleton now seeds a default and this rule catches
 * the case where it is cleared.
 */
function configWithMap(maxConcurrency?: number | null): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    entryNodeId: "m",
    nodes: {
      m: {
        id: "m",
        type: "map",
        label: "Process Each Segment",
        collectionCtxKey: "segments",
        itemCtxKey: "currentSegment",
        bodyEntryNodeId: "body",
        bodyExitNodeId: "body",
        ...(maxConcurrency === undefined ? {} : { maxConcurrency }),
      },
      body: {
        id: "body",
        type: "activity",
        label: "Body",
        activityType: "azureOcr.submit",
      },
    },
    edges: [],
    ctx: { segments: { type: "array" }, currentSegment: { type: "object" } },
    metadata: {},
  } as unknown as GraphWorkflowConfig;
}

const concurrencyIssues = (cfg: GraphWorkflowConfig) =>
  (validateGraphConfig(cfg).errors ?? []).filter((e: GraphValidationError) =>
    e.path.endsWith(".maxConcurrency"),
  );

describe("map concurrency limit (G-067 / G-077)", () => {
  it("warns when a map declares no concurrency limit", () => {
    const issues = concurrencyIssues(configWithMap(undefined));
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warning");
    expect(issues[0].path).toBe("nodes.m.maxConcurrency");
    expect(issues[0].message).toContain("every item starts at once");
  });

  it("names the map by its label, not its id", () => {
    expect(concurrencyIssues(configWithMap(undefined))[0].message).toContain(
      "Process Each Segment",
    );
  });

  it("is silent once a limit is set", () => {
    expect(concurrencyIssues(configWithMap(5))).toHaveLength(0);
    expect(concurrencyIssues(configWithMap(10))).toHaveLength(0);
  });

  it("warns on an explicit null, which is still unbounded", () => {
    expect(concurrencyIssues(configWithMap(null))).toHaveLength(1);
  });

  it("never blocks Save — it is a warning, never an error", () => {
    const errs = validateGraphConfig(configWithMap(undefined)).errors ?? [];
    const blocking = errs.filter(
      (e: GraphValidationError) =>
        e.severity !== "warning" && e.path.endsWith(".maxConcurrency"),
    );
    expect(blocking).toHaveLength(0);
  });
});
