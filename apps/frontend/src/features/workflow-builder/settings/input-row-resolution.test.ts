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
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  decodeAutoProducerNodeId,
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
  /** `file.prepare` declares three optional base-`Artifact` ports. */
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
    expect(rows.map((r) => r.port.name)).toEqual(["documentId", "blobKey"]);
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
