/**
 * Per-entry tests for the `source.upload` catalog entry (US-116).
 *
 * Scenarios:
 *   1. Registration: lookup via `getSourceCatalogEntry("source.upload")`
 *      returns the entry with the expected metadata.
 *   2. `parametersSchema` accepts empty input (fills in defaults),
 *      accepts explicit values, rejects non-URL-safe `ctxKey` values.
 *   3. `deriveOutputSchema` returns the ctxKey-keyed fixed shape for
 *      a custom ctxKey, and falls back to the default `"documentUrl"`
 *      when `ctxKey` is absent.
 *   4. `outputKind === "Document"`.
 *   5. Per-entry catalog invariants: non-empty type/displayName/
 *      description, valid runtime enum, `outputKind` resolves via the
 *      Phase 3 registry, `deriveOutputSchema({})` is callable.
 */

import {
  SOURCE_CATALOG,
  getSourceCatalogEntry,
} from "../source-catalog";
import { isAssignable } from "../../types/subtype-check";

import {
  sourceUploadCatalogEntry,
  sourceUploadParametersSchema,
} from "./source-upload";

describe("source.upload catalog entry — Scenario 1 (registration)", () => {
  it("is registered in SOURCE_CATALOG", () => {
    expect(SOURCE_CATALOG).toContain(sourceUploadCatalogEntry);
  });

  it("getSourceCatalogEntry('source.upload') returns the entry", () => {
    const entry = getSourceCatalogEntry("source.upload");
    expect(entry).toBe(sourceUploadCatalogEntry);
  });

  it("has the documented metadata", () => {
    expect(sourceUploadCatalogEntry.type).toBe("source.upload");
    expect(sourceUploadCatalogEntry.category).toBe("source");
    expect(sourceUploadCatalogEntry.displayName).toBe("File upload");
    expect(sourceUploadCatalogEntry.runtime).toBe("manual");
    expect(sourceUploadCatalogEntry.outputKind).toBe("Document");
    expect(sourceUploadCatalogEntry.iconHint).toBe("file-upload");
    expect(sourceUploadCatalogEntry.colorHint).toBe("blue");
  });
});

describe("source.upload catalog entry — Scenario 2 (parametersSchema)", () => {
  it("accepts an empty object and fills in documented defaults", () => {
    const parsed = sourceUploadParametersSchema.parse({});
    expect(parsed).toEqual({
      allowedMimeTypes: ["application/pdf", "image/*"],
      maxFileSizeMB: 50,
      ctxKey: "documentUrl",
    });
  });

  it("accepts explicit values that override the defaults", () => {
    const parsed = sourceUploadParametersSchema.parse({
      allowedMimeTypes: ["image/png", "image/jpeg"],
      maxFileSizeMB: 10,
      ctxKey: "myFile",
    });
    expect(parsed).toEqual({
      allowedMimeTypes: ["image/png", "image/jpeg"],
      maxFileSizeMB: 10,
      ctxKey: "myFile",
    });
  });

  it("rejects non-URL-safe ctxKey (leading digit)", () => {
    const result = sourceUploadParametersSchema.safeParse({
      ctxKey: "1bad",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes("URL-safe identifier"),
        ),
      ).toBe(true);
    }
  });

  it("rejects non-URL-safe ctxKey (hyphen)", () => {
    const result = sourceUploadParametersSchema.safeParse({
      ctxKey: "bad-name",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-URL-safe ctxKey (whitespace)", () => {
    const result = sourceUploadParametersSchema.safeParse({
      ctxKey: "bad name",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive maxFileSizeMB", () => {
    const result = sourceUploadParametersSchema.safeParse({
      maxFileSizeMB: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer maxFileSizeMB", () => {
    const result = sourceUploadParametersSchema.safeParse({
      maxFileSizeMB: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty strings within allowedMimeTypes", () => {
    const result = sourceUploadParametersSchema.safeParse({
      allowedMimeTypes: [""],
    });
    expect(result.success).toBe(false);
  });
});

describe("source.upload catalog entry — Scenario 3 (deriveOutputSchema)", () => {
  it("returns the ctxKey-keyed fixed shape for a custom ctxKey", () => {
    const schema = sourceUploadCatalogEntry.deriveOutputSchema({
      ctxKey: "myFile",
    });
    expect(schema).toEqual({
      type: "object",
      properties: { myFile: { type: "string", format: "uri" } },
      required: ["myFile"],
    });
  });

  it("falls back to the default ctxKey ('documentUrl') when absent", () => {
    const schema = sourceUploadCatalogEntry.deriveOutputSchema({});
    expect(schema).toEqual({
      type: "object",
      properties: { documentUrl: { type: "string", format: "uri" } },
      required: ["documentUrl"],
    });
  });

  it("ignores additional parameter keys and still uses the default ctxKey", () => {
    const schema = sourceUploadCatalogEntry.deriveOutputSchema({
      allowedMimeTypes: ["image/png"],
      maxFileSizeMB: 10,
    });
    expect(schema).toEqual({
      type: "object",
      properties: { documentUrl: { type: "string", format: "uri" } },
      required: ["documentUrl"],
    });
  });
});

describe("source.upload catalog entry — Scenario 4 (outputKind)", () => {
  it("declares outputKind === 'Document'", () => {
    expect(sourceUploadCatalogEntry.outputKind).toBe("Document");
  });
});

describe("source.upload catalog entry — Scenario 5 (per-entry invariants)", () => {
  it("has non-empty type / displayName / description", () => {
    expect(sourceUploadCatalogEntry.type.length).toBeGreaterThan(0);
    expect(sourceUploadCatalogEntry.displayName.length).toBeGreaterThan(0);
    expect(sourceUploadCatalogEntry.description.length).toBeGreaterThan(0);
  });

  it("has a valid SourceRuntimePattern enum value", () => {
    expect(["push", "pull", "manual"]).toContain(
      sourceUploadCatalogEntry.runtime,
    );
  });

  it("outputKind resolves via the Phase 3 registry (isAssignable round-trip)", () => {
    expect(
      isAssignable("Document", sourceUploadCatalogEntry.outputKind),
    ).toBe(true);
    expect(
      isAssignable(sourceUploadCatalogEntry.outputKind, "Document"),
    ).toBe(true);
  });

  it("deriveOutputSchema is callable with empty parameters (smoke test)", () => {
    expect(() =>
      sourceUploadCatalogEntry.deriveOutputSchema({}),
    ).not.toThrow();
    const schema = sourceUploadCatalogEntry.deriveOutputSchema({});
    expect(schema.type).toBe("object");
  });
});
