import { registerArtifactKind } from "./artifact-registry";
import type { ArtifactKind } from "./artifacts";
import { resolveKindFields } from "./kind-fields";

describe("resolveKindFields", () => {
  it("returns the built-in OcrResult fields", () => {
    const names = resolveKindFields("OcrResult").map((f) => f.name);
    expect(names).toEqual([
      "documentId",
      "blobPath",
      "storage",
      "byteLength",
      "pageCount",
      "status",
    ]);
  });

  it("returns [] for unknown kinds, wildcards, and array kinds (direct [] drill-down is out of scope)", () => {
    expect(resolveKindFields("NoSuchKind")).toEqual([]);
    expect(resolveKindFields("Artifact")).toEqual([]);
    expect(resolveKindFields("Document[]")).toEqual([]);
    expect(resolveKindFields("OcrResult[]")).toEqual([]);
  });

  it("merges baseKind fields, own fields winning on name collision", () => {
    // The live registry is module-global and append-only, so use names
    // unique to this test file.
    registerArtifactKind("KfBase", {
      displayName: "KfBase",
      color: "gray",
      fields: [
        { name: "shared", type: "string", required: true },
        { name: "baseOnly", type: "number", required: true },
      ],
      isArray: false,
    });
    registerArtifactKind("KfChild", {
      displayName: "KfChild",
      color: "gray",
      // Cast required: runtime-registered base kind is not in the static union.
      baseKind: "KfBase" as ArtifactKind,
      fields: [{ name: "shared", type: "boolean", required: false }],
      isArray: false,
    });
    expect(resolveKindFields("KfChild")).toEqual([
      { name: "shared", type: "boolean", required: false }, // base position, child descriptor
      { name: "baseOnly", type: "number", required: true },
    ]);
  });

  it("TypedSegment resolves 7 unique fields through the DocumentSegment chain", () => {
    expect(resolveKindFields("TypedSegment").map((f) => f.name)).toEqual([
      "segmentIndex",
      "pageRange",
      "blobKey",
      "pageCount",
      "segmentType",
      "keywordMatch",
      "confidence",
    ]);
  });
});
