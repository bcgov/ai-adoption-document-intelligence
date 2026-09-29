import { z } from "zod/v4";
import type { KindRef } from "./artifacts";
import { type KindSchemaMap, zodToFields } from "./zod-to-fields";

const EMPTY: KindSchemaMap = new Map();

describe("zodToFields", () => {
  it("maps primitives with required flags", () => {
    const schema = z.object({
      name: z.string(),
      count: z.number().optional(),
      ok: z.boolean(),
    });
    expect(zodToFields(schema, EMPTY)).toEqual([
      { name: "name", type: "string", required: true },
      { name: "count", type: "number", required: false },
      { name: "ok", type: "boolean", required: true },
    ]);
  });

  it("maps a literal to its value's primitive type", () => {
    const schema = z.object({ storage: z.literal("blob") });
    expect(zodToFields(schema, EMPTY)).toEqual([
      { name: "storage", type: "string", required: true },
    ]);
  });

  it("emits a kind reference for a sub-schema registered in the map (identity, not inline)", () => {
    const Segment = z.object({ polygon: z.array(z.number()) });
    const kindSchemas: KindSchemaMap = new Map([
      [Segment, "Segment" as KindRef],
    ]);
    const Doc = z.object({
      primarySegment: Segment,
      extra: z.object({ x: z.string() }),
    });
    expect(zodToFields(Doc, kindSchemas)).toEqual([
      {
        name: "primarySegment",
        type: "object",
        kind: "Segment",
        required: true,
      },
      { name: "extra", type: "object", required: true }, // anonymous object: no kind, no inline fields
    ]);
  });

  it("emits an array kind for arrays of a registered kind schema", () => {
    const Segment = z.object({ polygon: z.array(z.number()) });
    const kindSchemas: KindSchemaMap = new Map([
      [Segment, "Segment" as KindRef],
    ]);
    const Doc = z.object({
      segments: z.array(Segment),
      tags: z.array(z.string()),
    });
    expect(zodToFields(Doc, kindSchemas)).toEqual([
      { name: "segments", type: "array", kind: "Segment[]", required: true },
      { name: "tags", type: "array", required: true },
    ]);
  });

  it("maps z.enum to a string field", () => {
    const schema = z.object({
      fileType: z.enum(["pdf", "image"]),
      outputFormat: z.enum(["text", "markdown"]).optional(),
    });
    expect(zodToFields(schema, new Map())).toEqual([
      { name: "fileType", type: "string", required: true },
      { name: "outputFormat", type: "string", required: false },
    ]);
  });

  it("throws on unsupported constructs instead of mis-deriving", () => {
    const schema = z.object({ u: z.union([z.string(), z.number()]) });
    expect(() => zodToFields(schema, EMPTY)).toThrow(
      'zodToFields: unsupported schema type "union" for field "u"',
    );
  });

  it("throws when the top-level schema is not an object", () => {
    expect(() => zodToFields(z.string(), EMPTY)).toThrow(
      'zodToFields: top-level schema must be an object, got "string"',
    );
  });
});

describe("primitive-shaped kind references (schema identity)", () => {
  it("emits a kind ref for a string field whose schema is registered", () => {
    const DocumentRefSchema = z.string();
    const Prepared = z.object({ blobKey: DocumentRefSchema, size: z.number() });
    const kindSchemas: KindSchemaMap = new Map<z.ZodType, KindRef>([
      [DocumentRefSchema, "DocumentRef"],
    ]);
    expect(zodToFields(Prepared, kindSchemas)).toEqual([
      { name: "blobKey", type: "string", kind: "DocumentRef", required: true },
      { name: "size", type: "number", required: true },
    ]);
  });

  it("leaves an unregistered primitive as an untyped field", () => {
    const schema = z.object({ name: z.string() });
    expect(zodToFields(schema, EMPTY)).toEqual([
      { name: "name", type: "string", required: true },
    ]);
  });
});
