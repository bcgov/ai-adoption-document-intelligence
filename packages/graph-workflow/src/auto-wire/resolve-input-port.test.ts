// packages/graph-workflow/src/auto-wire/resolve-input-port.test.ts
import type { GraphNode, GraphWorkflowConfig } from "../types";
import { resolveInputPort } from "./resolve-input-port";

function activity(
  id: string,
  activityType: string,
): GraphWorkflowConfig["nodes"][string] {
  return {
    id,
    type: "activity",
    activityType,
    label: id,
  };
}

function makeConfig(
  nodes: Record<string, GraphWorkflowConfig["nodes"][string]>,
  edges: { source: string; target: string }[],
  ctx: GraphWorkflowConfig["ctx"] = {},
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes,
    edges: edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      type: "normal" as const,
    })),
    entryNodeId: Object.keys(nodes)[0] ?? "",
    ctx,
  };
}

describe("resolveInputPort", () => {
  it("returns 'unsatisfied' when no upstream producer matches the kind", () => {
    // file.prepare emits `preparedData` (kind `Document`); we ask for
    // a `Segment` input on the only node downstream → no candidate.
    const cfg = makeConfig(
      { A: activity("A", "file.prepare"), B: activity("B", "ocr.cleanup") },
      [{ source: "A", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "segments", kind: "Segment[]" }),
    ).toEqual({ status: "unsatisfied" });
  });

  it("returns 'auto-bound' when exactly one upstream producer matches", () => {
    // file.prepare → azureOcr.submit. submit declares an input `fileData`
    // (Document), prepare declares an output `preparedData` (Document).
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "A", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "A",
      producerPort: "preparedData",
      via: "nearest-kind",
    });
  });

  it("returns 'auto-bound' to nearest producer when multiple match", () => {
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "file.prepare"),
        C: activity("C", "azureOcr.submit"),
      },
      [
        { source: "A", target: "B" },
        { source: "B", target: "C" },
      ],
    );
    // B is closer to C than A (distance 1 vs 2), so it wins.
    expect(
      resolveInputPort(cfg, "C", { name: "fileData", kind: "Document" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "B",
      producerPort: "preparedData",
      via: "nearest-kind",
    });
  });

  it("returns 'ambiguous' when two producers tie at minimum distance", () => {
    // X → Z and Y → Z; both X and Y produce `Document` at distance 1.
    const cfg = makeConfig(
      {
        X: activity("X", "file.prepare"),
        Y: activity("Y", "file.prepare"),
        Z: activity("Z", "azureOcr.submit"),
      },
      [
        { source: "X", target: "Z" },
        { source: "Y", target: "Z" },
      ],
    );
    const result = resolveInputPort(cfg, "Z", {
      name: "fileData",
      kind: "Document",
    });
    expect(result.status).toBe("ambiguous");
    if (result.status !== "ambiguous") throw new Error("type narrow");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.producerNodeId).sort()).toEqual([
      "X",
      "Y",
    ]);
  });

  it("binds a base-Artifact port to the unique same-named upstream output", () => {
    // submit → poll. poll.apimRequestId has kind `Artifact`, so it takes the
    // identifier fast path: no kind-matching at all — bind only to the UNIQUE
    // upstream output whose name matches exactly (submit.apimRequestId).
    // The bind is by name, so provenance is "name-match".
    const cfg = makeConfig(
      {
        S: activity("S", "azureOcr.submit"),
        P: activity("P", "azureOcr.poll"),
      },
      [{ source: "S", target: "P" }],
    );
    expect(
      resolveInputPort(cfg, "P", { name: "apimRequestId", kind: "Artifact" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "S",
      producerPort: "apimRequestId",
      via: "name-match",
    });
  });

  it("binds a base-Artifact port to a same-named output farther upstream", () => {
    // submit → poll → extract. extract.apimRequestId has kind `Artifact`
    // (identifier fast path). The nearest producer (poll) has no output named
    // apimRequestId; the unique same-named output is submit's (farther), so
    // bind to it — with "name-match" provenance — rather than leaving the
    // port unsatisfied.
    const cfg = makeConfig(
      {
        S: activity("S", "azureOcr.submit"),
        P: activity("P", "azureOcr.poll"),
        E: activity("E", "azureOcr.extract"),
      },
      [
        { source: "S", target: "P" },
        { source: "P", target: "E" },
      ],
    );
    expect(
      resolveInputPort(cfg, "E", { name: "apimRequestId", kind: "Artifact" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "S",
      producerPort: "apimRequestId",
      via: "name-match",
    });
  });

  it("stays 'ambiguous' when a kind tie has no unique same-named producer", () => {
    // X,Y both output `preparedData` (Document); neither is named `fileData`,
    // so the name-match rule can't disambiguate — behaviour unchanged.
    const cfg = makeConfig(
      {
        X: activity("X", "file.prepare"),
        Y: activity("Y", "file.prepare"),
        Z: activity("Z", "azureOcr.submit"),
      },
      [
        { source: "X", target: "Z" },
        { source: "Y", target: "Z" },
      ],
    );
    expect(
      resolveInputPort(cfg, "Z", { name: "fileData", kind: "Document" }).status,
    ).toBe("ambiguous");
  });

  it("returns 'locked' when the port is in node.metadata.lockedInputPorts", () => {
    // `myDoc` must have a real source for the pin to be healthy (G-005): here
    // A's `preparedData` output is bound to it.
    const node = {
      ...activity("B", "azureOcr.submit"),
      inputs: [{ port: "fileData", ctxKey: "myDoc" }],
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const cfg = makeConfig(
      {
        A: {
          ...activity("A", "file.prepare"),
          outputs: [{ port: "preparedData", ctxKey: "myDoc" }],
        },
        B: node,
      },
      [{ source: "A", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({ status: "locked", ctxKey: "myDoc" });
  });

  it("skips ports with no declared kind (wildcard)", () => {
    const cfg = makeConfig(
      {
        A: activity("A", "file.prepare"),
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "A", target: "B" }],
    );
    expect(resolveInputPort(cfg, "B", { name: "freeform" })).toEqual({
      status: "unsatisfied",
    });
  });
});

describe("locked-unbound (port-wiring Phase 3, §6.3)", () => {
  it("reports locked-unbound for a locked port with no inputs row", () => {
    // A (file.prepare) WOULD auto-bind B.fileData if the port were unlocked,
    // but B has no inputs[] row for it and the port is locked.
    const node = {
      ...activity("B", "azureOcr.submit"),
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const cfg = makeConfig({ A: activity("A", "file.prepare"), B: node }, [
      { source: "A", target: "B" },
    ]);
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({ status: "locked-unbound" });
  });

  it("reports locked-unbound for a locked port whose binding has an empty ctxKey", () => {
    const node = {
      ...activity("B", "azureOcr.submit"),
      inputs: [{ port: "fileData", ctxKey: "" }],
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const cfg = makeConfig({ A: activity("A", "file.prepare"), B: node }, [
      { source: "A", target: "B" },
    ]);
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({ status: "locked-unbound" });
  });

  it("reports locked-unbound for a locked port whose binding has an undefined ctxKey", () => {
    // A ctxKey-less input stub can slip into the in-memory config (e.g. a
    // transient during a canvas edge-delete). The classifier must treat a
    // missing ctxKey the same as an empty one — otherwise the row renders
    // the wrong "Pinned" (locked) state instead of "Disconnected by you".
    const node = {
      ...activity("B", "azureOcr.submit"),
      // Deliberately malformed: ctxKey absent at runtime despite the
      // PortBinding type declaring it required.
      inputs: [
        { port: "fileData" } as unknown as { port: string; ctxKey: string },
      ],
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const cfg = makeConfig({ A: activity("A", "file.prepare"), B: node }, [
      { source: "A", target: "B" },
    ]);
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({ status: "locked-unbound" });
  });

  it("still reports locked (with ctxKey) when the locked port has a binding", () => {
    // `someKey` is a declared workflow input — a legitimate source with no
    // producing node (G-005).
    const node = {
      ...activity("B", "azureOcr.submit"),
      inputs: [{ port: "fileData", ctxKey: "someKey" }],
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const cfg = makeConfig(
      { A: activity("A", "file.prepare"), B: node },
      [{ source: "A", target: "B" }],
      { someKey: { type: "object", isInput: true } },
    );
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({ status: "locked", ctxKey: "someKey" });
  });
});

describe("locked binding health (G-005)", () => {
  it("reports a problem when a pinned port's ctx key has no source", () => {
    // B is pinned to `myDoc`; NOTHING writes it and it is not declared.
    const node = {
      ...activity("B", "azureOcr.submit"),
      inputs: [{ port: "fileData", ctxKey: "myDoc" }],
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const cfg = makeConfig({ A: activity("A", "file.prepare"), B: node }, [
      { source: "A", target: "B" },
    ]);
    const result = resolveInputPort(cfg, "B", {
      name: "fileData",
      kind: "Document",
    });
    expect(result).not.toEqual({ status: "locked", ctxKey: "myDoc" });
    expect(result).toEqual({ status: "locked-dangling", ctxKey: "myDoc" });
  });

  it("reports a problem when a pinned port's producer node was deleted", () => {
    // The auto key survives the delete; the producer does not.
    const node = {
      ...activity("B", "azureOcr.submit"),
      inputs: [{ port: "fileData", ctxKey: "__auto.A.preparedData" }],
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const cfg = makeConfig({ B: node }, []);
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({
      status: "locked-dangling",
      ctxKey: "__auto.A.preparedData",
    });
  });

  it("stays healthy when a pinned port's ctx key is a declared workflow input", () => {
    const node = {
      ...activity("B", "azureOcr.submit"),
      inputs: [{ port: "fileData", ctxKey: "myDoc" }],
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const cfg = makeConfig({ B: node }, [], {
      myDoc: { type: "object", isInput: true },
    });
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({ status: "locked", ctxKey: "myDoc" });
  });

  it("reports a problem when a pinned port's ctx key holds an incompatible kind", () => {
    // A writes `myDoc` as `PreparedFile`; the consumer port expects OcrResult.
    const node = {
      ...activity("B", "ocr.cleanup"),
      inputs: [{ port: "ocrResult", ctxKey: "myDoc" }],
      metadata: { lockedInputPorts: ["ocrResult"] },
    };
    const cfg = makeConfig(
      {
        A: {
          ...activity("A", "file.prepare"),
          outputs: [{ port: "preparedData", ctxKey: "myDoc" }],
        },
        B: node,
      },
      [{ source: "A", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "ocrResult", kind: "OcrResult" }),
    ).toEqual({
      status: "locked-kind-mismatch",
      ctxKey: "myDoc",
      expected: "OcrResult",
      actual: "PreparedFile",
    });
  });

  it("stays healthy when the pinned kind is an assignable subtype", () => {
    // `PreparedFile` is a `Document` subtype — a pin to it must NOT be flagged.
    const node = {
      ...activity("B", "azureOcr.submit"),
      inputs: [{ port: "fileData", ctxKey: "myDoc" }],
      metadata: { lockedInputPorts: ["fileData"] },
    };
    const cfg = makeConfig(
      {
        A: {
          ...activity("A", "file.prepare"),
          outputs: [{ port: "preparedData", ctxKey: "myDoc" }],
        },
        B: node,
      },
      [{ source: "A", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({ status: "locked", ctxKey: "myDoc" });
  });
});

describe("provenance (via)", () => {
  it("reports 'name-match' when a genuine non-Artifact kind tie is broken by port name", () => {
    // X (azureClassify.submit → `blobKey`: Document) and Y (file.prepare →
    // `preparedData`: Document) both feed Z at distance 1 — a REAL kind tie
    // on Z's `blobKey` (Document) port that reaches the same-name tiebreak
    // (not the base-Artifact fast path). Exactly one candidate's output port
    // shares the consumer port's name, so the tiebreak fires and the name is
    // what disambiguated the bind.
    const cfg = makeConfig(
      {
        X: activity("X", "azureClassify.submit"),
        Y: activity("Y", "file.prepare"),
        Z: activity("Z", "blob.read"),
      },
      [
        { source: "X", target: "Z" },
        { source: "Y", target: "Z" },
      ],
    );
    expect(
      resolveInputPort(cfg, "Z", { name: "blobKey", kind: "Document" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "X",
      producerPort: "blobKey",
      via: "name-match",
    });
  });

  it("reports 'map-item' for a bind to a map's synthetic element producer", () => {
    // SPLIT(Segment[]) → MAP → BODY (document.classify wants Segment `segment`).
    const cfg: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        SPLIT: activity("SPLIT", "document.split"),
        MAP: {
          id: "MAP",
          type: "map",
          label: "Map",
          collectionCtxKey: "splitSegments",
          itemCtxKey: "currentSegment",
          bodyEntryNodeId: "BODY",
          bodyExitNodeId: "BODY",
        },
        BODY: activity("BODY", "document.classify"),
      },
      edges: [
        { id: "e0", source: "SPLIT", target: "MAP", type: "normal" },
        { id: "e1", source: "MAP", target: "BODY", type: "normal" },
      ],
      entryNodeId: "SPLIT",
      ctx: {},
    };
    // SPLIT's `segments` output must be bound so resolveMapElementKind can
    // find it by ctxKey.
    cfg.nodes.SPLIT = {
      ...cfg.nodes.SPLIT,
      outputs: [{ port: "segments", ctxKey: "splitSegments" }],
    };
    expect(
      resolveInputPort(cfg, "BODY", { name: "segment", kind: "Segment" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "MAP",
      producerPort: "currentSegment",
      via: "map-item",
    });
  });
});

describe("control-flow and source producers (G-007)", () => {
  it("auto-binds a consumer downstream of a source node", () => {
    // `source.upload` writes its configured ctx key with the catalog's
    // `outputKind` (DocumentRef, a Document subtype), so a downstream
    // `Document` port has a real producer to bind to.
    const cfg = makeConfig(
      {
        S: {
          id: "S",
          type: "source",
          label: "Upload",
          sourceType: "source.upload",
          parameters: { ctxKey: "incomingDoc" },
        } as GraphNode,
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "S", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "S",
      producerPort: "incomingDoc",
      via: "nearest-kind",
    });
  });

  it("honours a source.api field's declared kind", () => {
    const cfg = makeConfig(
      {
        S: {
          id: "S",
          type: "source",
          label: "API",
          sourceType: "source.api",
          parameters: {
            fields: [
              {
                name: "incomingDoc",
                type: "object",
                kind: "PreparedFile",
                required: true,
              },
              { name: "caseNumber", type: "string", required: true },
            ],
          },
        } as GraphNode,
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "S", target: "B" }],
    );
    // Only the PreparedFile field satisfies a `Document` port — the untyped
    // `caseNumber` declares no kind and must not be guessed at.
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "S",
      producerPort: "incomingDoc",
      via: "nearest-kind",
    });
  });

  it("auto-binds a consumer to a join's results array", () => {
    // `benchmark.aggregate.results` is a base-`Artifact` port, so it takes
    // the identifier fast path: the unique upstream output NAMED `results`
    // is the join's. Before G-007 the join contributed nothing and the port
    // was left unsatisfied.
    const cfg = makeConfig(
      {
        J: {
          id: "J",
          type: "join",
          label: "Join",
          sourceMapNodeId: "MAP",
          strategy: "all",
          resultsCtxKey: "joined",
        } as GraphNode,
        A: activity("A", "benchmark.aggregate"),
      },
      [{ source: "J", target: "A" }],
    );
    expect(
      resolveInputPort(cfg, "A", { name: "results", kind: "Artifact" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "J",
      producerPort: "results",
      via: "name-match",
    });
  });

  it("offers a humanGate's approval payload as a producer", () => {
    const cfg = makeConfig(
      {
        H: {
          id: "H",
          type: "humanGate",
          label: "Review",
          signal: { name: "approve" },
          timeout: "1h",
          onTimeout: "fail",
        } as GraphNode,
        B: activity("B", "ocr.cleanup"),
      },
      [{ source: "H", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "payload", kind: "Artifact" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "H",
      producerPort: "payload",
      via: "name-match",
    });
  });

  it("offers a childWorkflow's declared output mappings", () => {
    const cfg = makeConfig(
      {
        C: {
          id: "C",
          type: "childWorkflow",
          label: "Child",
          workflowRef: { type: "library", workflowId: "w1" },
          outputMappings: [{ port: "summary", ctxKey: "childSummary" }],
        } as GraphNode,
        B: activity("B", "ocr.cleanup"),
      },
      [{ source: "C", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "summary", kind: "Artifact" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "C",
      producerPort: "summary",
      via: "name-match",
    });
  });

  it("a switch contributes no outputs (it routes, it does not produce)", () => {
    const cfg = makeConfig(
      {
        SW: {
          id: "SW",
          type: "switch",
          label: "Route",
          cases: [],
          defaultEdge: "e0",
        } as GraphNode,
        B: activity("B", "azureOcr.submit"),
      },
      [{ source: "SW", target: "B" }],
    );
    expect(
      resolveInputPort(cfg, "B", { name: "fileData", kind: "Document" }),
    ).toEqual({ status: "unsatisfied" });
    // Nor by name: a switch has no ports at all to match against.
    expect(
      resolveInputPort(cfg, "B", { name: "SW", kind: "Artifact" }),
    ).toEqual({ status: "unsatisfied" });
  });

  it("a map's item/index writes do not compete with its synthetic element producer", () => {
    // The map contributes `item`/`index` ports with NO kind (the element type
    // is supplied by the synthetic map-item pass, which knows it precisely).
    // Declaring them must not turn the precise bind into an ambiguity.
    const cfg: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      nodes: {
        SPLIT: {
          ...activity("SPLIT", "document.split"),
          outputs: [{ port: "segments", ctxKey: "splitSegments" }],
        },
        MAP: {
          id: "MAP",
          type: "map",
          label: "Map",
          collectionCtxKey: "splitSegments",
          itemCtxKey: "currentSegment",
          indexCtxKey: "segmentIndex",
          bodyEntryNodeId: "BODY",
          bodyExitNodeId: "BODY",
        } as GraphNode,
        BODY: activity("BODY", "document.classify"),
      },
      edges: [
        { id: "e0", source: "SPLIT", target: "MAP", type: "normal" },
        { id: "e1", source: "MAP", target: "BODY", type: "normal" },
      ],
      entryNodeId: "SPLIT",
      ctx: {},
    };
    expect(
      resolveInputPort(cfg, "BODY", { name: "segment", kind: "Segment" }),
    ).toEqual({
      status: "auto-bound",
      producerNodeId: "MAP",
      producerPort: "currentSegment",
      via: "map-item",
    });
  });
});
