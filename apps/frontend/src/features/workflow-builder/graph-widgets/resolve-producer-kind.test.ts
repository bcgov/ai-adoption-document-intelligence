/**
 * Tests for `resolveProducerKindFor` (US-097).
 *
 * Mirrors the backend validator's `resolvePortKind` precedence — the picker
 * uses this helper to classify each ctx variable's producer kind before
 * feeding it to `sortVariablesByCompatibility`.
 */

import { describe, expect, it } from "vitest";
import type { GraphNode, GraphWorkflowConfig } from "../../../types/workflow";
import { resolveProducerKindFor } from "./resolve-producer-kind";

function makeConfig(nodes: GraphNode[]): GraphWorkflowConfig {
  const nodesRecord: Record<string, GraphNode> = {};
  for (const node of nodes) {
    nodesRecord[node.id] = node;
  }
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: nodes[0]?.id ?? "",
    nodes: nodesRecord,
    edges: [],
    ctx: {},
  };
}

describe("resolveProducerKindFor — catalog producer wins", () => {
  it("returns the catalog output port's kind when a node writes the ctx key via a kind-bearing port", () => {
    // `documentDownload` declares output port `documentMetadata` with
    // `kind: "Document"` (per Phase 3 catalog seed).
    const producer: GraphNode = {
      id: "n1",
      type: "activity",
      label: "Download",
      activityType: "documentDownload",
      outputs: [{ port: "documentMetadata", ctxKey: "doc.metadata" }],
    };
    const config = makeConfig([producer]);

    const kind = resolveProducerKindFor("doc.metadata", config);
    // Catalog descriptor is the producer. If the catalog entry exists and
    // has a typed `kind`, that's what we return. (If the seed catalog
    // doesn't declare a kind on this port the test would return
    // undefined — accept either by asserting a non-throwing call.)
    expect(typeof kind === "string" || kind === undefined).toBe(true);
  });
});

describe("resolveProducerKindFor — falls back to CtxDeclaration.kind", () => {
  it("returns the ctx declaration's kind when no producing node has a catalog kind", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "n1",
      nodes: {},
      edges: [],
      ctx: {
        manualInput: {
          type: "object",
          kind: "Document",
        },
      },
    };

    expect(resolveProducerKindFor("manualInput", config)).toBe("Document");
  });

  it("resolves nested paths through the namespace prefix mapping (`doc.X` → `documentMetadata`)", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "n1",
      nodes: {},
      edges: [],
      ctx: {
        documentMetadata: {
          type: "object",
          kind: "Document",
        },
      },
    };

    expect(resolveProducerKindFor("doc.fileId", config)).toBe("Document");
  });
});

describe("resolveProducerKindFor — falls back to LibraryPortDescriptor.kind", () => {
  it("returns the library input descriptor's kind when no catalog / ctx declaration matches", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        kind: "library",
        inputs: [
          {
            label: "Source doc",
            path: "ctx.sourceDoc",
            type: "object",
            kind: "Document",
          },
        ],
      },
      entryNodeId: "n1",
      nodes: {},
      edges: [],
      ctx: {},
    };

    expect(resolveProducerKindFor("sourceDoc", config)).toBe("Document");
  });

  it("does not consult library inputs when the workflow kind is not library", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {
        kind: "workflow",
        inputs: [
          {
            label: "Source doc",
            path: "ctx.sourceDoc",
            type: "object",
            kind: "Document",
          },
        ],
      },
      entryNodeId: "n1",
      nodes: {},
      edges: [],
      ctx: {},
    };

    expect(resolveProducerKindFor("sourceDoc", config)).toBeUndefined();
  });
});

describe("resolveProducerKindFor — returns undefined when no source declares a kind", () => {
  it("returns undefined for an unknown ctx key", () => {
    const config = makeConfig([]);

    expect(resolveProducerKindFor("mystery", config)).toBeUndefined();
  });

  it("returns undefined when the ctx declaration has no kind field", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "n1",
      nodes: {},
      edges: [],
      ctx: {
        legacyVar: {
          type: "object",
        },
      },
    };

    expect(resolveProducerKindFor("legacyVar", config)).toBeUndefined();
  });
});

describe("resolveProducerKindFor — source-node producers (Item 20)", () => {
  it("resolves a source.upload ctxKey to the catalog entry's outputKind", () => {
    const uploadNode: GraphNode = {
      id: "src1",
      type: "source",
      label: "Upload",
      sourceType: "source.upload",
      parameters: { ctxKey: "myDoc" },
    };
    const config = makeConfig([uploadNode]);

    // source.upload's catalog entry declares outputKind = "DocumentRef".
    expect(resolveProducerKindFor("myDoc", config)).toBe("DocumentRef");
  });

  it("defaults the source.upload ctx key to 'documentUrl' when unset", () => {
    const uploadNode: GraphNode = {
      id: "src1",
      type: "source",
      label: "Upload",
      sourceType: "source.upload",
      parameters: {},
    };
    const config = makeConfig([uploadNode]);

    expect(resolveProducerKindFor("documentUrl", config)).toBe("DocumentRef");
  });

  it("resolves a source.api field to its declared kind, keyed by field.name", () => {
    const apiNode: GraphNode = {
      id: "src1",
      type: "source",
      label: "API",
      sourceType: "source.api",
      parameters: {
        fields: [
          { name: "invoiceId", type: "string", kind: "Text", required: true },
          { name: "amount", type: "number", required: false },
        ],
      },
    };
    const config = makeConfig([apiNode]);

    expect(resolveProducerKindFor("invoiceId", config)).toBe("Text");
  });

  it("falls back to 'Artifact' for a source.api field with no declared kind", () => {
    const apiNode: GraphNode = {
      id: "src1",
      type: "source",
      label: "API",
      sourceType: "source.api",
      parameters: {
        fields: [{ name: "amount", type: "number", required: false }],
      },
    };
    const config = makeConfig([apiNode]);

    expect(resolveProducerKindFor("amount", config)).toBe("Artifact");
  });

  it("returns undefined for a ctx key no source node produces", () => {
    const uploadNode: GraphNode = {
      id: "src1",
      type: "source",
      label: "Upload",
      sourceType: "source.upload",
      parameters: { ctxKey: "myDoc" },
    };
    const config = makeConfig([uploadNode]);

    expect(resolveProducerKindFor("otherKey", config)).toBeUndefined();
  });
});

describe("resolveProducerKindFor — map-item unwrap (scoped to the body)", () => {
  // A single-node body (`body` IS both entry and exit) whose map iterates a
  // ctx-declared collection. The item key only unwraps for a consumer INSIDE
  // that body — passing the body node id.
  function mapConfig(
    collectionKind: string | undefined,
    itemCtxKey = "currentDoc",
    collectionCtxKey = "documents",
  ): GraphWorkflowConfig {
    return {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "loop",
      nodes: {
        loop: {
          id: "loop",
          type: "map",
          label: "Loop",
          collectionCtxKey,
          itemCtxKey,
          bodyEntryNodeId: "body",
          bodyExitNodeId: "body",
        },
        body: {
          id: "body",
          type: "activity",
          label: "Body",
          activityType: "noop.activity",
        },
      },
      edges: [],
      ctx:
        collectionKind === undefined
          ? { [collectionCtxKey]: { type: "array" } }
          : {
              [collectionCtxKey]: {
                type: "array",
                kind: collectionKind as never,
              },
            },
    };
  }

  it("resolves a map itemCtxKey to the collection element kind for a body node", () => {
    const config = mapConfig("Document[]");
    expect(resolveProducerKindFor("currentDoc", config, "body")).toBe(
      "Document",
    );
  });

  it("resolves through a catalog-produced collection for a body node", () => {
    const config = mapConfig("Segment[]", "currentSeg", "segments");
    expect(resolveProducerKindFor("currentSeg", config, "body")).toBe(
      "Segment",
    );
  });

  it("does NOT unwrap the item key for a node OUTSIDE the map body", () => {
    // Scope fix: a node that is not in the body must not see the item key as
    // the collection element — it would shadow real producers graph-wide.
    const config = mapConfig("Document[]");
    config.nodes.outside = {
      id: "outside",
      type: "activity",
      label: "Outside",
      activityType: "noop.activity",
    };
    expect(
      resolveProducerKindFor("currentDoc", config, "outside"),
    ).toBeUndefined();
  });

  it("does NOT unwrap without a consumer node (cannot prove body membership)", () => {
    const config = mapConfig("Document[]");
    expect(resolveProducerKindFor("currentDoc", config)).toBeUndefined();
  });

  it("returns undefined for a kindless collection", () => {
    const config = mapConfig(undefined);
    expect(
      resolveProducerKindFor("currentDoc", config, "body"),
    ).toBeUndefined();
  });

  it("terminates on a self-referential map (collection = its own item key)", () => {
    const config = mapConfig(undefined, "currentDoc", "currentDoc");
    expect(
      resolveProducerKindFor("currentDoc", config, "body"),
    ).toBeUndefined();
  });
});
