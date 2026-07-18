import { describe, expect, it } from "vitest";
import type {
  ActivityNode,
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
  PollUntilNode,
  SwitchNode,
} from "../../../types/workflow";
import {
  ensureConditionProducerBindings,
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
      portKind: "Document",
    });
  });

  it("resolves a synthesised __auto key with no explicit binding", () => {
    const config = makeConfig([prepare("A", "Prepare file")]);
    expect(resolveCtxKeyToProducer(config, "__auto.A.preparedData")).toEqual({
      producerNodeId: "A",
      nodeLabel: "Prepare file",
      port: "preparedData",
      portLabel: "Prepared file data",
      portKind: "Document",
    });
  });

  it("returns null when nothing produces the key", () => {
    const config = makeConfig([prepare("A", "Prep")]);
    expect(resolveCtxKeyToProducer(config, "handTyped")).toBeNull();
    expect(resolveCtxKeyToProducer(config, "")).toBeNull();
  });

  it("breaks ties to the nearest upstream producer with a consumerNodeId", () => {
    // Two producers write the SAME ctx key at different distances from C.
    const consumer: SwitchNode = {
      id: "C",
      type: "switch",
      label: "Route",
      cases: [],
    };
    const edges: GraphEdge[] = [
      { id: "e1", source: "A", target: "B", type: "normal" },
      { id: "e2", source: "B", target: "C", type: "normal" },
    ];
    const config: GraphWorkflowConfig = {
      ...makeConfig([
        prepare("A", "First prep", [
          { port: "preparedData", ctxKey: "shared" },
        ]),
        prepare("B", "Second prep", [
          { port: "preparedData", ctxKey: "shared" },
        ]),
        consumer,
      ]),
      edges,
    };
    // B is 1 hop upstream of C, A is 2 hops → resolves to the nearer B.
    expect(resolveCtxKeyToProducer(config, "shared", "C")).toEqual({
      producerNodeId: "B",
      nodeLabel: "Second prep",
      port: "preparedData",
      portLabel: "Prepared file data",
      portKind: "Document",
    });
    // Without a consumerNodeId, ties fall back to node-record order → A.
    expect(resolveCtxKeyToProducer(config, "shared")).toEqual({
      producerNodeId: "A",
      nodeLabel: "First prep",
      port: "preparedData",
      portLabel: "Prepared file data",
      portKind: "Document",
    });
  });

  it("resolves a pollUntil producer node", () => {
    const poll: PollUntilNode = {
      id: "P",
      type: "pollUntil",
      label: "Poll ready",
      activityType: "file.prepare",
      condition: { operator: "is-not-null", value: { ref: "x" } },
      interval: "PT5S",
      outputs: [{ port: "preparedData", ctxKey: "pollOut" }],
    };
    const config = makeConfig([poll]);
    expect(resolveCtxKeyToProducer(config, "pollOut")).toEqual({
      producerNodeId: "P",
      nodeLabel: "Poll ready",
      port: "preparedData",
      portLabel: "Prepared file data",
      portKind: "Document",
    });
  });
});

describe("ensureConditionProducerBindings", () => {
  it("materialises a switch case condition's producer output binding", () => {
    const sw: SwitchNode = {
      id: "SW",
      type: "switch",
      label: "Branch",
      cases: [
        {
          condition: {
            operator: "equals",
            left: { ref: "__auto.A.preparedData" },
            right: { literal: "x" },
          },
          edgeId: "",
        },
      ],
    };
    const edges: GraphEdge[] = [
      { id: "A-SW", source: "A", target: "SW", type: "normal" },
    ];
    const config: GraphWorkflowConfig = {
      ...makeConfig([prepare("A", "Prepare file"), sw]),
      edges,
    };

    const next = ensureConditionProducerBindings(config, "SW");
    expect(next.nodes.A.outputs).toContainEqual({
      port: "preparedData",
      ctxKey: "__auto.A.preparedData",
    });
  });

  it("materialises a pollUntil condition's producer output binding", () => {
    const poll: PollUntilNode = {
      id: "P",
      type: "pollUntil",
      label: "Poll",
      activityType: "file.prepare",
      condition: {
        operator: "is-not-null",
        value: { ref: "__auto.A.preparedData" },
      },
      interval: "PT5S",
    };
    const edges: GraphEdge[] = [
      { id: "A-P", source: "A", target: "P", type: "normal" },
    ];
    const config: GraphWorkflowConfig = {
      ...makeConfig([prepare("A", "Prepare file"), poll]),
      edges,
    };

    const next = ensureConditionProducerBindings(config, "P");
    expect(next.nodes.A.outputs).toContainEqual({
      port: "preparedData",
      ctxKey: "__auto.A.preparedData",
    });
  });

  it("is idempotent — returns the SAME reference when already bound", () => {
    const sw: SwitchNode = {
      id: "SW",
      type: "switch",
      label: "Branch",
      cases: [
        {
          condition: {
            operator: "equals",
            left: { ref: "__auto.A.preparedData" },
            right: { literal: "x" },
          },
          edgeId: "",
        },
      ],
    };
    const config: GraphWorkflowConfig = {
      ...makeConfig([
        prepare("A", "Prepare file", [
          { port: "preparedData", ctxKey: "__auto.A.preparedData" },
        ]),
        sw,
      ]),
      edges: [{ id: "A-SW", source: "A", target: "SW", type: "normal" }],
    };

    expect(ensureConditionProducerBindings(config, "SW")).toBe(config);
  });

  it("leaves config unchanged for a ref that resolves to no producer", () => {
    const sw: SwitchNode = {
      id: "SW",
      type: "switch",
      label: "Branch",
      cases: [
        {
          condition: {
            operator: "equals",
            left: { ref: "handTyped" },
            right: { literal: "x" },
          },
          edgeId: "",
        },
      ],
    };
    const config = makeConfig([prepare("A", "Prepare file"), sw]);

    expect(ensureConditionProducerBindings(config, "SW")).toBe(config);
  });
});

// azureOcr.extract emits port "ocrResult" of kind "OcrResult" (has a field
// schema), so drilled refs like "ocrResult.status" resolve against it.
const extractOcr = (
  id: string,
  label: string,
  outputs: { port: string; ctxKey: string }[] = [],
): ActivityNode => ({
  id,
  type: "activity",
  label,
  activityType: "azureOcr.extract",
  outputs,
});

describe("resolveCtxKeyToProducer — drilled refs", () => {
  it("reverse-resolves a drilled ctx key to producer + fieldPath + portKind", () => {
    const config = makeConfig([
      extractOcr("ocr", "Extract OCR", [
        { port: "ocrResult", ctxKey: "ocrResult" },
      ]),
    ]);
    expect(resolveCtxKeyToProducer(config, "ocrResult.status")).toMatchObject({
      producerNodeId: "ocr",
      port: "ocrResult",
      fieldPath: "status",
      portKind: "OcrResult",
    });
  });

  it("exact (non-drilled) keys resolve with fieldPath undefined", () => {
    const config = makeConfig([
      extractOcr("ocr", "Extract OCR", [
        { port: "ocrResult", ctxKey: "ocrResult" },
      ]),
    ]);
    const resolved = resolveCtxKeyToProducer(config, "ocrResult");
    expect(resolved?.fieldPath).toBeUndefined();
    expect(resolved?.producerNodeId).toBe("ocr");
  });

  it("does not prefix-match across a non-dot boundary", () => {
    const config = makeConfig([
      extractOcr("ocr", "Extract OCR", [
        { port: "ocrResult", ctxKey: "ocrResult" },
      ]),
    ]);
    expect(resolveCtxKeyToProducer(config, "ocrResultX")).toBeNull();
  });

  it("ensureConditionProducerBindings materialises the binding for a drilled ref", () => {
    const sw: SwitchNode = {
      id: "SW",
      type: "switch",
      label: "Branch",
      cases: [
        {
          condition: {
            operator: "not-equals",
            left: { ref: "__auto.ocr.ocrResult.status" },
            right: { literal: "running" },
          },
          edgeId: "",
        },
      ],
    };
    const config: GraphWorkflowConfig = {
      ...makeConfig([extractOcr("ocr", "Extract OCR"), sw]),
      edges: [{ id: "ocr-SW", source: "ocr", target: "SW", type: "normal" }],
    };

    const next = ensureConditionProducerBindings(config, "SW");
    expect(next.nodes.ocr.outputs).toContainEqual({
      port: "ocrResult",
      ctxKey: "__auto.ocr.ocrResult",
    });
  });
});
