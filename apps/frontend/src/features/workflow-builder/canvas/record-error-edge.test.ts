/**
 * Tests for `recordErrorEdge` (G-001, second half).
 *
 * Drawing from the bottom `error` handle used to stamp `type: "error"` on the
 * edge and stop there, leaving the node's `errorPolicy.fallbackEdgeId` unset
 * and the validator reporting an error nothing in the UI could clear.
 */

import { describe, expect, it } from "vitest";
import type {
  ActivityNode,
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import { recordErrorEdge } from "./record-error-edge";

function makeConfig(
  nodes: GraphNode[],
  edges: GraphEdge[] = [],
): GraphWorkflowConfig {
  const record: Record<string, GraphNode> = {};
  for (const n of nodes) record[n.id] = n;
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodes[0]?.id ?? "",
    nodes: record,
    edges,
    ctx: {},
  };
}

function activity(
  id: string,
  overrides: Partial<ActivityNode> = {},
): ActivityNode {
  return {
    id,
    type: "activity",
    label: id,
    activityType: "file.prepare",
    ...overrides,
  };
}

const errorEdge: GraphEdge = {
  id: "e-err",
  source: "a1",
  target: "a2",
  type: "error",
};

describe("recordErrorEdge", () => {
  it("records the new error edge as the node's fallback", () => {
    const config = makeConfig(
      [
        activity("a1", {
          errorPolicy: { onError: "fallback", retryable: true },
        }),
        activity("a2"),
      ],
      [errorEdge],
    );
    const next = recordErrorEdge(config, errorEdge);
    expect(next.nodes.a1.errorPolicy).toEqual({
      onError: "fallback",
      retryable: true,
      fallbackEdgeId: "e-err",
    });
  });

  it("leaves an already-chosen fallback edge alone", () => {
    const config = makeConfig(
      [
        activity("a1", {
          errorPolicy: {
            onError: "fallback",
            retryable: true,
            fallbackEdgeId: "e-first",
          },
        }),
        activity("a2"),
      ],
      [errorEdge],
    );
    expect(recordErrorEdge(config, errorEdge)).toBe(config);
  });

  it("ignores non-error edges", () => {
    const config = makeConfig(
      [
        activity("a1", {
          errorPolicy: { onError: "fallback", retryable: true },
        }),
        activity("a2"),
      ],
      [],
    );
    const normal: GraphEdge = {
      id: "e1",
      source: "a1",
      target: "a2",
      type: "normal",
    };
    expect(recordErrorEdge(config, normal)).toBe(config);
  });

  it("does not invent a policy for a node that has none", () => {
    // An `error` edge can exist on a node with no policy (hand-authored /
    // API / agent configs). Rewriting the node's policy from a drag would
    // change how it runs, so leave it for the settings form.
    const config = makeConfig([activity("a1"), activity("a2")], []);
    expect(recordErrorEdge(config, errorEdge)).toBe(config);
  });

  it("does not touch a node whose policy is not 'fallback'", () => {
    const config = makeConfig(
      [
        activity("a1", { errorPolicy: { onError: "skip", retryable: true } }),
        activity("a2"),
      ],
      [],
    );
    expect(recordErrorEdge(config, errorEdge)).toBe(config);
  });

  it("is a no-op when the source node is missing", () => {
    const config = makeConfig([activity("a2")], []);
    expect(recordErrorEdge(config, errorEdge)).toBe(config);
  });
});
