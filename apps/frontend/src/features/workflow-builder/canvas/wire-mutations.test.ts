/**
 * Tests for the pure config transforms behind the port-wiring gestures
 * (PORT_WIRING_DESIGN.md §6/§7). These back the canvas drag gesture, the
 * wire context menu, the delete path, and the settings panel's
 * "Change source" / "Revert to automatic" actions — all funneled through
 * this one module so they write bindings identically.
 */
import { resolveBindings, resolveInputPort } from "@ai-di/graph-workflow";
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

describe("delete-wire pipeline (§6.3 regression for bug 6b)", () => {
  // Real auto-wire chain: file.prepare (`preparedData`: Document) →
  // azureOcr.submit (`fileData`: Document). Mirrors the "← Prepare · Auto"
  // demo row. Deleting the data wire must land the consumer port in
  // `locked-unbound` ("Disconnected by you"), NOT `locked` ("Pinned").
  const autoWiredChain = (): GraphWorkflowConfig => ({
    schemaVersion: "1.0",
    metadata: { name: "t" },
    entryNodeId: "A",
    ctx: {},
    nodes: {
      A: activityNode("A", "file.prepare"),
      B: activityNode("B", "azureOcr.submit"),
    },
    edges: [{ id: "e0", source: "A", target: "B", type: "normal" }],
  });

  it("disconnectDataWire + resolveBindings leaves inputs:[] and resolves to locked-unbound", () => {
    const resolved = resolveBindings(autoWiredChain());
    // Precondition: the port really auto-bound before the delete.
    expect(resolved.nodes.B.inputs).toEqual([
      { port: "fileData", ctxKey: "__auto.A.preparedData" },
    ]);

    const disconnected = disconnectDataWire(resolved, "B", "fileData");
    // resolveBindings runs on every config the canvas dispatches — it must
    // NOT re-inject a binding (ctxKey-less or otherwise) for the locked port.
    const rebound = resolveBindings(disconnected);

    expect(rebound.nodes.B.inputs).toEqual([]);
    expect(
      (rebound.nodes.B.metadata as { lockedInputPorts?: string[] })
        ?.lockedInputPorts,
    ).toEqual(["fileData"]);
    expect(
      resolveInputPort(rebound, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({ status: "locked-unbound" });
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

  it("returns the config unchanged for a self-loop", () => {
    const config = baseConfig();
    expect(ensureEdgeBetween(config, "producer", "producer")).toBe(config);
  });

  it("returns the config unchanged when the pair is linked only by an error edge — no normal edge is added", () => {
    const config = baseConfig();
    config.edges = [
      { id: "e1", source: "producer", target: "consumer", type: "error" },
    ];
    expect(ensureEdgeBetween(config, "producer", "consumer")).toBe(config);
  });

  it("returns the config unchanged when a forward edge already connects the pair", () => {
    const config = baseConfig();
    config.edges = [
      { id: "e1", source: "producer", target: "consumer", type: "normal" },
    ];
    expect(ensureEdgeBetween(config, "producer", "consumer")).toBe(config);
  });
});

/** Recursively `Object.freeze`s an object graph so any mutation throws in strict mode. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

describe("input non-mutation", () => {
  it("does not mutate a frozen config when pinning or disconnecting a binding", () => {
    // ES modules are strict-mode by default, so mutating a frozen object
    // throws a TypeError here rather than silently no-op'ing.
    const config = baseConfig();
    config.nodes.producer = {
      ...config.nodes.producer,
      outputs: [{ port: "ocrResult", ctxKey: "k" }],
    } as GraphNode;
    config.nodes.consumer = {
      ...config.nodes.consumer,
      inputs: [{ port: "ocrResult", ctxKey: "k" }],
    } as GraphNode;
    deepFreeze(config);

    expect(() =>
      pinPortBinding(config, "consumer", "ocrResult", {
        producerNodeId: "producer",
        producerPort: "ocrResult",
      }),
    ).not.toThrow();
    expect(() =>
      disconnectDataWire(config, "consumer", "ocrResult"),
    ).not.toThrow();
  });
});
