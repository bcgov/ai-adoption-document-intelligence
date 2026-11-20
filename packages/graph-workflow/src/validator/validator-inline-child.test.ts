/**
 * G-015 — an inline child graph is a full `GraphWorkflowConfig`, and the
 * validator never descended into it. Every rule the product enforces was
 * dropped one level down: a dangling `entryNodeId`, a switch whose
 * `defaultEdge` names a missing edge, a reserved ctx namespace — all of it
 * validated green and saved clean.
 *
 * These tests pin the descent and, just as importantly, the ANCHOR shape:
 * an inner error must name the parent node AND the inner node, so the top-bar
 * count, the drawer and the canvas badge all have something to point at.
 */
import type {
  ChildWorkflowNode,
  GraphValidationError,
  GraphWorkflowConfig,
  ValidateGraphConfigOptions,
} from "../index";
import { validateGraphConfig } from "../index";

const ALWAYS_REGISTERED_OPTIONS: ValidateGraphConfigOptions = {
  isRegisteredActivityType: () => true,
  validateActivityParameters: () => {},
};

function innerGraph(
  overrides: Partial<GraphWorkflowConfig> = {},
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "inner", version: "1.0.0" },
    ctx: {},
    nodes: {
      step: {
        id: "step",
        type: "activity",
        label: "Inner step",
        activityType: "data.transform",
      },
    },
    edges: [],
    entryNodeId: "step",
    ...overrides,
  };
}

function parentWithInline(inner: GraphWorkflowConfig): GraphWorkflowConfig {
  const child: ChildWorkflowNode = {
    id: "child_1",
    type: "childWorkflow",
    label: "Run the sub-workflow",
    workflowRef: { type: "inline", graph: inner },
  };
  return {
    schemaVersion: "1.0",
    metadata: { name: "outer", version: "1.0.0" },
    ctx: {},
    nodes: { child_1: child },
    edges: [],
    entryNodeId: "child_1",
  };
}

function errorPaths(errors: GraphValidationError[]): string[] {
  return errors.filter((e) => e.severity === "error").map((e) => e.path);
}

describe("validateGraphConfig — inline child graphs (G-015)", () => {
  it("does not report a valid inline child graph", () => {
    const result = validateGraphConfig(
      parentWithInline(innerGraph()),
      ALWAYS_REGISTERED_OPTIONS,
    );
    expect(
      result.errors.filter((e) => e.path.includes(".inline")),
    ).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it("reports an invalid inline child graph", () => {
    // Dangling entry node — the exact repro the register names.
    const result = validateGraphConfig(
      parentWithInline(innerGraph({ entryNodeId: "nope" })),
      ALWAYS_REGISTERED_OPTIONS,
    );
    expect(result.valid).toBe(false);
    const inlineErrors = result.errors.filter((e) =>
      e.path.startsWith("nodes.child_1.inline"),
    );
    expect(inlineErrors.length).toBeGreaterThan(0);
    expect(inlineErrors[0].message).toMatch(/inline child graph/i);
  });

  it("anchors an inline error to both the parent node and the inner node", () => {
    const inner = innerGraph({
      nodes: {
        sw: {
          id: "sw",
          type: "switch",
          label: "Branch",
          cases: [],
          defaultEdge: "ghost-edge",
        },
      },
      entryNodeId: "sw",
    });
    const result = validateGraphConfig(
      parentWithInline(inner),
      ALWAYS_REGISTERED_OPTIONS,
    );
    const paths = errorPaths(result.errors);
    // Parent id first (so the canvas badge and the drawer bucket land on the
    // node the author can actually see), inner id after the `.inline.` hop.
    expect(paths).toContain("nodes.child_1.inline.nodes.sw.defaultEdge");
  });

  it("descends more than one level", () => {
    const grandchild = innerGraph({ entryNodeId: "nope" });
    const middle = innerGraph({
      nodes: {
        nested: {
          id: "nested",
          type: "childWorkflow",
          label: "Nested",
          workflowRef: { type: "inline", graph: grandchild },
        },
      },
      entryNodeId: "nested",
    });
    const result = validateGraphConfig(
      parentWithInline(middle),
      ALWAYS_REGISTERED_OPTIONS,
    );
    expect(
      result.errors.some((e) =>
        e.path.startsWith("nodes.child_1.inline.nodes.nested.inline"),
      ),
    ).toBe(true);
  });

  it("reports a non-object inline graph rather than crashing", () => {
    const child = {
      id: "child_1",
      type: "childWorkflow",
      label: "Broken",
      workflowRef: { type: "inline", graph: null },
    } as unknown as ChildWorkflowNode;
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "outer", version: "1.0.0" },
      ctx: {},
      nodes: { child_1: child },
      edges: [],
      entryNodeId: "child_1",
    };
    const result = validateGraphConfig(config, ALWAYS_REGISTERED_OPTIONS);
    expect(result.valid).toBe(false);
    expect(errorPaths(result.errors)).toContain("nodes.child_1.inline");
  });

  it("leaves a library workflowRef alone", () => {
    const child: ChildWorkflowNode = {
      id: "child_1",
      type: "childWorkflow",
      label: "Library child",
      workflowRef: { type: "library", workflowId: "wf_1" },
    };
    const result = validateGraphConfig(
      {
        schemaVersion: "1.0",
        metadata: { name: "outer", version: "1.0.0" },
        ctx: {},
        nodes: { child_1: child },
        edges: [],
        entryNodeId: "child_1",
      },
      ALWAYS_REGISTERED_OPTIONS,
    );
    expect(
      result.errors.filter((e) => e.path.includes(".inline")),
    ).toHaveLength(0);
  });

  it("does not recurse forever on a self-referencing inline graph", () => {
    const inner = innerGraph();
    const self: ChildWorkflowNode = {
      id: "loop",
      type: "childWorkflow",
      label: "Loop",
      workflowRef: { type: "inline", graph: inner },
    };
    inner.nodes.loop = self;
    inner.entryNodeId = "loop";
    const result = validateGraphConfig(
      parentWithInline(inner),
      ALWAYS_REGISTERED_OPTIONS,
    );
    // Terminates, and says why rather than silently stopping.
    expect(
      result.errors.some((e) => /already validated|recursive/i.test(e.message)),
    ).toBe(true);
  });
});
