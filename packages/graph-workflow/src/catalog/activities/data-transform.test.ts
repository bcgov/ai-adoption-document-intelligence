import { dataTransformParametersSchema } from "./data-transform";

describe("data.transform catalog parameter schema", () => {
  it("accepts a valid json→xml mapping with a {{payload}} envelope", () => {
    const result = dataTransformParametersSchema.safeParse({
      inputFormat: "json",
      outputFormat: "xml",
      fieldMapping: "{}",
      xmlEnvelope: "<root>{{payload}}</root>",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-JSON-parseable fieldMapping", () => {
    const result = dataTransformParametersSchema.safeParse({
      inputFormat: "json",
      outputFormat: "json",
      fieldMapping: "not-json",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) =>
      i.path.includes("fieldMapping"),
    );
    expect(issue?.message).toMatch(/valid JSON/i);
  });

  it("rejects empty fieldMapping", () => {
    const result = dataTransformParametersSchema.safeParse({
      inputFormat: "json",
      outputFormat: "json",
      fieldMapping: "",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) =>
      i.path.includes("fieldMapping"),
    );
    expect(issue).toBeDefined();
  });

  it("rejects xmlEnvelope without {{payload}} when output is xml", () => {
    const result = dataTransformParametersSchema.safeParse({
      inputFormat: "json",
      outputFormat: "xml",
      fieldMapping: "{}",
      xmlEnvelope: "<root></root>",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) =>
      i.path.includes("xmlEnvelope"),
    );
    expect(issue?.message).toMatch(/\{\{payload\}\}/);
  });

  it("rejects xmlEnvelope with multiple {{payload}} placeholders when output is xml", () => {
    const result = dataTransformParametersSchema.safeParse({
      inputFormat: "json",
      outputFormat: "xml",
      fieldMapping: "{}",
      xmlEnvelope: "<a>{{payload}}</a><b>{{payload}}</b>",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find((i) =>
      i.path.includes("xmlEnvelope"),
    );
    expect(issue?.message).toMatch(/\{\{payload\}\}/);
  });

  it("allows xmlEnvelope without {{payload}} when output is NOT xml", () => {
    const result = dataTransformParametersSchema.safeParse({
      inputFormat: "json",
      outputFormat: "json",
      fieldMapping: "{}",
      xmlEnvelope: "<dead-weight></dead-weight>",
    });
    expect(result.success).toBe(true);
  });

  it("requires inputFormat", () => {
    const result = dataTransformParametersSchema.safeParse({
      outputFormat: "xml",
      fieldMapping: "{}",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((i) => i.path.includes("inputFormat")),
    ).toBe(true);
  });

  it("requires outputFormat", () => {
    const result = dataTransformParametersSchema.safeParse({
      inputFormat: "json",
      fieldMapping: "{}",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((i) => i.path.includes("outputFormat")),
    ).toBe(true);
  });

  it("rejects unknown enum values for inputFormat", () => {
    const result = dataTransformParametersSchema.safeParse({
      inputFormat: "yaml",
      outputFormat: "xml",
      fieldMapping: "{}",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(
      result.error.issues.some((i) => i.path.includes("inputFormat")),
    ).toBe(true);
  });
});
