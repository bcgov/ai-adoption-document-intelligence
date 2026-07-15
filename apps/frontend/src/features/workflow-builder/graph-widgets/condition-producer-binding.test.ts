import { describe, expect, it } from "vitest";
import type {
  ActivityNode,
  GraphNode,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import {
  ensureProducerOutputBinding,
  producerCtxKey,
  resolveCtxKeyToProducer,
} from "./condition-producer-binding";

function makeConfig(nodes: GraphNode[]): GraphWorkflowConfig {
  const rec: Record<string, GraphNode> = {};
  for (const n of nodes) rec[n.id] = n;
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodes[0]?.id ?? "",
    nodes: rec,
    edges: [],
    ctx: {},
  };
}

// Uses the real catalog: file.prepare emits port "preparedData".
const prepare = (
  id: string,
  label: string,
  outputs: { port: string; ctxKey: string }[] = [],
): ActivityNode => ({
  id,
  type: "activity",
  label,
  activityType: "file.prepare",
  outputs,
});

describe("producerCtxKey", () => {
  it("reuses an existing output binding's ctx key", () => {
    const config = makeConfig([
      prepare("A", "Prep", [{ port: "preparedData", ctxKey: "myDoc" }]),
    ]);
    expect(producerCtxKey(config, "A", "preparedData")).toBe("myDoc");
  });

  it("synthesises the __auto key when the port is not yet bound", () => {
    const config = makeConfig([prepare("A", "Prep")]);
    expect(producerCtxKey(config, "A", "preparedData")).toBe(
      "__auto.A.preparedData",
    );
  });
});

describe("ensureProducerOutputBinding", () => {
  it("adds the missing output binding with the synthesised key", () => {
    const config = makeConfig([prepare("A", "Prep")]);
    const next = ensureProducerOutputBinding(config, "A", "preparedData");
    expect(next.nodes.A.outputs).toEqual([
      { port: "preparedData", ctxKey: "__auto.A.preparedData" },
    ]);
  });

  it("is idempotent — returns the SAME reference when already bound", () => {
    const config = makeConfig([
      prepare("A", "Prep", [{ port: "preparedData", ctxKey: "myDoc" }]),
    ]);
    expect(ensureProducerOutputBinding(config, "A", "preparedData")).toBe(
      config,
    );
  });

  it("returns the same reference when the producer node is missing", () => {
    const config = makeConfig([prepare("A", "Prep")]);
    expect(ensureProducerOutputBinding(config, "ghost", "preparedData")).toBe(
      config,
    );
  });
});

describe("resolveCtxKeyToProducer", () => {
  it("resolves an explicit output binding to node + port labels", () => {
    const config = makeConfig([
      prepare("A", "Prepare file", [{ port: "preparedData", ctxKey: "myDoc" }]),
    ]);
    expect(resolveCtxKeyToProducer(config, "myDoc")).toEqual({
      producerNodeId: "A",
      nodeLabel: "Prepare file",
      port: "preparedData",
      portLabel: "Prepared file data",
    });
  });

  it("resolves a synthesised __auto key with no explicit binding", () => {
    const config = makeConfig([prepare("A", "Prepare file")]);
    expect(resolveCtxKeyToProducer(config, "__auto.A.preparedData")).toEqual({
      producerNodeId: "A",
      nodeLabel: "Prepare file",
      port: "preparedData",
      portLabel: "Prepared file data",
    });
  });

  it("returns null when nothing produces the key", () => {
    const config = makeConfig([prepare("A", "Prep")]);
    expect(resolveCtxKeyToProducer(config, "handTyped")).toBeNull();
    expect(resolveCtxKeyToProducer(config, "")).toBeNull();
  });
});
