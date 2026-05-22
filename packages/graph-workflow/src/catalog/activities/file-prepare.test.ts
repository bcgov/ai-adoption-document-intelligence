import { z } from "zod/v4";
import { filePrepareCatalogEntry, filePrepareParametersSchema } from "./file-prepare";

describe("file.prepare catalog entry", () => {
  it("has the expected activity type", () => {
    expect(filePrepareCatalogEntry.activityType).toBe("file.prepare");
  });

  it("declares the required input slots", () => {
    const required = filePrepareCatalogEntry.inputs
      .filter((i) => i.required)
      .map((i) => i.name);
    expect(required).toEqual(["documentId", "blobKey"]);
  });

  it("declares preparedData as a required output", () => {
    const required = filePrepareCatalogEntry.outputs
      .filter((o) => o.required)
      .map((o) => o.name);
    expect(required).toEqual(["preparedData"]);
  });

  it("accepts an empty parameter object (modelId is optional)", () => {
    const result = filePrepareParametersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a known prebuilt model id", () => {
    const result = filePrepareParametersSchema.safeParse({ modelId: "prebuilt-invoice" });
    expect(result.success).toBe(true);
  });

  it("accepts a custom model id (combobox, not strict enum)", () => {
    const result = filePrepareParametersSchema.safeParse({ modelId: "custom-trained-v3" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-string modelId", () => {
    const result = filePrepareParametersSchema.safeParse({ modelId: 42 });
    expect(result.success).toBe(false);
  });

  it("emits JSON Schema via z.toJSONSchema", () => {
    const jsonSchema = z.toJSONSchema(filePrepareParametersSchema);
    expect(jsonSchema).toMatchObject({
      type: "object",
      properties: {
        modelId: expect.objectContaining({
          type: "string",
        }),
      },
    });
  });

  it("preserves x-widget hint in the emitted JSON Schema", () => {
    const jsonSchema = z.toJSONSchema(filePrepareParametersSchema) as {
      properties: { modelId: Record<string, unknown> };
    };
    expect(jsonSchema.properties.modelId["x-widget"]).toBe("combobox");
  });
});
