import {
  CTX_NAMESPACE_PREFIXES,
  getCtxRootKey,
  getRefCtxRootKey,
} from "./context-utils";

describe("CTX_NAMESPACE_PREFIXES", () => {
  it("maps doc to documentMetadata", () => {
    expect(CTX_NAMESPACE_PREFIXES["doc"]).toBe("documentMetadata");
  });

  it("maps segment to currentSegment", () => {
    expect(CTX_NAMESPACE_PREFIXES["segment"]).toBe("currentSegment");
  });
});

describe("getCtxRootKey", () => {
  it("resolves doc.X to documentMetadata", () => {
    expect(getCtxRootKey("doc.someField")).toBe("documentMetadata");
  });

  it("resolves segment.X to currentSegment", () => {
    expect(getCtxRootKey("segment.someField")).toBe("currentSegment");
  });

  it("resolves doc with no dot suffix to documentMetadata", () => {
    expect(getCtxRootKey("doc")).toBe("documentMetadata");
  });

  it("passes through unknown namespaces unchanged", () => {
    expect(getCtxRootKey("myKey.nested")).toBe("myKey");
  });

  it("passes through a bare key with no dot unchanged", () => {
    expect(getCtxRootKey("myKey")).toBe("myKey");
  });

  it("handles deeply nested path using only first segment", () => {
    expect(getCtxRootKey("doc.a.b.c")).toBe("documentMetadata");
  });
});

describe("getRefCtxRootKey", () => {
  it("resolves ctx.X.Y to X", () => {
    expect(getRefCtxRootKey("ctx.myKey.nested")).toBe("myKey");
  });

  it("resolves ctx.X with no deeper path to X", () => {
    expect(getRefCtxRootKey("ctx.myKey")).toBe("myKey");
  });

  it("resolves doc.X to documentMetadata via namespace prefix", () => {
    expect(getRefCtxRootKey("doc.someField")).toBe("documentMetadata");
  });

  it("resolves segment.X to currentSegment via namespace prefix", () => {
    expect(getRefCtxRootKey("segment.someField")).toBe("currentSegment");
  });

  it("returns undefined for param.X (not a ctx ref)", () => {
    expect(getRefCtxRootKey("param.someParam")).toBeUndefined();
  });

  it("returns undefined for row.X", () => {
    expect(getRefCtxRootKey("row.someField")).toBeUndefined();
  });

  it("returns undefined for bare non-namespace key", () => {
    expect(getRefCtxRootKey("now")).toBeUndefined();
  });

  it("returns undefined for ctx with no second segment", () => {
    expect(getRefCtxRootKey("ctx")).toBeUndefined();
  });
});
