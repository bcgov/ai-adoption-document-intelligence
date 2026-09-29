/**
 * Tests for `deriveWires` — the pure selector that maps a workflow config
 * to renderable port-to-port wires. See
 * docs-md/workflows/PORT_WIRING_DESIGN.md §5 for the semantics and
 * §14 for the acceptance scenarios these tests cover.
 */
import { describe, expect, it } from "vitest";
import type {
  ActivityNode,
  ChildWorkflowNode,
  GraphWorkflowConfig,
  HumanGateNode,
  JoinNode,
  MapNode,
  SourceNode,
  SwitchNode,
} from "../../../types/workflow";
import { config, node } from "./__test-utils__/config-fixtures";
import { type DataWire, deriveWires } from "./derive-wires";

/**
 * `file.prepare` (A) → `azureOcr.submit` (B), wired through A's
 * auto-synthesized `preparedData` ctx key and connected by a `normal`
 * edge. Shared by Scenarios 1 and 8, which assert different facets of
 * the same auto-bound wire.
 */
function linearChainConfig(): GraphWorkflowConfig {
  return config({
    nodes: {
      A: node<ActivityNode>({
        id: "A",
        type: "activity",
        activityType: "file.prepare",
        outputs: [{ port: "preparedData", ctxKey: "__auto.A.preparedData" }],
      }),
      B: node<ActivityNode>({
        id: "B",
        type: "activity",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "__auto.A.preparedData" }],
      }),
    },
    edges: [{ id: "e1", source: "A", target: "B", type: "normal" }],
  });
}

function isDataWire(wire: { variant: string }): wire is DataWire {
  return wire.variant === "data";
}

describe("deriveWires — Scenario 1: linear chain with an __auto. key", () => {
  it("derives a data wire, stamps the edge id, and emits no sequence wire for the pair", () => {
    const wires = deriveWires(linearChainConfig());
    const dataWires = wires.filter(isDataWire);

    expect(dataWires).toHaveLength(1);
    expect(dataWires[0]).toMatchObject({
      id: "wire:B:fileData",
      source: "A",
      sourcePort: "preparedData",
      target: "B",
      targetPort: "fileData",
      kind: "PreparedFile",
      pinned: false,
      auto: true,
      edgeId: "e1",
      ctxKey: "__auto.A.preparedData",
    });

    expect(wires.filter((w) => w.variant === "sequence")).toHaveLength(0);
  });
});

describe("deriveWires — Scenario 2: locked port + non-auto ctx key", () => {
  it("reports pinned: true, auto: false, and no via", () => {
    const cfg = config({
      nodes: {
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "sharedBlob" }],
        }),
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          inputs: [{ port: "fileData", ctxKey: "sharedBlob" }],
          metadata: { lockedInputPorts: ["fileData"] },
        }),
      },
    });

    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0].pinned).toBe(true);
    expect(dataWires[0].auto).toBe(false);
    expect(dataWires[0].via).toBeUndefined();
  });
});

describe("deriveWires — Scenario 3: normal edge with no data bindings", () => {
  it("derives a single sequence wire carrying the edge id", () => {
    const cfg = config({
      nodes: {
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "file.prepare",
        }),
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
        }),
      },
      edges: [{ id: "e1", source: "A", target: "B", type: "normal" }],
    });

    const wires = deriveWires(cfg);
    expect(wires).toEqual([
      { variant: "sequence", id: "e1", edge: cfg.edges[0] },
    ]);
  });
});

describe("deriveWires — Scenario 4: conditional and error edges pass through", () => {
  it("renders both as structural wires carrying their own variant", () => {
    const cfg = config({
      nodes: {
        Sw: node<SwitchNode>({
          id: "Sw",
          type: "switch",
          cases: [
            {
              condition: {
                operator: "equals",
                left: { ref: "ctx.status" },
                right: { literal: "approved" },
              },
              edgeId: "cond1",
            },
          ],
        }),
        X: node<ActivityNode>({
          id: "X",
          type: "activity",
          activityType: "file.prepare",
        }),
        Y: node<ActivityNode>({
          id: "Y",
          type: "activity",
          activityType: "azureOcr.submit",
        }),
        Z: node<ActivityNode>({
          id: "Z",
          type: "activity",
          activityType: "file.prepare",
        }),
      },
      edges: [
        { id: "cond1", source: "Sw", target: "X", type: "conditional" },
        { id: "err1", source: "Y", target: "Z", type: "error" },
      ],
    });

    const wires = deriveWires(cfg);
    expect(wires).toContainEqual({
      variant: "conditional",
      id: "cond1",
      edge: cfg.edges[0],
    });
    expect(wires).toContainEqual({
      variant: "error",
      id: "err1",
      edge: cfg.edges[1],
    });
  });
});

describe("deriveWires — Scenario 5: data wire without a connecting edge", () => {
  it("derives the wire anyway, with edgeId left undefined", () => {
    const cfg = config({
      nodes: {
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "sharedBlob" }],
        }),
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          inputs: [{ port: "fileData", ctxKey: "sharedBlob" }],
        }),
      },
      // No edges at all — the binding exists with no execution-order path.
    });

    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0].source).toBe("A");
    expect(dataWires[0].target).toBe("B");
    expect(dataWires[0].edgeId).toBeUndefined();
  });
});

describe("deriveWires — Scenario 6: binding to a declared config.ctx key", () => {
  it("derives no data wire — it's a workflow variable, not a producer", () => {
    const cfg = config({
      nodes: {
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "file.prepare",
          inputs: [{ port: "blobKey", ctxKey: "blobKey" }],
        }),
      },
      ctx: { blobKey: { type: "string", isInput: true, kind: "Document" } },
    });

    const wires = deriveWires(cfg);
    expect(wires.filter((w) => w.variant === "data")).toHaveLength(0);
  });
});

describe("deriveWires — Scenario 7: source node emitting its ctx key", () => {
  it("derives a data wire from the source node's output handle", () => {
    const cfg = config({
      nodes: {
        S: node<SourceNode>({
          id: "S",
          type: "source",
          sourceType: "source.upload",
          parameters: { ctxKey: "documentUrl" },
        }),
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          inputs: [{ port: "blobKey", ctxKey: "documentUrl" }],
        }),
      },
    });

    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0]).toMatchObject({
      source: "S",
      sourcePort: "documentUrl",
      target: "A",
      targetPort: "blobKey",
      kind: "DocumentRef",
      ctxKey: "documentUrl",
    });
  });
});

describe("deriveWires — Scenario 8: via provenance on an auto-bound wire", () => {
  it("reports nearest-kind for the file.prepare -> azureOcr.submit chain", () => {
    const dataWires = deriveWires(linearChainConfig()).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0].via).toBe("nearest-kind");
  });
});

describe("deriveWires — stale binding: resolver disagrees with the persisted producer", () => {
  it("draws the wire to the persisted producer with via left undefined", () => {
    // C's __auto. binding points at A, but only B is upstream of C — the
    // resolver would auto-bind fileData to B today. The wire must still
    // follow the persisted binding (to A) without claiming the resolver's
    // mechanism for it.
    const cfg = config({
      nodes: {
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "__auto.A.preparedData" }],
        }),
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "file.prepare",
        }),
        C: node<ActivityNode>({
          id: "C",
          type: "activity",
          activityType: "azureOcr.submit",
          inputs: [{ port: "fileData", ctxKey: "__auto.A.preparedData" }],
        }),
      },
      edges: [{ id: "e1", source: "B", target: "C", type: "normal" }],
    });

    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0].source).toBe("A");
    expect(dataWires[0].target).toBe("C");
    expect(dataWires[0].auto).toBe(true);
    expect(dataWires[0].via).toBeUndefined();
  });
});

describe("deriveWires — source.api with multiple typed fields", () => {
  it("derives one wire per consumed field with per-field sourcePort and kind", () => {
    const cfg = config({
      nodes: {
        S: node<SourceNode>({
          id: "S",
          type: "source",
          sourceType: "source.api",
          parameters: {
            fields: [
              {
                name: "documentUrl",
                type: "string",
                kind: "Document",
                required: true,
              },
              { name: "priority", type: "string", required: false },
            ],
          },
        }),
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          inputs: [
            { port: "blobKey", ctxKey: "documentUrl" },
            { port: "fileName", ctxKey: "priority" },
          ],
        }),
      },
    });

    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(2);
    expect(dataWires).toContainEqual(
      expect.objectContaining({
        source: "S",
        sourcePort: "documentUrl",
        target: "A",
        targetPort: "blobKey",
        kind: "Document",
      }),
    );
    expect(dataWires).toContainEqual(
      expect.objectContaining({
        source: "S",
        sourcePort: "priority",
        target: "A",
        targetPort: "fileName",
        kind: "Artifact",
      }),
    );
  });
});

describe("deriveWires — duplicate normal edges between one pair", () => {
  it("stamps the first edge onto the data wire and keeps the surplus edge as a sequence wire", () => {
    const cfg = linearChainConfig();
    cfg.edges.push({ id: "e2", source: "A", target: "B", type: "normal" });

    const wires = deriveWires(cfg);
    const dataWires = wires.filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0].edgeId).toBe("e1");

    const sequenceWires = wires.filter((w) => w.variant === "sequence");
    expect(sequenceWires).toHaveLength(1);
    expect(sequenceWires[0].id).toBe("e2");
  });
});

describe("deriveWires — two producers writing the same ctx key", () => {
  it("picks the first writer in node-iteration order", () => {
    const cfg = config({
      nodes: {
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "shared" }],
        }),
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "shared" }],
        }),
        C: node<ActivityNode>({
          id: "C",
          type: "activity",
          activityType: "azureOcr.submit",
          inputs: [{ port: "fileData", ctxKey: "shared" }],
        }),
      },
    });

    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0].source).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// G-007 follow-up: control-flow producers must draw wires too.
//
// G-007 let the resolver auto-bind consumers downstream of a `join`,
// `humanGate` or `childWorkflow`. Those nodes write ctx through their own
// fields rather than through `outputs[]`, so the producer index did not know
// about them and the resulting binding rendered NO wire — a correct binding
// the author could neither see nor delete.
// ---------------------------------------------------------------------------

describe("deriveWires — control-flow producers (G-007)", () => {
  it("draws a data wire from a join's results key", () => {
    const cfg = config({
      nodes: {
        J: node<JoinNode>({
          id: "J",
          type: "join",
          sourceMapNodeId: "MAP",
          strategy: "all",
          resultsCtxKey: "branchResults",
        }),
        AGG: node<ActivityNode>({
          id: "AGG",
          type: "activity",
          activityType: "benchmark.aggregate",
          inputs: [{ port: "results", ctxKey: "branchResults" }],
        }),
      },
      edges: [{ id: "e1", source: "J", target: "AGG", type: "normal" }],
    });

    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0]).toMatchObject({
      source: "J",
      sourcePort: "results",
      target: "AGG",
      targetPort: "results",
      ctxKey: "branchResults",
      edgeId: "e1",
    });
    // No sequence wire: the pair's edge is stamped onto the data wire.
    expect(
      deriveWires(cfg).filter((w) => w.variant === "sequence"),
    ).toHaveLength(0);
  });

  it("draws a data wire from a humanGate's approval payload", () => {
    const cfg = config({
      nodes: {
        HG: node<HumanGateNode>({
          id: "HG",
          type: "humanGate",
          signal: { name: "humanApproval" },
          timeout: "1h",
          onTimeout: "fail",
        }),
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "document.updateStatus",
          // The executor always writes `<nodeId>Payload` with the signal body.
          inputs: [{ port: "documentId", ctxKey: "HGPayload" }],
        }),
      },
      edges: [{ id: "e1", source: "HG", target: "A", type: "normal" }],
    });

    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0]).toMatchObject({
      source: "HG",
      sourcePort: "payload",
      target: "A",
      targetPort: "documentId",
      ctxKey: "HGPayload",
    });
  });

  it("draws a data wire from a childWorkflow's declared output mapping", () => {
    const cfg = config({
      nodes: {
        C: node<ChildWorkflowNode>({
          id: "C",
          type: "childWorkflow",
          workflowRef: { type: "library", workflowId: "w1" },
          outputMappings: [{ port: "summary", ctxKey: "childSummary" }],
        }),
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "document.updateStatus",
          inputs: [{ port: "documentId", ctxKey: "childSummary" }],
        }),
      },
      edges: [{ id: "e1", source: "C", target: "A", type: "normal" }],
    });

    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0]).toMatchObject({
      source: "C",
      sourcePort: "summary",
      target: "A",
      targetPort: "documentId",
      ctxKey: "childSummary",
    });
  });

  it("a switch still contributes no producers", () => {
    // A switch routes; it writes no ctx. A binding to a key it does not
    // write must stay wire-less rather than gain a phantom producer.
    const cfg = config({
      nodes: {
        SW: node<SwitchNode>({ id: "SW", type: "switch", cases: [] }),
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "document.updateStatus",
          inputs: [{ port: "documentId", ctxKey: "nothingWritesThis" }],
        }),
      },
      edges: [{ id: "e1", source: "SW", target: "A", type: "normal" }],
    });

    expect(deriveWires(cfg).filter(isDataWire)).toHaveLength(0);
  });

  it("an explicit outputs[] row on a control-flow node still wins", () => {
    // First-writer-wins is unchanged: the `outputs[]` pass runs first, so a
    // hand-authored row is not displaced by the type-derived write.
    const cfg = config({
      nodes: {
        J: node<JoinNode>({
          id: "J",
          type: "join",
          sourceMapNodeId: "MAP",
          strategy: "all",
          resultsCtxKey: "shared",
          outputs: [{ port: "handAuthored", ctxKey: "shared" }],
        }),
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "document.updateStatus",
          inputs: [{ port: "documentId", ctxKey: "shared" }],
        }),
      },
    });

    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0].sourcePort).toBe("handAuthored");
  });

  it("regression: source-originated wires are unchanged", () => {
    // The source branch of the producer index owns source kinds and must not
    // be displaced by the control-flow pass. Same assertions as the
    // source.upload / source.api scenarios above, re-run together.
    const cfg = config({
      nodes: {
        UP: node<SourceNode>({
          id: "UP",
          type: "source",
          sourceType: "source.upload",
          parameters: { ctxKey: "incomingDoc" },
        }),
        API: node<SourceNode>({
          id: "API",
          type: "source",
          sourceType: "source.api",
          parameters: {
            fields: [
              { name: "caseNumber", type: "string", required: true },
              {
                name: "typedDoc",
                type: "object",
                kind: "Document",
                required: true,
              },
            ],
          },
        }),
        R: node<ActivityNode>({
          id: "R",
          type: "activity",
          activityType: "blob.read",
          inputs: [{ port: "blobKey", ctxKey: "incomingDoc" }],
        }),
        P: node<ActivityNode>({
          id: "P",
          type: "activity",
          activityType: "file.prepare",
          inputs: [
            { port: "blobKey", ctxKey: "typedDoc" },
            { port: "fileName", ctxKey: "caseNumber" },
          ],
        }),
      },
    });

    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(3);
    expect(dataWires).toContainEqual(
      expect.objectContaining({
        source: "UP",
        sourcePort: "incomingDoc",
        target: "R",
        kind: "DocumentRef",
      }),
    );
    expect(dataWires).toContainEqual(
      expect.objectContaining({
        source: "API",
        sourcePort: "typedDoc",
        target: "P",
        kind: "Document",
      }),
    );
    expect(dataWires).toContainEqual(
      expect.objectContaining({
        source: "API",
        sourcePort: "caseNumber",
        target: "P",
        // source.api's untyped fields keep the `Artifact` default the source
        // branch has always applied.
        kind: "Artifact",
      }),
    );
  });
});

/**
 * G-104 — a map writes the current loop item into its `itemCtxKey`. Before
 * this fix `map` was excluded from the producer index outright, so a body
 * node correctly auto-bound to the map's item drew NO wire at all: a binding
 * the author could neither see nor delete. Fan-out is the most common shape
 * in the product, so this was the binding most likely to be invisible.
 */
describe("deriveWires — map-item producers (G-104)", () => {
  /**
   * SPLIT (`document.split`, emits `Segment[]`) → MAP → BODY
   * (`document.classify`, wants a `Segment` on its `segment` port). The map's
   * item key is the author's own name, `currentSegment` — NOT an `__auto.*`
   * key, because a map writes ctx through its dedicated field.
   */
  function mapChainConfig(): GraphWorkflowConfig {
    return config({
      nodes: {
        SPLIT: node<ActivityNode>({
          id: "SPLIT",
          type: "activity",
          activityType: "document.split",
          outputs: [{ port: "segments", ctxKey: "splitSegments" }],
        }),
        MAP: node<MapNode>({
          id: "MAP",
          type: "map",
          collectionCtxKey: "splitSegments",
          itemCtxKey: "currentSegment",
          bodyEntryNodeId: "BODY",
          bodyExitNodeId: "BODY",
        }),
        BODY: node<ActivityNode>({
          id: "BODY",
          type: "activity",
          activityType: "document.classify",
          inputs: [{ port: "segment", ctxKey: "currentSegment" }],
        }),
      },
      edges: [
        { id: "e0", source: "SPLIT", target: "MAP", type: "normal" },
        { id: "e1", source: "MAP", target: "BODY", type: "normal" },
      ],
    });
  }

  it("draws a data wire from a map to a body node bound to its item", () => {
    const dataWires = deriveWires(mapChainConfig()).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0]).toMatchObject({
      source: "MAP",
      // The stable port name, not the author's ctx key.
      sourcePort: "item",
      target: "BODY",
      targetPort: "segment",
      ctxKey: "currentSegment",
      edgeId: "e1",
    });
    // The pair's edge is stamped onto the data wire, so no sequence wire.
    expect(
      deriveWires(mapChainConfig()).filter(
        (w) => w.variant === "sequence" && w.id === "e1",
      ),
    ).toHaveLength(0);
  });

  it("stamps map-item provenance on the wire", () => {
    // The whole reason `map` was excluded: the resolver reported the ctx key
    // as the port, so this lookup could never match and the wire could never
    // claim its mechanism. `WorkflowEdge` renders `via: "map-item"` as
    // "Connected automatically — item from the loop".
    const dataWires = deriveWires(mapChainConfig()).filter(isDataWire);
    expect(dataWires[0].via).toBe("map-item");
  });

  it("draws nothing for a map whose item nothing reads", () => {
    const cfg = mapChainConfig();
    cfg.nodes.BODY = node<ActivityNode>({
      id: "BODY",
      type: "activity",
      activityType: "document.classify",
      inputs: [],
    });
    expect(deriveWires(cfg).filter(isDataWire)).toHaveLength(0);
  });

  it("indexes a map's index key too, distinctly from its item key", () => {
    const cfg = mapChainConfig();
    cfg.nodes.MAP = node<MapNode>({
      id: "MAP",
      type: "map",
      collectionCtxKey: "splitSegments",
      itemCtxKey: "currentSegment",
      indexCtxKey: "segmentIndex",
      bodyEntryNodeId: "BODY",
      bodyExitNodeId: "BODY",
    });
    cfg.nodes.BODY = node<ActivityNode>({
      id: "BODY",
      type: "activity",
      activityType: "document.classify",
      inputs: [
        { port: "segment", ctxKey: "currentSegment" },
        { port: "documentId", ctxKey: "segmentIndex" },
      ],
    });
    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(2);
    expect(dataWires).toContainEqual(
      expect.objectContaining({ sourcePort: "item", targetPort: "segment" }),
    );
    expect(dataWires).toContainEqual(
      expect.objectContaining({
        sourcePort: "index",
        targetPort: "documentId",
      }),
    );
  });

  it("draws no wire for a half-configured map whose item key is still blank", () => {
    // A freshly dropped map has `itemCtxKey: ""` until the author names it
    // (`control-flow-skeletons.ts`). An empty key is not a write — the same
    // rule `writerSourcesKey` already applies — so it must not become a
    // producer that any equally blank binding matches.
    const cfg = mapChainConfig();
    cfg.nodes.MAP = node<MapNode>({
      id: "MAP",
      type: "map",
      collectionCtxKey: "splitSegments",
      itemCtxKey: "",
      bodyEntryNodeId: "BODY",
      bodyExitNodeId: "BODY",
    });
    cfg.nodes.BODY = node<ActivityNode>({
      id: "BODY",
      type: "activity",
      activityType: "document.classify",
      inputs: [{ port: "segment", ctxKey: "" }],
    });
    expect(deriveWires(cfg).filter(isDataWire)).toHaveLength(0);
  });

  it("still excludes source nodes from the control-flow pass", () => {
    // Regression guard: sources are indexed by the branch ABOVE, which owns
    // their per-subtype kinds. `nodeTypeCtxWrites` reports no kind for an
    // untyped `source.api` field, so if the control-flow pass claimed a
    // source the `Artifact` default would be lost.
    const cfg = config({
      nodes: {
        API: node<SourceNode>({
          id: "API",
          type: "source",
          sourceType: "source.api",
          parameters: {
            fields: [{ name: "caseNumber", type: "string", required: true }],
          },
        }),
        P: node<ActivityNode>({
          id: "P",
          type: "activity",
          activityType: "file.prepare",
          inputs: [{ port: "fileName", ctxKey: "caseNumber" }],
        }),
      },
    });
    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0].kind).toBe("Artifact");
  });

  it("leaves via unset for a hand-authored ctx binding to an activity producer", () => {
    // The `via` gate must stay conservative for producers that bind through
    // `outputs[]`: a non-auto key there is the author's own wiring, and the
    // wire must not claim the resolver made it.
    const cfg = config({
      nodes: {
        A: node<ActivityNode>({
          id: "A",
          type: "activity",
          activityType: "file.prepare",
          outputs: [{ port: "preparedData", ctxKey: "myDoc" }],
        }),
        B: node<ActivityNode>({
          id: "B",
          type: "activity",
          activityType: "azureOcr.submit",
          inputs: [{ port: "fileData", ctxKey: "myDoc" }],
        }),
      },
      edges: [{ id: "e1", source: "A", target: "B", type: "normal" }],
    });
    const dataWires = deriveWires(cfg).filter(isDataWire);
    expect(dataWires).toHaveLength(1);
    expect(dataWires[0].via).toBeUndefined();
  });
});
