/**
 * §4.8: renameCtxKeyInConfig must rewrite every ctx-key reference across the
 * graph, not just node inputs/outputs.
 */

import { nodeTypeCtxWrites } from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import type {
  GraphNode,
  GraphWorkflowConfig,
  NodeType,
} from "../../../types/workflow";
import { renameCtxKeyInConfig } from "./rename-ctx-key";

function baseConfig(nodes: GraphWorkflowConfig["nodes"]): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: {},
    entryNodeId: Object.keys(nodes)[0] ?? "",
    ctx: { oldKey: { type: "string" }, other: { type: "number" } },
    nodes,
    edges: [],
  };
}

describe("renameCtxKeyInConfig", () => {
  it("renames the ctx declaration (preserving order) and node inputs/outputs", () => {
    const config = baseConfig({
      a: {
        id: "a",
        type: "activity",
        label: "A",
        activityType: "test.noop",
        inputs: [{ port: "in", ctxKey: "oldKey" }],
        outputs: [{ port: "out", ctxKey: "oldKey" }],
      },
    });

    const next = renameCtxKeyInConfig(config, "oldKey", "newKey");

    expect(Object.keys(next.ctx)).toEqual(["newKey", "other"]);
    const a = next.nodes.a;
    expect(a.inputs?.[0].ctxKey).toBe("newKey");
    expect(a.outputs?.[0].ctxKey).toBe("newKey");
  });

  it("rewrites map collection/item/index ctx keys", () => {
    const config = baseConfig({
      m: {
        id: "m",
        type: "map",
        label: "M",
        collectionCtxKey: "oldKey",
        itemCtxKey: "oldKey",
        indexCtxKey: "oldKey",
        bodyEntryNodeId: "",
        bodyExitNodeId: "",
      },
    });

    const m = renameCtxKeyInConfig(config, "oldKey", "newKey").nodes.m;
    if (m.type !== "map") throw new Error("expected map");
    expect(m.collectionCtxKey).toBe("newKey");
    expect(m.itemCtxKey).toBe("newKey");
    expect(m.indexCtxKey).toBe("newKey");
  });

  it("rewrites join.resultsCtxKey", () => {
    const config = baseConfig({
      j: {
        id: "j",
        type: "join",
        label: "J",
        sourceMapNodeId: "m",
        strategy: "all",
        resultsCtxKey: "oldKey",
      },
    });

    const j = renameCtxKeyInConfig(config, "oldKey", "newKey").nodes.j;
    if (j.type !== "join") throw new Error("expected join");
    expect(j.resultsCtxKey).toBe("newKey");
  });

  it("rewrites childWorkflow input/output mappings", () => {
    const config = baseConfig({
      c: {
        id: "c",
        type: "childWorkflow",
        label: "C",
        workflowRef: { type: "library", workflowId: "lib" },
        inputMappings: [{ port: "in", ctxKey: "oldKey" }],
        outputMappings: [{ port: "out", ctxKey: "oldKey" }],
      },
    });

    const c = renameCtxKeyInConfig(config, "oldKey", "newKey").nodes.c;
    if (c.type !== "childWorkflow") throw new Error("expected childWorkflow");
    expect(c.inputMappings?.[0].ctxKey).toBe("newKey");
    expect(c.outputMappings?.[0].ctxKey).toBe("newKey");
  });

  it("leaves childWorkflow mapping PORTS alone — they name the child's ctx, not ours", () => {
    // `inputMappings[].port` is the key written into the CHILD's initialCtx
    // and `outputMappings[].port` is the child's output port; only `ctxKey`
    // lives in this graph's namespace. Renaming a port here would silently
    // repoint the call at a different child input.
    const config = baseConfig({
      c: {
        id: "c",
        type: "childWorkflow",
        label: "C",
        workflowRef: { type: "library", workflowId: "lib" },
        inputMappings: [{ port: "oldKey", ctxKey: "oldKey" }],
        outputMappings: [{ port: "oldKey", ctxKey: "oldKey" }],
      },
    });

    const c = renameCtxKeyInConfig(config, "oldKey", "newKey").nodes.c;
    if (c.type !== "childWorkflow") throw new Error("expected childWorkflow");
    expect(c.inputMappings?.[0]).toEqual({ port: "oldKey", ctxKey: "newKey" });
    expect(c.outputMappings?.[0]).toEqual({ port: "oldKey", ctxKey: "newKey" });
  });

  // -------------------------------------------------------------------
  // G-008: source nodes produce ctx keys from their `parameters`, and the
  // sweep had no `source` case at all.
  // -------------------------------------------------------------------
  it("renames a key produced by a source node (source.upload)", () => {
    const config = baseConfig({
      s: {
        id: "s",
        type: "source",
        label: "Upload",
        sourceType: "source.upload",
        parameters: { ctxKey: "oldKey", maxFileSizeMB: 25 },
      },
    });

    const s = renameCtxKeyInConfig(config, "oldKey", "newKey").nodes.s;
    if (s.type !== "source") throw new Error("expected source");
    expect(s.parameters).toEqual({ ctxKey: "newKey", maxFileSizeMB: 25 });
  });

  it("materialises the implicit source.upload default when that key is renamed", () => {
    // No `ctxKey` parameter — the node still writes `documentUrl`. Renaming
    // it has to write the parameter, or the producer never moves.
    const config = baseConfig({
      s: {
        id: "s",
        type: "source",
        label: "Upload",
        sourceType: "source.upload",
        parameters: { maxFileSizeMB: 25 },
      },
    });

    const s = renameCtxKeyInConfig(config, "documentUrl", "docUrl").nodes.s;
    if (s.type !== "source") throw new Error("expected source");
    expect(s.parameters).toEqual({ ctxKey: "docUrl", maxFileSizeMB: 25 });
  });

  it("renames a key produced by a source node (source.api field)", () => {
    const config = baseConfig({
      s: {
        id: "s",
        type: "source",
        label: "API",
        sourceType: "source.api",
        parameters: {
          fields: [
            { name: "oldKey", kind: "Artifact" },
            { name: "other", kind: "Artifact" },
          ],
        },
      },
    });

    const s = renameCtxKeyInConfig(config, "oldKey", "newKey").nodes.s;
    if (s.type !== "source") throw new Error("expected source");
    expect(s.parameters).toEqual({
      fields: [
        { name: "newKey", kind: "Artifact" },
        { name: "other", kind: "Artifact" },
      ],
    });
  });

  it("rewrites ValueRef refs inside switch and pollUntil conditions (incl. dotted paths)", () => {
    const config = baseConfig({
      s: {
        id: "s",
        type: "switch",
        label: "S",
        cases: [
          {
            edgeId: "e1",
            condition: {
              operator: "equals",
              left: { ref: "oldKey.category" },
              right: { literal: "invoice" },
            },
          },
        ],
      },
      p: {
        id: "p",
        type: "pollUntil",
        label: "P",
        activityType: "test.poll",
        interval: "5s",
        condition: {
          operator: "is-not-null",
          value: { ref: "oldKey" },
        },
      },
    });

    const next = renameCtxKeyInConfig(config, "oldKey", "newKey");
    const s = next.nodes.s;
    const p = next.nodes.p;
    if (s.type !== "switch") throw new Error("expected switch");
    if (p.type !== "pollUntil") throw new Error("expected pollUntil");
    const left =
      s.cases[0].condition.operator === "equals"
        ? (s.cases[0].condition as { left: { ref?: string } }).left
        : undefined;
    // Dotted path rooted at the renamed key is rewritten.
    expect(left?.ref).toBe("newKey.category");
    const val = (p.condition as { value: { ref?: string } }).value;
    expect(val.ref).toBe("newKey");
  });

  // ---------------------------------------------------------------------
  // G-008 regression floor. The bug was not "the source case was missing" —
  // it was "a case could go missing unnoticed". This fixture table is the
  // guard:
  //
  //  - It is keyed by `NodeType`, so adding a node type to the union without
  //    deciding what rename does for it fails `npm run type-check` (and the
  //    `never` check inside `renameNode` fails at the same time).
  //  - Every fixture is driven through `nodeTypeCtxWrites` — the shared
  //    enumeration of what each node type PRODUCES, hardened in batches 2
  //    and 4 — so if that enumeration grows a write the rename doesn't
  //    cover, this test fails at runtime.
  // ---------------------------------------------------------------------
  interface NodeTypeFixture {
    /** A node of this type whose ctx references all point at `oldKey`. */
    node: GraphNode;
    /**
     * The ctx keys `nodeTypeCtxWrites` must report AFTER renaming
     * `oldKey` → `newKey`. Anything still reading `oldKey` is a stranded
     * producer.
     */
    writesAfterRename: string[];
    /** Assertions for ctx this node type READS rather than writes. */
    assertReads?: (node: GraphNode) => void;
  }

  const NODE_TYPE_FIXTURES: Record<NodeType, NodeTypeFixture> = {
    // Writes nothing by type; ctx lives entirely in the shared bindings.
    activity: {
      node: {
        id: "n",
        type: "activity",
        label: "A",
        activityType: "test.noop",
        inputs: [{ port: "in", ctxKey: "oldKey" }],
        outputs: [{ port: "out", ctxKey: "oldKey" }],
      },
      writesAfterRename: [],
      assertReads: (n) => {
        expect(n.inputs?.[0].ctxKey).toBe("newKey");
        expect(n.outputs?.[0].ctxKey).toBe("newKey");
      },
    },
    // Selects an edge; writes no ctx. Reads through its case conditions.
    switch: {
      node: {
        id: "n",
        type: "switch",
        label: "S",
        cases: [
          {
            edgeId: "e1",
            condition: {
              operator: "is-not-null",
              value: { ref: "oldKey" },
            },
          },
        ],
      },
      writesAfterRename: [],
      assertReads: (n) => {
        if (n.type !== "switch") throw new Error("expected switch");
        expect(
          (n.cases[0].condition as { value: { ref?: string } }).value.ref,
        ).toBe("newKey");
      },
    },
    map: {
      node: {
        id: "n",
        type: "map",
        label: "M",
        collectionCtxKey: "oldKey",
        itemCtxKey: "oldKey",
        indexCtxKey: "oldKey",
        bodyEntryNodeId: "",
        bodyExitNodeId: "",
      },
      writesAfterRename: ["newKey", "newKey"],
      assertReads: (n) => {
        if (n.type !== "map") throw new Error("expected map");
        expect(n.collectionCtxKey).toBe("newKey");
      },
    },
    join: {
      node: {
        id: "n",
        type: "join",
        label: "J",
        sourceMapNodeId: "m",
        strategy: "all",
        resultsCtxKey: "oldKey",
      },
      writesAfterRename: ["newKey"],
    },
    childWorkflow: {
      node: {
        id: "n",
        type: "childWorkflow",
        label: "C",
        workflowRef: { type: "library", workflowId: "lib" },
        inputMappings: [{ port: "childIn", ctxKey: "oldKey" }],
        outputMappings: [{ port: "childOut", ctxKey: "oldKey" }],
      },
      writesAfterRename: ["newKey"],
      assertReads: (n) => {
        if (n.type !== "childWorkflow") throw new Error("expected child");
        expect(n.inputMappings?.[0].ctxKey).toBe("newKey");
      },
    },
    pollUntil: {
      node: {
        id: "n",
        type: "pollUntil",
        label: "P",
        activityType: "test.poll",
        interval: "5s",
        condition: { operator: "is-not-null", value: { ref: "oldKey" } },
        outputs: [{ port: "out", ctxKey: "oldKey" }],
      },
      writesAfterRename: [],
      assertReads: (n) => {
        if (n.type !== "pollUntil") throw new Error("expected pollUntil");
        expect((n.condition as { value: { ref?: string } }).value.ref).toBe(
          "newKey",
        );
        expect(n.outputs?.[0].ctxKey).toBe("newKey");
      },
    },
    // The executor writes `<nodeId>Payload`, derived from the node id. There
    // is nothing stored to rewrite, so the key is deliberately NOT renamed —
    // the write stays `nPayload` no matter what is renamed. Asserted rather
    // than omitted so nobody "fixes" it into a broken reference.
    humanGate: {
      node: {
        id: "n",
        type: "humanGate",
        label: "H",
        signal: { name: "humanApproval" },
        timeout: "1h",
        onTimeout: "fail",
        inputs: [{ port: "in", ctxKey: "oldKey" }],
      },
      writesAfterRename: ["nPayload"],
      assertReads: (n) => {
        expect(n.inputs?.[0].ctxKey).toBe("newKey");
      },
    },
    // The G-008 gap itself.
    source: {
      node: {
        id: "n",
        type: "source",
        label: "Src",
        sourceType: "source.api",
        parameters: { fields: [{ name: "oldKey" }] },
      },
      writesAfterRename: ["newKey"],
    },
  };

  it.each(
    Object.keys(NODE_TYPE_FIXTURES) as NodeType[],
  )("renames every ctx key nodeTypeCtxWrites reports for a %s node", (nodeType) => {
    const fixture = NODE_TYPE_FIXTURES[nodeType];
    const config = baseConfig({ n: fixture.node });

    const renamed = renameCtxKeyInConfig(config, "oldKey", "newKey").nodes.n;

    expect(nodeTypeCtxWrites("n", renamed).map((w) => w.ctxKey)).toEqual(
      fixture.writesAfterRename,
    );
    fixture.assertReads?.(renamed);
  });

  it("leaves unrelated keys and literals untouched", () => {
    const config = baseConfig({
      a: {
        id: "a",
        type: "activity",
        label: "A",
        activityType: "test.noop",
        inputs: [{ port: "in", ctxKey: "other" }],
      },
    });

    const a = renameCtxKeyInConfig(config, "oldKey", "newKey").nodes.a;
    expect(a.inputs?.[0].ctxKey).toBe("other");
  });
});
