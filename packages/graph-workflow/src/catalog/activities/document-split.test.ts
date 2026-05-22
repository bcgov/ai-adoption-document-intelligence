import { z } from "zod/v4";
import {
  documentSplitCatalogEntry,
  documentSplitParametersSchema,
} from "./document-split";

describe("document.split catalog entry", () => {
  it("has the expected activity type", () => {
    expect(documentSplitCatalogEntry.activityType).toBe("document.split");
  });

  it("declares the required input slots", () => {
    const required = documentSplitCatalogEntry.inputs
      .filter((i) => i.required)
      .map((i) => i.name);
    expect(required).toEqual(["blobKey", "groupId"]);
  });

  it("declares segments as a required output", () => {
    const required = documentSplitCatalogEntry.outputs
      .filter((o) => o.required)
      .map((o) => o.name);
    expect(required).toEqual(["segments"]);
  });

  describe("parameter validation", () => {
    it("accepts the per-page strategy with no additional fields", () => {
      const result = documentSplitParametersSchema.safeParse({
        strategy: "per-page",
      });
      expect(result.success).toBe(true);
    });

    it("strips extra fields on the per-page variant", () => {
      const result = documentSplitParametersSchema.safeParse({
        strategy: "per-page",
        fixedRangeSize: 2,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ strategy: "per-page" });
      }
    });

    it("accepts fixed-range with a valid range size", () => {
      const result = documentSplitParametersSchema.safeParse({
        strategy: "fixed-range",
        fixedRangeSize: 3,
      });
      expect(result.success).toBe(true);
    });

    it("rejects fixed-range without a range size", () => {
      const result = documentSplitParametersSchema.safeParse({
        strategy: "fixed-range",
      });
      expect(result.success).toBe(false);
    });

    it("rejects fixed-range with size below the minimum", () => {
      const result = documentSplitParametersSchema.safeParse({
        strategy: "fixed-range",
        fixedRangeSize: 0,
      });
      expect(result.success).toBe(false);
    });

    it("accepts custom-ranges with one valid range", () => {
      const result = documentSplitParametersSchema.safeParse({
        strategy: "custom-ranges",
        customRanges: [{ start: 1, end: 3 }],
      });
      expect(result.success).toBe(true);
    });

    it("rejects custom-ranges with no ranges", () => {
      const result = documentSplitParametersSchema.safeParse({
        strategy: "custom-ranges",
        customRanges: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects custom-ranges with a non-integer start page", () => {
      const result = documentSplitParametersSchema.safeParse({
        strategy: "custom-ranges",
        customRanges: [{ start: 1.5, end: 3 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects an unknown strategy value", () => {
      const result = documentSplitParametersSchema.safeParse({
        strategy: "boundary-detection",
      });
      expect(result.success).toBe(false);
    });

    it("rejects when strategy is missing", () => {
      const result = documentSplitParametersSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("JSON Schema emission", () => {
    it("emits a root anyOf of one object per variant", () => {
      const jsonSchema = z.toJSONSchema(documentSplitParametersSchema) as {
        anyOf: Array<{
          type: string;
          properties: { strategy: { const: string } };
        }>;
      };
      expect(Array.isArray(jsonSchema.anyOf)).toBe(true);
      expect(jsonSchema.anyOf).toHaveLength(3);
      const literals = jsonSchema.anyOf.map(
        (v) => v.properties.strategy.const,
      );
      expect(literals.sort()).toEqual(
        ["custom-ranges", "fixed-range", "per-page"].sort(),
      );
    });

    it("preserves x-options-labels on the discriminator field", () => {
      const jsonSchema = z.toJSONSchema(documentSplitParametersSchema) as {
        anyOf: Array<{
          properties: {
            strategy: { "x-options-labels"?: Record<string, string> };
          };
        }>;
      };
      const labels = jsonSchema.anyOf[0].properties.strategy["x-options-labels"];
      expect(labels).toEqual({
        "per-page": "One segment per page",
        "fixed-range": "Fixed-size ranges",
        "custom-ranges": "Custom page ranges",
      });
    });

    it("emits the custom-ranges variant as an array of object items", () => {
      const jsonSchema = z.toJSONSchema(documentSplitParametersSchema) as {
        anyOf: Array<{
          properties: Record<
            string,
            { type?: string; items?: { type?: string } }
          >;
        }>;
      };
      const customRangesVariant = jsonSchema.anyOf.find(
        (v) => "customRanges" in v.properties,
      );
      expect(customRangesVariant).toBeDefined();
      expect(customRangesVariant!.properties.customRanges.type).toBe("array");
      expect(customRangesVariant!.properties.customRanges.items?.type).toBe(
        "object",
      );
    });
  });
});
