import { z } from "zod/v4";
import type { GraphValidationError } from "../types";
import { createCatalogParameterValidator } from "./create-parameter-validator";
import type { ActivityCatalogEntry } from "./types";

function fakeEntry(parametersSchema: z.ZodType): ActivityCatalogEntry {
  return {
    activityType: "fake.activity",
    displayName: "Fake",
    category: "Data Transformation",
    description: "Fake test activity",
    iconHint: "code",
    colorHint: "gray",
    inputs: [],
    outputs: [],
    parametersSchema,
  };
}

describe("createCatalogParameterValidator", () => {
  it("runs the catalog Zod schema and pushes errors for the given node", () => {
    const validate = createCatalogParameterValidator({
      "fake.activity": fakeEntry(
        z.object({
          inputFormat: z.enum(["json", "xml", "csv"]),
        }),
      ),
    });
    const errors: GraphValidationError[] = [];
    validate("fake.activity", "n1", { inputFormat: "yaml" }, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      path: "nodes.n1.parameters.inputFormat",
      severity: "error",
    });
  });

  it("ignores unregistered activity types", () => {
    const validate = createCatalogParameterValidator({});
    const errors: GraphValidationError[] = [];
    validate("nonexistent.activity", "n1", { foo: "bar" }, errors);
    expect(errors).toEqual([]);
  });

  it("emits one error per Zod issue at the right path", () => {
    const validate = createCatalogParameterValidator({
      "fake.activity": fakeEntry(
        z.object({
          a: z.string(),
          b: z.string(),
          c: z.string(),
        }),
      ),
    });
    const errors: GraphValidationError[] = [];
    validate("fake.activity", "n1", {}, errors);
    const paths = errors.map((e) => e.path).sort();
    expect(paths).toEqual([
      "nodes.n1.parameters.a",
      "nodes.n1.parameters.b",
      "nodes.n1.parameters.c",
    ]);
  });

  it("produces dot-joined paths for nested object fields", () => {
    const validate = createCatalogParameterValidator({
      "fake.activity": fakeEntry(
        z.object({
          wrapper: z.object({
            inner: z.string(),
          }),
        }),
      ),
    });
    const errors: GraphValidationError[] = [];
    validate("fake.activity", "n1", { wrapper: { inner: 42 } }, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("nodes.n1.parameters.wrapper.inner");
  });

  it("uses indexed paths for array element issues", () => {
    const validate = createCatalogParameterValidator({
      "fake.activity": fakeEntry(
        z.object({
          rules: z.array(z.object({ name: z.string() })),
        }),
      ),
    });
    const errors: GraphValidationError[] = [];
    validate(
      "fake.activity",
      "n1",
      { rules: [{ name: "ok" }, { name: 42 }] },
      errors,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("nodes.n1.parameters.rules.1.name");
  });

  it("isolates a custom catalog from the default ACTIVITY_CATALOG", () => {
    const validate = createCatalogParameterValidator({
      "fake.activity": fakeEntry(z.object({ x: z.string() })),
    });
    const errors: GraphValidationError[] = [];
    // data.transform IS in the real catalog but NOT in this custom one.
    validate("data.transform", "n1", {}, errors);
    expect(errors).toEqual([]);
  });

  it("treats undefined parameters as empty object", () => {
    const validate = createCatalogParameterValidator({
      "fake.activity": fakeEntry(z.object({ required: z.string() })),
    });
    const errors: GraphValidationError[] = [];
    validate("fake.activity", "n1", undefined, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("nodes.n1.parameters.required");
  });
});
