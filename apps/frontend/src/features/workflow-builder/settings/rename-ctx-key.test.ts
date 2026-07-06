/**
 * §4.8: renameCtxKeyInConfig must rewrite every ctx-key reference across the
 * graph, not just node inputs/outputs.
 */

import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
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
