import { z } from "zod/v4";
import {
  filePrepareCatalogEntry,
  filePrepareParametersSchema,
} from "./file-prepare";

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

  it("takes the OCR model as an optional ModelId input, like poll and extract", () => {
    const modelId = filePrepareCatalogEntry.inputs.find(
      (i) => i.name === "modelId",
    );
    expect(modelId).toMatchObject({ required: false, kind: "ModelId" });
  });

  it("has no typed-in model setting", () => {
    const jsonSchema = z.toJSONSchema(filePrepareParametersSchema) as {
      properties?: Record<string, unknown>;
    };
    expect(jsonSchema.properties ?? {}).not.toHaveProperty("modelId");
    expect(filePrepareParametersSchema.safeParse({}).success).toBe(true);
  });
});
