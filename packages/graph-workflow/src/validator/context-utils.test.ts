import {
  applyCtxNamespace,
  CTX_NAMESPACE_PREFIXES,
  getCtxRootKey,
  getRefCtxRootKey,
  resolveCtxBinding,
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

describe("applyCtxNamespace", () => {
  it("remaps doc.field to documentMetadata.field", () => {
    expect(applyCtxNamespace("doc.docType")).toBe("documentMetadata.docType");
  });

  it("remaps segment.field to currentSegment.field", () => {
    expect(applyCtxNamespace("segment.pageRange")).toBe(
      "currentSegment.pageRange",
    );
  });

  it("remaps a bare namespace token with no dot", () => {
    expect(applyCtxNamespace("doc")).toBe("documentMetadata");
  });

  it("passes through an unknown namespace unchanged", () => {
    expect(applyCtxNamespace("myKey.nested")).toBe("myKey.nested");
  });

  it("passes through a bare key with no namespace unchanged", () => {
    expect(applyCtxNamespace("documentId")).toBe("documentId");
  });
});

describe("resolveCtxBinding", () => {
  it("reads a flat key directly", () => {
    expect(resolveCtxBinding("documentId", { documentId: "abc" })).toBe("abc");
  });

  it("reads doc.field through the documentMetadata namespace", () => {
    expect(
      resolveCtxBinding("doc.docType", {
        documentMetadata: { docType: "invoice" },
      }),
    ).toBe("invoice");
  });

  it("reads segment.field through the currentSegment namespace", () => {
    expect(
      resolveCtxBinding("segment.parentDocId", {
        currentSegment: { parentDocId: "doc-1" },
      }),
    ).toBe("doc-1");
  });

  it("traverses an explicit dotted path", () => {
    expect(
      resolveCtxBinding("currentSegment.pageRange.start", {
        currentSegment: { pageRange: { start: 3, end: 5 } },
      }),
    ).toBe(3);
  });

  it("returns undefined for a missing root key", () => {
    expect(resolveCtxBinding("doc.docType", {})).toBeUndefined();
  });

  it("returns undefined when traversal hits a non-object before the leaf", () => {
    expect(
      resolveCtxBinding("doc.docType.deep", {
        documentMetadata: { docType: "scalar" },
      }),
    ).toBeUndefined();
  });

  it("rejects unsafe path segments (prototype-pollution guard)", () => {
    expect(
      resolveCtxBinding("__proto__.polluted", { a: 1 }),
    ).toBeUndefined();
  });
});
