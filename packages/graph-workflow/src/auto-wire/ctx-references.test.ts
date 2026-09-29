// packages/graph-workflow/src/auto-wire/ctx-references.test.ts
//
// G-009 — "what else reads this variable?" The writer half already existed
// (`collectCtxWriters` / `nodeTypeCtxWrites`); these cover the reader half
// and the combined blast-radius lookup an author needs BEFORE renaming or
// deleting a ctx key.
import type { GraphNode, GraphWorkflowConfig } from "../types";
import { collectCtxReaders, findCtxKeyReferences } from "./ctx-references";

function makeConfig(
  nodes: Record<string, GraphNode>,
  ctx: GraphWorkflowConfig["ctx"] = {},
): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes,
    edges: [],
    entryNodeId: Object.keys(nodes)[0] ?? "",
    ctx,
  };
}

describe("collectCtxReaders", () => {
  it("reports an activity input binding", () => {
    const cfg = makeConfig({
      a: {
        id: "a",
        type: "activity",
        label: "Submit",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedFile" }],
      },
    });
    expect(collectCtxReaders(cfg)).toEqual([
      {
        nodeId: "a",
        via: "input",
        port: "fileData",
        ref: "preparedFile",
      },
    ]);
  });

  it("reports a map's collection, a childWorkflow input mapping and both condition families", () => {
    const cfg = makeConfig({
      m: {
        id: "m",
        type: "map",
        label: "Each page",
        collectionCtxKey: "pages",
        itemCtxKey: "page",
        bodyEntryNodeId: "a",
        bodyExitNodeId: "a",
      },
      c: {
        id: "c",
        type: "childWorkflow",
        label: "Child",
        workflowRef: { type: "library", workflowId: "w1" },
        inputMappings: [{ port: "doc", ctxKey: "preparedFile" }],
        outputMappings: [{ port: "out", ctxKey: "childResult" }],
      },
      s: {
        id: "s",
        type: "switch",
        label: "Branch",
        cases: [
          {
            condition: {
              operator: "equals",
              left: { ref: "ctx.status" },
              right: { literal: "done" },
            },
            edgeId: "e1",
          },
        ],
      },
      p: {
        id: "p",
        type: "pollUntil",
        label: "Wait",
        activityType: "azureOcr.getResult",
        interval: "30s",
        condition: {
          operator: "is-not-null",
          value: { ref: "ocrResult.analyzeResult" },
        },
      },
    });

    const readers = collectCtxReaders(cfg);
    expect(readers).toContainEqual({
      nodeId: "m",
      via: "map-collection",
      port: "collection",
      ref: "pages",
    });
    expect(readers).toContainEqual({
      nodeId: "c",
      via: "child-input",
      port: "doc",
      ref: "preparedFile",
    });
    expect(readers).toContainEqual({
      nodeId: "s",
      via: "condition",
      port: "cases[0].condition",
      ref: "ctx.status",
    });
    expect(readers).toContainEqual({
      nodeId: "p",
      via: "condition",
      port: "condition",
      ref: "ocrResult.analyzeResult",
    });
    // `outputMappings` is a WRITE, not a read.
    expect(readers.some((r) => r.ref === "childResult")).toBe(false);
  });
});

describe("findCtxKeyReferences", () => {
  const cfg = makeConfig(
    {
      prep: {
        id: "prep",
        type: "activity",
        label: "Prepare",
        activityType: "file.prepare",
        outputs: [{ port: "preparedData", ctxKey: "preparedFile" }],
      },
      submit: {
        id: "submit",
        type: "activity",
        label: "Submit",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedFile" }],
      },
      poll: {
        id: "poll",
        type: "pollUntil",
        label: "Wait",
        activityType: "azureOcr.getResult",
        interval: "30s",
        condition: {
          operator: "is-not-null",
          // Drilled reference — still a read of `preparedFile`.
          value: { ref: "preparedFile.mimeType" },
        },
      },
    },
    { preparedFile: { type: "object" } },
  );

  it("reports what reads a given ctx variable", () => {
    const refs = findCtxKeyReferences(cfg, "preparedFile");
    expect(refs.readers.map((r) => r.nodeId).sort()).toEqual([
      "poll",
      "submit",
    ]);
    expect(refs.readers.find((r) => r.nodeId === "submit")).toMatchObject({
      via: "input",
      port: "fileData",
    });
  });

  it("reports what writes it", () => {
    const refs = findCtxKeyReferences(cfg, "preparedFile");
    expect(refs.writers).toEqual([
      {
        nodeId: "prep",
        port: "preparedData",
        ctxKey: "preparedFile",
        kind: "PreparedFile",
      },
    ]);
    expect(refs.declared).toBe(true);
  });

  it("says so when nothing references it", () => {
    const refs = findCtxKeyReferences(cfg, "ghostKey");
    expect(refs.readers).toEqual([]);
    expect(refs.writers).toEqual([]);
    expect(refs.declared).toBe(false);
    expect(refs.total).toBe(0);
  });

  it("normalises the `ctx.` namespace on both sides of the match", () => {
    const namespaced = makeConfig({
      s: {
        id: "s",
        type: "switch",
        label: "Branch",
        cases: [
          {
            condition: {
              operator: "equals",
              left: { ref: "ctx.status" },
              right: { literal: "done" },
            },
            edgeId: "e1",
          },
        ],
      },
    });
    expect(findCtxKeyReferences(namespaced, "status").readers).toHaveLength(1);
    expect(findCtxKeyReferences(namespaced, "ctx.status").readers).toHaveLength(
      1,
    );
  });

  it("does not match a key that merely shares a prefix", () => {
    const cousin = makeConfig({
      a: {
        id: "a",
        type: "activity",
        label: "A",
        activityType: "azureOcr.submit",
        inputs: [{ port: "fileData", ctxKey: "preparedFileBackup" }],
      },
    });
    expect(findCtxKeyReferences(cousin, "preparedFile").readers).toEqual([]);
  });
});
