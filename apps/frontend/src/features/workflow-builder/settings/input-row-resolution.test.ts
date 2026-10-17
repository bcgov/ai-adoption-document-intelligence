/**
 * Tests for `resolveWireableInputRows` — the shared wireable-input row
 * resolver consumed by InputsSection + ConnectSummaryPopover.
 *
 * Focus: a freshly-dropped activity node must NOT carry a placeholder input
 * binding (`ctxKey = portName`). With no such binding, an unsatisfied typed
 * input honestly reports "unsatisfied" (needs a source) rather than the
 * misleading "ctx-bound" ("from <portname>") state that a placeholder binding
 * would have forced. When a compatible upstream producer exists, the same
 * port resolves "auto-bound".
 */
import { describe, expect, it } from "vitest";
import type {
  CtxDeclaration,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import {
  decodeAutoProducerNodeId,
  describeCtxValueOrigin,
  resolveCtxValueOrigin,
  resolvePinnedSource,
  resolveWireableInputRows,
} from "./input-row-resolution";

/**
 * A single `azureOcr.submit` node shaped exactly as the de-placeholdered
 * drop path now produces it: empty `inputs`/`outputs`, no ctx declarations
 * named after ports.
 */
function configWithLoneSubmit(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "lone-submit" },
    ctx: {},
    nodes: {
      submit_1: {
        id: "submit_1",
        type: "activity",
        label: "Submit OCR",
        activityType: "azureOcr.submit",
        inputs: [],
        outputs: [],
        parameters: {},
      },
    },
    edges: [],
    entryNodeId: "submit_1",
  };
}

/**
 * `file.prepare` → `azureOcr.submit`, connected by a normal edge, both with
 * the new empty-binding drop shape. `file.prepare` produces
 * `preparedData: Document`, which is the compatible producer for
 * `azureOcr.submit.fileData: Document`.
 */
function configWithUpstreamPrepare(): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "prepare-then-submit" },
    ctx: {},
    nodes: {
      prep_1: {
        id: "prep_1",
        type: "activity",
        label: "Prepare File",
        activityType: "file.prepare",
        inputs: [],
        outputs: [],
        parameters: {},
      },
      submit_1: {
        id: "submit_1",
        type: "activity",
        label: "Submit OCR",
        activityType: "azureOcr.submit",
        inputs: [],
        outputs: [],
        parameters: {},
      },
    },
    edges: [{ id: "e1", source: "prep_1", target: "submit_1", type: "normal" }],
    entryNodeId: "prep_1",
  };
}

describe("resolveWireableInputRows — de-placeholdered drop", () => {
  it("reports a lone submit node's fileData input as unsatisfied (not ctx-bound)", () => {
    const config = configWithLoneSubmit();
    const rows = resolveWireableInputRows(config, "submit_1");
    const fileData = rows.find((r) => r.port.name === "fileData");
    expect(fileData).toBeDefined();
    expect(fileData?.resolution.status).toBe("unsatisfied");
  });

  it("auto-binds fileData when a compatible upstream Document producer exists", () => {
    const config = configWithUpstreamPrepare();
    const rows = resolveWireableInputRows(config, "submit_1");
    const fileData = rows.find((r) => r.port.name === "fileData");
    expect(fileData).toBeDefined();
    expect(fileData?.resolution.status).toBe("auto-bound");
    if (fileData?.resolution.status === "auto-bound") {
      expect(fileData.resolution.producerNodeId).toBe("prep_1");
      expect(fileData.resolution.producerPort).toBe("preparedData");
    }
  });

  it("resolves a locked auto-key row's producer via the shared resolveWireableInputRows path", () => {
    const config = configWithUpstreamPrepare();
    // Pin fileData to prep_1's auto key so the row resolves "locked".
    const submit = config.nodes.submit_1;
    if (submit.type === "activity") {
      submit.inputs = [
        { port: "fileData", ctxKey: "__auto.prep_1.preparedData" },
      ];
      submit.metadata = { lockedInputPorts: ["fileData"] };
    }
    const rows = resolveWireableInputRows(config, "submit_1");
    const fileData = rows.find((r) => r.port.name === "fileData");
    expect(fileData?.resolution.status).toBe("locked");
    if (fileData?.resolution.status === "locked") {
      expect(fileData.resolution.ctxKey).toBe("__auto.prep_1.preparedData");
    }
  });

  it("regression: a placeholder input binding (ctxKey=portName) would force the misleading ctx-bound state", () => {
    // This documents WHY the drop path must not stamp `ctxKey = portName`:
    // with such a binding + a matching ctx declaration, the honest
    // "unsatisfied" collapses into "ctx-bound" ("from fileData").
    const config = configWithLoneSubmit();
    config.ctx = { fileData: { type: "string" } };
    const submit = config.nodes.submit_1;
    if (submit.type === "activity") {
      submit.inputs = [{ port: "fileData", ctxKey: "fileData" }];
    }
    const rows = resolveWireableInputRows(config, "submit_1");
    const fileData = rows.find((r) => r.port.name === "fileData");
    expect(fileData?.resolution.status).toBe("ctx-bound");
  });
});

describe("optional identifier ports (P-5)", () => {
  /**
   * `file.prepare` declares three optional base-`Artifact` ports. Its optional
   * `modelId` port has kind `ModelId`, which auto-wires, so it is listed with
   * the required ports rather than folded.
   */
  function loneprepare(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "lone-prepare" },
      ctx: {},
      nodes: {
        prep_1: {
          id: "prep_1",
          type: "activity",
          label: "Prepare File",
          activityType: "file.prepare",
          inputs: [],
          outputs: [],
          parameters: {},
        },
      },
      edges: [],
      entryNodeId: "prep_1",
    };
  }

  it("keeps them out of the DEFAULT population (what ConnectSummaryPopover reads)", () => {
    const rows = resolveWireableInputRows(loneprepare(), "prep_1");
    expect(rows.map((r) => r.port.name)).toEqual([
      "documentId",
      "blobKey",
      "modelId",
    ]);
  });

  it("returns them flagged `optional` when the caller opts in", () => {
    const rows = resolveWireableInputRows(loneprepare(), "prep_1", {
      includeOptionalIdentifierPorts: true,
    });
    const optional = rows.filter((r) => r.optional).map((r) => r.port.name);
    expect(optional).toEqual(["fileName", "fileType", "contentType"]);
    expect(rows.filter((r) => !r.optional).map((r) => r.port.name)).toEqual([
      "documentId",
      "blobKey",
      "modelId",
    ]);
  });

  it("carries the catalog description — the placeholder the value field needs", () => {
    const rows = resolveWireableInputRows(loneprepare(), "prep_1", {
      includeOptionalIdentifierPorts: true,
    });
    const fileType = rows.find((r) => r.port.name === "fileType");
    expect(fileType?.port.description).toContain("Auto-detected");
  });

  it("promotes a port out of `optional` the moment it holds something", () => {
    const config = loneprepare();
    config.ctx = { fileTypeConst: { type: "string", defaultValue: "image" } };
    const prep = config.nodes.prep_1;
    if (prep.type === "activity") {
      prep.inputs = [{ port: "fileType", ctxKey: "fileTypeConst" }];
    }
    const rows = resolveWireableInputRows(config, "prep_1", {
      includeOptionalIdentifierPorts: true,
    });
    const fileType = rows.find((r) => r.port.name === "fileType");
    expect(fileType?.optional).toBe(false);
    // Bound optional ports were already in the base population (G-046), so
    // opting in must not change how they resolve.
    expect(fileType?.resolution.status).toBe("ctx-bound");
  });
});

describe("decodeAutoProducerNodeId", () => {
  it("returns the producer nodeId for a standard auto key", () => {
    expect(decodeAutoProducerNodeId("__auto.prep.preparedData")).toBe("prep");
  });

  it("returns null for a non-auto (hand-authored) ctx key", () => {
    expect(decodeAutoProducerNodeId("myVar")).toBeNull();
  });

  it("returns null for an auto key with no port segment", () => {
    expect(decodeAutoProducerNodeId("__auto.prep")).toBeNull();
  });

  it("keeps a dotted nodeId intact (port is the last segment)", () => {
    expect(decodeAutoProducerNodeId("__auto.a.b.preparedData")).toBe("a.b");
  });
});

describe("resolvePinnedSource", () => {
  function configWithProducer(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "t" },
      ctx: {},
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          label: "Prepare",
          activityType: "file.prepare",
        },
      },
      edges: [],
      entryNodeId: "prep",
    };
  }

  it("names the producer label for an auto key whose producer exists", () => {
    expect(
      resolvePinnedSource(configWithProducer(), "__auto.prep.preparedData"),
    ).toEqual({ via: "producer", label: "Prepare" });
  });

  it("falls back to the raw key (still an arrow) when the producer is gone", () => {
    expect(
      resolvePinnedSource(configWithProducer(), "__auto.gone.preparedData"),
    ).toEqual({ via: "producer", label: "__auto.gone.preparedData" });
  });

  it("renders a hand-authored ctx var as 'from', not a fake producer arrow", () => {
    expect(resolvePinnedSource(configWithProducer(), "myVar")).toEqual({
      via: "ctx",
      ctxKey: "myVar",
    });
  });
});

describe("map collection row (G-013)", () => {
  function mapConfig(
    collectionCtxKey: string,
    opts: { locked?: boolean; splitOutputs?: boolean; ctxDecl?: boolean } = {},
  ): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "map-row" },
      ctx: opts.ctxDecl
        ? { incomingSegments: { type: "array", isInput: true } }
        : {},
      nodes: {
        SPLIT: {
          id: "SPLIT",
          type: "activity",
          label: "Split",
          activityType: "document.split",
          ...(opts.splitOutputs
            ? { outputs: [{ port: "segments", ctxKey: collectionCtxKey }] }
            : {}),
        },
        MAP: {
          id: "MAP",
          type: "map",
          label: "Map",
          collectionCtxKey,
          itemCtxKey: "currentSegment",
          bodyEntryNodeId: "BODY",
          bodyExitNodeId: "BODY",
          ...(opts.locked
            ? { metadata: { lockedInputPorts: ["collection"] } }
            : {}),
        },
        BODY: {
          id: "BODY",
          type: "activity",
          label: "Body",
          activityType: "document.classify",
        },
      },
      edges: [{ id: "e", source: "SPLIT", target: "MAP", type: "normal" }],
      entryNodeId: "SPLIT",
    } as GraphWorkflowConfig;
  }

  it("gives the map a single `collection` row", () => {
    const rows = resolveWireableInputRows(mapConfig(""), "MAP");
    expect(rows).toHaveLength(1);
    expect(rows[0].port.name).toBe("collection");
    expect(rows[0].port.label).toBe("Collection");
  });

  it("reports an empty collection as unsatisfied", () => {
    const rows = resolveWireableInputRows(mapConfig(""), "MAP");
    expect(rows[0].resolution.status).toBe("unsatisfied");
  });

  it("reports an auto-wired collection as auto-bound to its producer", () => {
    const rows = resolveWireableInputRows(
      mapConfig("__auto.SPLIT.segments"),
      "MAP",
    );
    expect(rows[0].resolution).toMatchObject({
      status: "auto-bound",
      producerNodeId: "SPLIT",
      producerPort: "segments",
    });
  });

  it("reports a declared workflow input as ctx-bound", () => {
    const rows = resolveWireableInputRows(
      mapConfig("incomingSegments", { ctxDecl: true }),
      "MAP",
    );
    expect(rows[0].resolution).toEqual({
      status: "ctx-bound",
      ctxKey: "incomingSegments",
    });
  });

  it("reports a pinned collection as locked", () => {
    const rows = resolveWireableInputRows(
      mapConfig("mySegments", { locked: true, splitOutputs: true }),
      "MAP",
    );
    expect(rows[0].resolution).toEqual({
      status: "locked",
      ctxKey: "mySegments",
    });
  });

  it("reports a pinned collection whose producer is gone as locked-dangling", () => {
    const rows = resolveWireableInputRows(
      mapConfig("__auto.GONE.segments", { locked: true }),
      "MAP",
    );
    expect(rows[0].resolution).toEqual({
      status: "locked-dangling",
      ctxKey: "__auto.GONE.segments",
    });
  });

  it("reports a pinned-but-empty collection as locked-unbound", () => {
    const rows = resolveWireableInputRows(
      mapConfig("", { locked: true }),
      "MAP",
    );
    expect(rows[0].resolution).toEqual({ status: "locked-unbound" });
  });
});

describe("resolveCtxValueOrigin", () => {
  /**
   * Standard OCR around its poll step: `modelId` is a workflow variable no
   * step writes, so the run starts with it, and `apimRequestId` is written by
   * the submit step.
   */
  function ocrConfig(modelId: CtxDeclaration): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "ocr" },
      ctx: {
        modelId,
        preparedFileData: { type: "object" },
        apimRequestId: { type: "string" },
      },
      nodes: {
        prep: {
          id: "prep",
          type: "activity",
          label: "Prepare File Data",
          activityType: "file.prepare",
          inputs: [{ port: "modelId", ctxKey: "modelId" }],
          outputs: [{ port: "preparedData", ctxKey: "preparedFileData" }],
        },
        submit: {
          id: "submit",
          type: "activity",
          label: "Submit to Azure OCR",
          activityType: "azureOcr.submit",
          inputs: [{ port: "fileData", ctxKey: "preparedFileData" }],
          outputs: [{ port: "apimRequestId", ctxKey: "apimRequestId" }],
        },
        poll: {
          id: "poll",
          type: "pollUntil",
          label: "Poll OCR Results",
          activityType: "azureOcr.poll",
          interval: "10s",
          condition: { operator: "is-not-null", value: { ref: "ocrStatus" } },
          inputs: [
            { port: "apimRequestId", ctxKey: "apimRequestId" },
            { port: "modelId", ctxKey: "modelId" },
          ],
          metadata: { lockedInputPorts: ["apimRequestId", "modelId"] },
        },
      },
      edges: [
        { id: "e1", source: "prep", target: "submit", type: "normal" },
        { id: "e2", source: "submit", target: "poll", type: "normal" },
      ],
      entryNodeId: "prep",
    };
  }

  /**
   * Standard OCR (SDPR)'s cleanup chain: each step reads `ocrResultRef` and
   * the middle two write it back. The zero-recovery step has no catalog
   * entry; the engine writes by binding, so its write counts all the same.
   */
  function rewriteChainConfig(): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: { name: "chain" },
      ctx: { ocrResultRef: { type: "object" } },
      nodes: {
        extract: {
          id: "extract",
          type: "activity",
          label: "Extract OCR Results",
          activityType: "azureOcr.extract",
          outputs: [{ port: "ocrResult", ctxKey: "ocrResultRef" }],
        },
        recover: {
          id: "recover",
          type: "activity",
          label: "Recover Numeric Zeros from Checkboxes",
          activityType: "ocr.recoverNumericZerosFromCheckboxes",
          inputs: [{ port: "ocrResult", ctxKey: "ocrResultRef" }],
          outputs: [{ port: "ocrResult", ctxKey: "ocrResultRef" }],
        },
        normalize: {
          id: "normalize",
          type: "activity",
          label: "Normalize Fields",
          activityType: "ocr.normalizeFields",
          inputs: [{ port: "ocrResult", ctxKey: "ocrResultRef" }],
          outputs: [{ port: "ocrResult", ctxKey: "ocrResultRef" }],
        },
        cleanup: {
          id: "cleanup",
          type: "activity",
          label: "Post-OCR Cleanup",
          activityType: "ocr.cleanup",
          inputs: [{ port: "ocrResult", ctxKey: "ocrResultRef" }],
        },
      },
      edges: [
        { id: "e1", source: "extract", target: "recover", type: "normal" },
        { id: "e2", source: "recover", target: "normalize", type: "normal" },
        { id: "e3", source: "normalize", target: "cleanup", type: "normal" },
      ],
      entryNodeId: "extract",
    };
  }

  it("names the step that writes the variable", () => {
    const config = ocrConfig({ type: "string" });
    expect(resolveCtxValueOrigin(config, "apimRequestId", "poll")).toEqual({
      from: "step",
      labels: ["Submit to Azure OCR"],
    });
  });

  it("reports a variable no step writes as set when the run starts, with its default", () => {
    const config = ocrConfig({
      type: "string",
      defaultValue: "sdpr_synth_test",
    });
    expect(resolveCtxValueOrigin(config, "modelId", "poll")).toEqual({
      from: "run-start",
      defaultValue: "sdpr_synth_test",
    });
  });

  it("reports no default when the declaration has none", () => {
    const config = ocrConfig({ type: "string" });
    expect(resolveCtxValueOrigin(config, "modelId", "poll")).toEqual({
      from: "run-start",
      defaultValue: null,
    });
  });

  it("formats a non-string default the way the variables list does", () => {
    const config = ocrConfig({ type: "number", defaultValue: 0.95 });
    expect(resolveCtxValueOrigin(config, "modelId", "poll")).toEqual({
      from: "run-start",
      defaultValue: "0.95",
    });
  });

  it("reads a rewritten variable from its last write before the step", () => {
    const config = rewriteChainConfig();
    expect(resolveCtxValueOrigin(config, "ocrResultRef", "cleanup")).toEqual({
      from: "step",
      labels: ["Normalize Fields"],
    });
    // A step that reads and rewrites the variable reads the write before it.
    expect(resolveCtxValueOrigin(config, "ocrResultRef", "normalize")).toEqual({
      from: "step",
      labels: ["Recover Numeric Zeros from Checkboxes"],
    });
    expect(resolveCtxValueOrigin(config, "ocrResultRef", "recover")).toEqual({
      from: "step",
      labels: ["Extract OCR Results"],
    });
  });

  it("names each path's last writer where branches meet", () => {
    // Persist Review Plan writes `reviewNote`. The run then either goes
    // through Human Review, which rewrites it, or straight to the hand-off.
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: { name: "branches" },
      ctx: { reviewNote: { type: "string" } },
      nodes: {
        plan: {
          id: "plan",
          type: "activity",
          label: "Persist Review Plan",
          activityType: "document.updateStatus",
          outputs: [{ port: "note", ctxKey: "reviewNote" }],
        },
        decide: {
          id: "decide",
          type: "activity",
          label: "Decide",
          activityType: "document.updateStatus",
        },
        review: {
          id: "review",
          type: "activity",
          label: "Human Review",
          activityType: "document.updateStatus",
          outputs: [{ port: "note", ctxKey: "reviewNote" }],
        },
        handoff: {
          id: "handoff",
          type: "activity",
          label: "Hand-off",
          activityType: "document.updateStatus",
          inputs: [{ port: "note", ctxKey: "reviewNote" }],
        },
      },
      edges: [
        { id: "e1", source: "plan", target: "decide", type: "normal" },
        { id: "e2", source: "decide", target: "review", type: "normal" },
        { id: "e3", source: "review", target: "handoff", type: "normal" },
        { id: "e4", source: "decide", target: "handoff", type: "normal" },
      ],
      entryNodeId: "plan",
    };
    expect(resolveCtxValueOrigin(config, "reviewNote", "handoff")).toEqual({
      from: "step",
      labels: ["Human Review", "Persist Review Plan"],
    });
  });

  it("ignores a writer that only runs after the step: the variable still holds what the run started with", () => {
    const config = ocrConfig({ type: "string" });
    expect(resolveCtxValueOrigin(config, "apimRequestId", "prep")).toEqual({
      from: "run-start",
      defaultValue: null,
    });
  });

  it("returns null when the only writer runs after the step and nothing declares the variable", () => {
    const config = ocrConfig({ type: "string" });
    delete config.ctx.apimRequestId;
    expect(resolveCtxValueOrigin(config, "apimRequestId", "prep")).toBeNull();
  });

  it("names a control-flow writer, such as the map that sets each item", () => {
    const config = {
      schemaVersion: "1.0",
      metadata: { name: "map" },
      ctx: { segments: { type: "array", isInput: true } },
      nodes: {
        MAP: {
          id: "MAP",
          type: "map",
          label: "For each segment",
          collectionCtxKey: "segments",
          itemCtxKey: "currentSegment",
          bodyEntryNodeId: "BODY",
          bodyExitNodeId: "BODY",
        },
        BODY: {
          id: "BODY",
          type: "activity",
          label: "Classify",
          activityType: "document.classify",
          inputs: [{ port: "segment", ctxKey: "currentSegment" }],
        },
      },
      edges: [],
      entryNodeId: "MAP",
    } as GraphWorkflowConfig;
    expect(resolveCtxValueOrigin(config, "currentSegment", "BODY")).toEqual({
      from: "step",
      labels: ["For each segment"],
    });
  });

  it("returns null for a variable nothing writes or declares", () => {
    const config = ocrConfig({ type: "string" });
    expect(resolveCtxValueOrigin(config, "nowhere", "poll")).toBeNull();
  });
});

describe("describeCtxValueOrigin", () => {
  it("names the writing step", () => {
    expect(
      describeCtxValueOrigin({ from: "step", labels: ["Submit to Azure OCR"] }),
    ).toBe("Written by Submit to Azure OCR.");
  });

  it("lists each path's writer", () => {
    expect(describeCtxValueOrigin({ from: "step", labels: ["A", "B"] })).toBe(
      "Written by A or B.",
    );
    expect(
      describeCtxValueOrigin({ from: "step", labels: ["A", "B", "C"] }),
    ).toBe("Written by A, B or C.");
  });

  it("gives the default a run falls back to", () => {
    expect(
      describeCtxValueOrigin({
        from: "run-start",
        defaultValue: "sdpr_synth_test",
      }),
    ).toBe(
      "Set when the run starts, e.g. by the upload request. Default: sdpr_synth_test.",
    );
  });

  it("says the run must supply a variable with no default", () => {
    expect(
      describeCtxValueOrigin({ from: "run-start", defaultValue: null }),
    ).toBe(
      "Set when the run starts, e.g. by the upload request. No default, so the run must supply it.",
    );
  });

  it("shows an empty-string default as (empty)", () => {
    expect(
      describeCtxValueOrigin({ from: "run-start", defaultValue: "" }),
    ).toBe(
      "Set when the run starts, e.g. by the upload request. Default: (empty).",
    );
  });
});
