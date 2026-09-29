import { validateRunInput } from "./validate-run-input";

describe("validateRunInput", () => {
  const schema = {
    type: "object" as const,
    properties: {
      customerId: { type: "string" as const },
      count: { type: "number" as const, default: 5 },
      enabled: { type: "boolean" as const },
    },
    required: ["customerId", "enabled"],
  };

  it("returns no errors when all required fields are present and typed correctly", () => {
    const errors = validateRunInput(schema, {
      customerId: "cust-1",
      enabled: true,
    });
    expect(errors).toEqual([]);
  });

  it("flags a missing required field", () => {
    const errors = validateRunInput(schema, { customerId: "cust-1" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual({
      path: "enabled",
      message: 'Missing required field "enabled"',
    });
  });

  it("flags a type mismatch on a provided field", () => {
    const errors = validateRunInput(schema, {
      customerId: 123,
      enabled: true,
    });
    expect(errors).toContainEqual({
      path: "customerId",
      message: 'Field "customerId" must be of type string, got number',
    });
  });

  it("does NOT flag extra keys absent from the schema", () => {
    const errors = validateRunInput(schema, {
      customerId: "cust-1",
      enabled: true,
      adHocExtra: "anything",
    });
    expect(errors).toEqual([]);
  });

  it("flags array vs object correctly", () => {
    const arrSchema = {
      type: "object" as const,
      properties: { items: { type: "array" as const } },
      required: ["items"],
    };
    const errors = validateRunInput(arrSchema, { items: { not: "array" } });
    expect(errors[0].message).toMatch(/must be of type array, got object/);
  });
});
