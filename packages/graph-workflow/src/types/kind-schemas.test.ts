import { ARTIFACT_REGISTRY, getArtifactKindMeta } from "./artifact-registry";
import type { OcrPayloadRef } from "./kind-schemas";
import {
  KIND_SCHEMAS,
  OcrResultSchema,
  PreparedFileSchema,
} from "./kind-schemas";
import { zodToFields } from "./zod-to-fields";

describe("kind schemas", () => {
  it("OcrResultSchema derives the same shape the Temporal runtime constructs", () => {
    // Compile-time single-source check: this literal is the exact object
    // extract-ocr-results.ts / mistral-ocr-process.ts put in ctx.
    const ref: OcrPayloadRef = {
      documentId: "doc-1",
      blobPath: "ocr/doc-1.json",
      storage: "blob",
      byteLength: 1024,
      pageCount: 3,
      status: "succeeded",
    };
    expect(OcrResultSchema.safeParse(ref).success).toBe(true);
    // Optionals really are optional:
    const minimal: OcrPayloadRef = {
      documentId: "d",
      blobPath: "p",
      storage: "blob",
    };
    expect(OcrResultSchema.safeParse(minimal).success).toBe(true);
  });

  it("registers OcrResultSchema in KIND_SCHEMAS under the OcrResult kind", () => {
    expect(KIND_SCHEMAS.get(OcrResultSchema)).toBe("OcrResult");
  });

  it("seeds ARTIFACT_REGISTRY.OcrResult.fields from the schema", () => {
    expect(ARTIFACT_REGISTRY.OcrResult.fields).toEqual([
      { name: "documentId", type: "string", required: true },
      { name: "blobPath", type: "string", required: true },
      { name: "storage", type: "string", required: true },
      { name: "byteLength", type: "number", required: false },
      { name: "pageCount", type: "number", required: false },
      { name: "status", type: "string", required: false },
    ]);
  });

  it("keeps the Artifact wildcard schema-free", () => {
    expect(ARTIFACT_REGISTRY.Artifact.fields).toBeUndefined();
    // The wildcard cannot acquire fields at runtime either: the duplicate-name
    // guard rejects re-registration of "Artifact".
    expect(getArtifactKindMeta("Artifact")?.fields).toBeUndefined();
  });

  it("PreparedFileSchema derives the six PreparedFileData fields", () => {
    expect(zodToFields(PreparedFileSchema, KIND_SCHEMAS)).toEqual([
      { name: "fileName", type: "string", required: true },
      { name: "fileType", type: "string", required: true },
      { name: "contentType", type: "string", required: true },
      { name: "blobKey", type: "string", required: true },
      { name: "modelId", type: "string", required: true },
      { name: "outputFormat", type: "string", required: false },
    ]);
  });

  it("KIND_SCHEMAS maps PreparedFileSchema to PreparedFile by identity", () => {
    expect(KIND_SCHEMAS.get(PreparedFileSchema)).toBe("PreparedFile");
  });
});
