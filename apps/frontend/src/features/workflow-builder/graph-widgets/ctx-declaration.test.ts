import { describe, expect, it } from "vitest";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { declareCtxKey } from "./ctx-declaration";

function baseConfig(ctx: GraphWorkflowConfig["ctx"] = {}): GraphWorkflowConfig {
  return {
    schemaVersion: "1.0",
    metadata: { name: "t" },
    nodes: {},
    edges: [],
    entryNodeId: "",
    ctx,
  };
}

describe("declareCtxKey", () => {
  it("declares a new key with the object type by default and preserves existing ctx", () => {
    const cfg = baseConfig({ existing: { type: "string" } });
    const next = declareCtxKey(cfg, "fresh");
    expect(next.ctx.fresh).toEqual({ type: "object" });
    // Existing declarations are untouched.
    expect(next.ctx.existing).toEqual({ type: "string" });
  });

  it("is a no-op when the key already exists (never clobbers its type/description)", () => {
    const cfg = baseConfig({
      keep: { type: "number", description: "count" },
    });
    const next = declareCtxKey(cfg, "keep");
    expect(next).toBe(cfg);
    expect(next.ctx.keep).toEqual({ type: "number", description: "count" });
  });

  it("creates the ctx map when the config has none", () => {
    const cfg = baseConfig();
    // Simulate a config whose ctx is absent (loose runtime shape).
    delete (cfg as { ctx?: unknown }).ctx;
    const next = declareCtxKey(cfg, "fresh");
    expect(next.ctx).toEqual({ fresh: { type: "object" } });
  });

  it("accepts an explicit type", () => {
    const next = declareCtxKey(baseConfig(), "amount", "number");
    expect(next.ctx.amount).toEqual({ type: "number" });
  });

  it("does not mutate the input config", () => {
    const cfg = baseConfig({ a: { type: "string" } });
    const snapshot = JSON.stringify(cfg);
    declareCtxKey(cfg, "b");
    expect(JSON.stringify(cfg)).toBe(snapshot);
  });
});
