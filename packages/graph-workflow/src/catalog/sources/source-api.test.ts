/**
 * Per-entry tests for the `source.api` catalog entry (US-115).
 *
 * Scenarios:
 *   1. Registration: lookup via `getSourceCatalogEntry("source.api")`
 *      returns the entry with the expected metadata.
 *   2. `parametersSchema` accepts the happy-path shape and rejects
 *      duplicate field names + non-URL-safe field names.
 *   3. `deriveOutputSchema` round-trips for empty / single-required /
 *      multi-mixed parameter shapes.
 *   4. `outputKind === "Artifact"`.
 *   5. Per-entry catalog invariants: non-empty type/displayName/
 *      description, valid runtime enum, `outputKind` resolves via the
 *      Phase 3 registry (`isAssignable("Artifact", "Artifact")` smoke
 *      check), `deriveOutputSchema({})` is callable.
 */

import {
  SOURCE_CATALOG,
  getSourceCatalogEntry,
} from "../source-catalog";
import { isAssignable } from "../../types/subtype-check";

import {
  sourceApiCatalogEntry,
  sourceApiParametersSchema,
} from "./source-api";

describe("source.api catalog entry — Scenario 1 (registration)", () => {
  it("is registered in SOURCE_CATALOG", () => {
    expect(SOURCE_CATALOG).toContain(sourceApiCatalogEntry);
  });

  it("getSourceCatalogEntry('source.api') returns the entry", () => {
    const entry = getSourceCatalogEntry("source.api");
    expect(entry).toBe(sourceApiCatalogEntry);
  });

  it("has the documented metadata", () => {
    expect(sourceApiCatalogEntry.type).toBe("source.api");
    expect(sourceApiCatalogEntry.category).toBe("source");
    expect(sourceApiCatalogEntry.displayName).toBe("API endpoint");
    expect(sourceApiCatalogEntry.runtime).toBe("push");
    expect(sourceApiCatalogEntry.outputKind).toBe("Artifact");
    expect(sourceApiCatalogEntry.iconHint).toBe("cloud-upload");
    expect(sourceApiCatalogEntry.colorHint).toBe("indigo");
  });
});

describe("source.api catalog entry — Scenario 2 (parametersSchema)", () => {
  it("accepts an empty object (fields defaults to [])", () => {
    const parsed = sourceApiParametersSchema.parse({});
    expect(parsed.fields).toEqual([]);
    expect(parsed.authNotes).toBeUndefined();
  });

  it("accepts the documented happy-path shape", () => {
    const parsed = sourceApiParametersSchema.parse({
      fields: [
        {
          name: "documentUrl",
          type: "string",
          required: true,
          description: "URL of the document to ingest",
        },
        {
          name: "priority",
          type: "number",
          required: false,
          defaultValue: 1,
        },
      ],
      authNotes: "Use a service-account API key.",
    });
    expect(parsed.fields).toHaveLength(2);
    expect(parsed.fields[0]?.name).toBe("documentUrl");
    expect(parsed.fields[1]?.defaultValue).toBe(1);
    expect(parsed.authNotes).toBe("Use a service-account API key.");
  });

  it("accepts the optional `kind` annotation on a field", () => {
    const parsed = sourceApiParametersSchema.parse({
      fields: [
        {
          name: "doc",
          type: "object",
          kind: "Document",
          required: true,
        },
      ],
    });
    expect(parsed.fields[0]?.kind).toBe("Document");
  });

  it("rejects duplicate field names within fields[]", () => {
    const result = sourceApiParametersSchema.safeParse({
      fields: [
        { name: "x", type: "string", required: true },
        { name: "x", type: "number", required: false },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) =>
        i.message.includes("unique"),
      )).toBe(true);
    }
  });

  it("rejects non-URL-safe field names (leading digit)", () => {
    const result = sourceApiParametersSchema.safeParse({
      fields: [{ name: "1bad", type: "string", required: true }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) =>
        i.message.includes("URL-safe identifier"),
      )).toBe(true);
    }
  });

  it("rejects non-URL-safe field names (hyphen)", () => {
    const result = sourceApiParametersSchema.safeParse({
      fields: [{ name: "bad-name", type: "string", required: true }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-URL-safe field names (whitespace)", () => {
    const result = sourceApiParametersSchema.safeParse({
      fields: [{ name: "bad name", type: "string", required: true }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown field type values", () => {
    const result = sourceApiParametersSchema.safeParse({
      fields: [{ name: "x", type: "date", required: true }],
    });
    expect(result.success).toBe(false);
  });
});

describe("source.api catalog entry — Scenario 3 (deriveOutputSchema)", () => {
  it("returns an empty object schema when fields[] is empty", () => {
    const schema = sourceApiCatalogEntry.deriveOutputSchema({});
    expect(schema).toEqual({
      type: "object",
      properties: {},
      required: [],
    });
  });

  it("returns an empty object schema when fields[] is explicitly []", () => {
    const schema = sourceApiCatalogEntry.deriveOutputSchema({ fields: [] });
    expect(schema).toEqual({
      type: "object",
      properties: {},
      required: [],
    });
  });

  it("round-trips a single required field", () => {
    const schema = sourceApiCatalogEntry.deriveOutputSchema({
      fields: [
        { name: "documentUrl", type: "string", required: true },
      ],
    });
    expect(schema).toEqual({
      type: "object",
      properties: { documentUrl: { type: "string" } },
      required: ["documentUrl"],
    });
  });

  it("round-trips multi-field parameters with mixed required/optional/defaultValue/description", () => {
    const schema = sourceApiCatalogEntry.deriveOutputSchema({
      fields: [
        {
          name: "documentUrl",
          type: "string",
          required: true,
          description: "URL of the document to ingest",
        },
        {
          name: "priority",
          type: "number",
          required: false,
          defaultValue: 1,
        },
        {
          name: "metadata",
          type: "object",
          required: false,
        },
      ],
    });
    expect(schema).toEqual({
      type: "object",
      properties: {
        documentUrl: {
          type: "string",
          description: "URL of the document to ingest",
        },
        priority: { type: "number", default: 1 },
        metadata: { type: "object" },
      },
      required: ["documentUrl"],
    });
  });

  it("matches the story's documented example shape verbatim", () => {
    // From US-115 Scenario 3 Given/Then.
    const schema = sourceApiCatalogEntry.deriveOutputSchema({
      fields: [
        { name: "documentUrl", type: "string", required: true },
        {
          name: "priority",
          type: "number",
          required: false,
          defaultValue: 1,
        },
      ],
    });
    expect(schema).toEqual({
      type: "object",
      properties: {
        documentUrl: { type: "string" },
        priority: { type: "number", default: 1 },
      },
      required: ["documentUrl"],
    });
  });
});

describe("source.api catalog entry — Scenario 4 (outputKind)", () => {
  it("declares outputKind === 'Artifact'", () => {
    expect(sourceApiCatalogEntry.outputKind).toBe("Artifact");
  });
});

describe("source.api catalog entry — Scenario 5 (per-entry invariants)", () => {
  it("has non-empty type / displayName / description", () => {
    expect(sourceApiCatalogEntry.type.length).toBeGreaterThan(0);
    expect(sourceApiCatalogEntry.displayName.length).toBeGreaterThan(0);
    expect(sourceApiCatalogEntry.description.length).toBeGreaterThan(0);
  });

  it("has a valid SourceRuntimePattern enum value", () => {
    expect(["push", "pull", "manual"]).toContain(
      sourceApiCatalogEntry.runtime,
    );
  });

  it("outputKind resolves via the Phase 3 registry (isAssignable round-trip)", () => {
    expect(isAssignable("Artifact", sourceApiCatalogEntry.outputKind)).toBe(
      true,
    );
    expect(isAssignable(sourceApiCatalogEntry.outputKind, "Artifact")).toBe(
      true,
    );
  });

  it("deriveOutputSchema is callable with empty parameters (smoke test)", () => {
    expect(() => sourceApiCatalogEntry.deriveOutputSchema({})).not.toThrow();
    const schema = sourceApiCatalogEntry.deriveOutputSchema({});
    expect(schema.type).toBe("object");
  });
});
