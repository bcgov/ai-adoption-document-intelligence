/**
 * Tests for the pure config transforms behind the port-wiring gestures
 * (PORT_WIRING_DESIGN.md §6/§7). These back the canvas drag gesture, the
 * wire context menu, the delete path, and the settings panel's
 * "Change source" / "Revert to automatic" actions — all funneled through
 * this one module so they write bindings identically.
 */
import { describe, expect, it } from "vitest";
import type {
  ActivityNode,
  GraphNode,
  GraphWorkflowConfig,
  SwitchNode,
} from "../../../types/workflow";
import {
  disconnectDataWire,
  ensureEdgeBetween,
  pinPortBinding,
  revertPortToAutomatic,
} from "./wire-mutations";

/** Minimal activity-node fixture builder — mirrors derive-wires.test.ts's style. */
function activityNode(
  id: string,
  activityType: string,
  extra?: Partial<Omit<ActivityNode, "id" | "type" | "activityType" | "label">>,
): ActivityNode {
  return { id, type: "activity", label: id, activityType, ...extra };
}

function switchNode(id: string): SwitchNode {
  return { id, type: "switch", label: id, cases: [] };
}

const baseConfig = (): GraphWorkflowConfig => ({
  schemaVersion: "1.0",
  metadata: { name: "t" },
  entryNodeId: "producer",
  ctx: {},
  nodes: {
    producer: activityNode("producer", "azureOcr.extract"),
    consumer: activityNode("consumer", "ocr.cleanup"),
  },
  edges: [],
});

describe("pinPortBinding", () => {
  it("stamps the consumer input row, synthesises a producer outputs row, and locks the port", () => {
    const next = pinPortBinding(baseConfig(), "consumer", "ocrResult", {
      producerNodeId: "producer",
      producerPort: "ocrResult",
    });
    const ctxKey = next.nodes.producer.outputs?.find(
      (b) => b.port === "ocrResult",
    )?.ctxKey;
    expect(ctxKey).toBe("__auto.producer.ocrResult");
    expect(next.nodes.consumer.inputs).toContainEqual({
      port: "ocrResult",
      ctxKey,
    });
    expect(
      (next.nodes.consumer.metadata as { lockedInputPorts?: string[] })
        ?.lockedInputPorts,
    ).toContain("ocrResult");
  });

  it("reuses the producer's existing output ctxKey", () => {
    const config = baseConfig();
    config.nodes.producer = {
      ...config.nodes.producer,
      outputs: [{ port: "ocrResult", ctxKey: "myKey" }],
    } as GraphNode;
    const next = pinPortBinding(config, "consumer", "ocrResult", {
      producerNodeId: "producer",
      producerPort: "ocrResult",
    });
    expect(next.nodes.consumer.inputs).toContainEqual({
      port: "ocrResult",
      ctxKey: "myKey",
    });
    expect(next.nodes.producer.outputs).toHaveLength(1);
  });

  it("replaces an existing input row for the same port", () => {
    const config = baseConfig();
    config.nodes.consumer = {
      ...config.nodes.consumer,
      inputs: [{ port: "ocrResult", ctxKey: "old" }],
    } as GraphNode;
    const next = pinPortBinding(config, "consumer", "ocrResult", {
      producerNodeId: "producer",
      producerPort: "ocrResult",
    });
    const rows = (next.nodes.consumer.inputs ?? []).filter(
      (b) => b.port === "ocrResult",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ctxKey).toBe("__auto.producer.ocrResult");
  });

  it("returns the config unchanged when consumer === producer or either node is missing", () => {
    const config = baseConfig();
    expect(
      pinPortBinding(config, "consumer", "p", {
        producerNodeId: "consumer",
        producerPort: "q",
      }),
    ).toBe(config);
    expect(
      pinPortBinding(config, "ghost", "p", {
        producerNodeId: "producer",
        producerPort: "q",
      }),
    ).toBe(config);
  });
});

describe("disconnectDataWire", () => {
  it("removes the consumer's input row and adds the port to lockedInputPorts, leaving producer outputs alone", () => {
    const config = baseConfig();
    config.nodes.producer = {
      ...config.nodes.producer,
      outputs: [{ port: "ocrResult", ctxKey: "k" }],
    } as GraphNode;
    config.nodes.consumer = {
      ...config.nodes.consumer,
      inputs: [{ port: "ocrResult", ctxKey: "k" }],
    } as GraphNode;
    const next = disconnectDataWire(config, "consumer", "ocrResult");
    expect(next.nodes.consumer.inputs).toEqual([]);
    expect(
      (next.nodes.consumer.metadata as { lockedInputPorts?: string[] })
        ?.lockedInputPorts,
    ).toEqual(["ocrResult"]);
    expect(next.nodes.producer.outputs).toEqual([
      { port: "ocrResult", ctxKey: "k" },
    ]);
  });

  it("still adds the lock when the port has no binding (idempotent disconnect)", () => {
    const config = baseConfig();
    const next = disconnectDataWire(config, "consumer", "ocrResult");
    expect(next.nodes.consumer.inputs).toEqual([]);
    expect(
      (next.nodes.consumer.metadata as { lockedInputPorts?: string[] })
        ?.lockedInputPorts,
    ).toEqual(["ocrResult"]);
  });
});

describe("revertPortToAutomatic", () => {
  it("removes the port from lockedInputPorts and drops the metadata field when the list empties", () => {
    const config = baseConfig();
    config.nodes.consumer = {
      ...config.nodes.consumer,
      metadata: { lockedInputPorts: ["ocrResult"] },
    } as GraphNode;
    const next = revertPortToAutomatic(config, "consumer", "ocrResult");
    expect(next.nodes.consumer.metadata).not.toHaveProperty("lockedInputPorts");
  });

  it("leaves other locks in place", () => {
    const config = baseConfig();
    config.nodes.consumer = {
      ...config.nodes.consumer,
      metadata: { lockedInputPorts: ["a", "b"] },
    } as GraphNode;
    const next = revertPortToAutomatic(config, "consumer", "a");
    expect(
      (next.nodes.consumer.metadata as { lockedInputPorts?: string[] })
        ?.lockedInputPorts,
    ).toEqual(["b"]);
  });
});

describe("ensureEdgeBetween", () => {
  it("adds a normal edge when no edge connects the pair", () => {
    const next = ensureEdgeBetween(baseConfig(), "producer", "consumer");
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({
      source: "producer",
      target: "consumer",
      type: "normal",
    });
  });

  it("adds a conditional edge when the source is a switch node", () => {
    const config = baseConfig();
    config.nodes.producer = switchNode("producer");
    const next = ensureEdgeBetween(config, "producer", "consumer");
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({ type: "conditional" });
  });

  it("returns the config unchanged when an edge already connects the pair in either direction", () => {
    const config = baseConfig();
    config.edges = [
      { id: "e1", source: "consumer", target: "producer", type: "normal" },
    ];
    expect(ensureEdgeBetween(config, "producer", "consumer")).toBe(config);
  });
});
