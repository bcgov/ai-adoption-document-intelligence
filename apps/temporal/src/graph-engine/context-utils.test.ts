import type { GraphWorkflowConfig } from "../graph-workflow-types";
import {
  initializeContext,
  resolvePortBinding,
  writeToCtx,
} from "./context-utils";

describe("initializeContext", () => {
  it("should apply defaults from config", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "start",
      nodes: {},
      edges: [],
      ctx: {
        foo: { type: "string", defaultValue: "bar" },
        count: { type: "number", defaultValue: 42 },
      },
    };

    const result = initializeContext(config, {});

    expect(result).toEqual({
      foo: "bar",
      count: 42,
    });
  });

  it("should overlay initial values over defaults", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "start",
      nodes: {},
      edges: [],
      ctx: {
        foo: { type: "string", defaultValue: "bar" },
        count: { type: "number", defaultValue: 42 },
      },
    };

    const result = initializeContext(config, {
      foo: "override",
      extra: "value",
    });

    expect(result).toEqual({
      foo: "override",
      count: 42,
      extra: "value",
    });
  });

  it("should handle empty config ctx", () => {
    const config: GraphWorkflowConfig = {
      schemaVersion: "1.0",
      metadata: {},
      entryNodeId: "start",
      nodes: {},
      edges: [],
      ctx: {},
    };

    const result = initializeContext(config, { foo: "bar" });

    expect(result).toEqual({ foo: "bar" });
  });
});

describe("resolvePortBinding", () => {
  it("should resolve simple key", () => {
    const ctx = { documentId: "123" };
    expect(resolvePortBinding("documentId", ctx)).toBe("123");
  });

  it("should resolve dot notation", () => {
    const ctx = { currentSegment: { blobKey: "key123" } };
    expect(resolvePortBinding("currentSegment.blobKey", ctx)).toBe("key123");
  });

  it("should resolve nested dot notation", () => {
    const ctx = { a: { b: { c: "value" } } };
    expect(resolvePortBinding("a.b.c", ctx)).toBe("value");
  });

  it("should resolve doc namespace", () => {
    const ctx = { documentMetadata: { field: "value" } };
    expect(resolvePortBinding("doc.field", ctx)).toBe("value");
  });

  it("should resolve segment namespace", () => {
    const ctx = { currentSegment: { index: 5 } };
    expect(resolvePortBinding("segment.index", ctx)).toBe(5);
  });

  it("should return undefined for missing key", () => {
    const ctx = { foo: "bar" };
    expect(resolvePortBinding("missing", ctx)).toBeUndefined();
  });

  it("should return undefined for missing nested key", () => {
    const ctx = { foo: { bar: "baz" } };
    expect(resolvePortBinding("foo.missing", ctx)).toBeUndefined();
  });

  it("should return undefined when traversing non-object", () => {
    const ctx = { foo: "string" };
    expect(resolvePortBinding("foo.bar", ctx)).toBeUndefined();
  });

  it("returns undefined when path contains an unsafe segment", () => {
    const ctx = { a: { b: "ok" } };
    expect(resolvePortBinding("a.__proto__.polluted", ctx)).toBeUndefined();
  });
});

describe("writeToCtx", () => {
  it("should write simple key", () => {
    const ctx: Record<string, unknown> = {};
    writeToCtx("documentId", "123", ctx);
    expect(ctx).toEqual({ documentId: "123" });
  });

  it("should write dot notation", () => {
    const ctx: Record<string, unknown> = {};
    writeToCtx("currentSegment.blobKey", "key123", ctx);
    expect(ctx).toEqual({ currentSegment: { blobKey: "key123" } });
  });

  it("should write nested dot notation", () => {
    const ctx: Record<string, unknown> = {};
    writeToCtx("a.b.c", "value", ctx);
    expect(ctx).toEqual({ a: { b: { c: "value" } } });
  });

  it("should write doc namespace", () => {
    const ctx: Record<string, unknown> = {};
    writeToCtx("doc.field", "value", ctx);
    expect(ctx).toEqual({ documentMetadata: { field: "value" } });
  });

  it("should write segment namespace", () => {
    const ctx: Record<string, unknown> = {};
    writeToCtx("segment.index", 5, ctx);
    expect(ctx).toEqual({ currentSegment: { index: 5 } });
  });

  it("should create intermediate objects", () => {
    const ctx: Record<string, unknown> = {};
    writeToCtx("a.b.c.d", "deep", ctx);
    expect(ctx).toEqual({ a: { b: { c: { d: "deep" } } } });
  });

  it("should overwrite existing values", () => {
    const ctx: Record<string, unknown> = { foo: "old" };
    writeToCtx("foo", "new", ctx);
    expect(ctx).toEqual({ foo: "new" });
  });

  it("should add to existing nested object", () => {
    const ctx: Record<string, unknown> = { a: { b: "existing" } };
    writeToCtx("a.c", "new", ctx);
    expect(ctx).toEqual({ a: { b: "existing", c: "new" } });
  });

  it("throws when path contains an unsafe segment", () => {
    const ctx: Record<string, unknown> = {};
    expect(() => writeToCtx("a.__proto__.polluted", true, ctx)).toThrow(
      /Invalid context key segment/,
    );
  });
});
