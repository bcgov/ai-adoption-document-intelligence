import type { GraphValidationError, GraphWorkflowConfig } from "../types";
import { validateGraphConfig } from "./validator";

/**
 * G-037 — the palette's control-flow skeletons ship four required fields as
 * `""`, and no validator rule referenced any of them. A map, join or
 * childWorkflow dragged in and left unconfigured therefore saved with a green
 * tick and failed at execution, while its neighbours carried badges for far
 * smaller problems.
 *
 * These fixtures are the SHAPE THE PALETTE PRODUCES, not a hand-authored edge
 * case — that is the whole point of the gap, so the tests build it the same
 * way a drag from the palette does.
 */
function body() {
  return {
    id: "body",
    type: "activity",
    label: "Body",
    activityType: "azureOcr.submit",
  };
}

function configWith(
  nodes: Record<string, unknown>,
  entryNodeId: string,
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    entryNodeId,
    nodes,
    edges: [],
    ctx: { segments: { type: "array" }, currentSegment: { type: "object" } },
    metadata: {},
  } as unknown as GraphWorkflowConfig;
}

/** A map exactly as `buildMapSkeleton` emits it — both ctx keys empty. */
function unconfiguredMap(overrides: Record<string, unknown> = {}) {
  return configWith(
    {
      m: {
        id: "m",
        type: "map",
        label: "Process Each",
        collectionCtxKey: "",
        itemCtxKey: "",
        maxConcurrency: 5,
        bodyEntryNodeId: "body",
        bodyExitNodeId: "body",
        ...overrides,
      },
      body: body(),
    },
    "m",
  );
}

const errorsAt = (cfg: GraphWorkflowConfig, suffix: string) =>
  (validateGraphConfig(cfg).errors ?? []).filter((e: GraphValidationError) =>
    e.path.endsWith(suffix),
  );

describe("G-037 — unconfigured control-flow nodes must not save clean", () => {
  describe("map", () => {
    it("rejects an empty collectionCtxKey", () => {
      const issues = errorsAt(unconfiguredMap(), ".collectionCtxKey");
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe("error");
      expect(issues[0].path).toBe("nodes.m.collectionCtxKey");
      expect(issues[0].message).toContain("no collection to loop over");
    });

    it("rejects an empty itemCtxKey", () => {
      const issues = errorsAt(unconfiguredMap(), ".itemCtxKey");
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe("error");
    });

    it("rejects whitespace as if it were empty", () => {
      const issues = errorsAt(
        unconfiguredMap({ collectionCtxKey: "   " }),
        ".collectionCtxKey",
      );
      expect(issues).toHaveLength(1);
    });

    it("blocks Save, unlike the concurrency warning", () => {
      const result = validateGraphConfig(unconfiguredMap());
      expect(result.valid).toBe(false);
    });

    it("says nothing once both keys are named", () => {
      const configured = unconfiguredMap({
        collectionCtxKey: "segments",
        itemCtxKey: "currentSegment",
      });
      expect(errorsAt(configured, ".collectionCtxKey")).toHaveLength(0);
      expect(errorsAt(configured, ".itemCtxKey")).toHaveLength(0);
    });
  });

  describe("join", () => {
    const joinConfig = (resultsCtxKey: string) =>
      configWith(
        {
          m: {
            id: "m",
            type: "map",
            label: "Map",
            collectionCtxKey: "segments",
            itemCtxKey: "currentSegment",
            maxConcurrency: 5,
            bodyEntryNodeId: "body",
            bodyExitNodeId: "body",
          },
          body: body(),
          j: {
            id: "j",
            type: "join",
            label: "Collect",
            sourceMapNodeId: "m",
            strategy: "all",
            resultsCtxKey,
          },
        },
        "m",
      );

    it("rejects an empty resultsCtxKey", () => {
      const issues = errorsAt(joinConfig(""), ".resultsCtxKey");
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe("error");
      expect(issues[0].message).toContain("nowhere to put the collected");
    });

    it("says nothing once it is named", () => {
      expect(errorsAt(joinConfig("results"), ".resultsCtxKey")).toHaveLength(0);
    });
  });

  describe("childWorkflow", () => {
    const childConfig = (workflowId: string) =>
      configWith(
        {
          c: {
            id: "c",
            type: "childWorkflow",
            label: "Sub-workflow",
            workflowRef: { type: "library", workflowId },
          },
        },
        "c",
      );

    it("rejects an empty library workflowId", () => {
      const issues = errorsAt(childConfig(""), ".workflowRef.workflowId");
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe("error");
      expect(issues[0].message).toContain("no workflow selected");
    });

    it("says nothing once one is picked", () => {
      expect(
        errorsAt(childConfig("wf-123"), ".workflowRef.workflowId"),
      ).toHaveLength(0);
    });

    it("does not fire on an inline child, which has no workflowId", () => {
      const inline = configWith(
        {
          c: {
            id: "c",
            type: "childWorkflow",
            label: "Inline",
            workflowRef: {
              type: "inline",
              graph: {
                schemaVersion: "1.0",
                entryNodeId: "b",
                nodes: { b: body() },
                edges: [],
                ctx: {},
                metadata: {},
              },
            },
          },
        },
        "c",
      );
      expect(errorsAt(inline, ".workflowRef.workflowId")).toHaveLength(0);
    });
  });
});
