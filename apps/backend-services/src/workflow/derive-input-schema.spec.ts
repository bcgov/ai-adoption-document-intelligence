import { deriveInputSchema } from "./derive-input-schema";
import type { GraphWorkflowConfig } from "./graph-workflow-types";

const baseConfig = (
  overrides: Partial<GraphWorkflowConfig>,
): GraphWorkflowConfig => ({
  schemaVersion: "1.0",
  metadata: {},
  entryNodeId: "noop",
  ctx: {},
  nodes: {
    noop: {
      id: "noop",
      type: "activity",
      label: "Noop",
      activityType: "noop.activity",
    },
  },
  edges: [],
  ...overrides,
});

describe("deriveInputSchema", () => {
  // -------------------------------------------------------------------------
  // US-068 Scenario 1 — library workflow
  // -------------------------------------------------------------------------
  describe("US-068 Scenario 1: library workflow → derived from metadata.inputs[]", () => {
    it("emits one property per LibraryPortDescriptor and marks all required", () => {
      const config = baseConfig({
        metadata: {
          kind: "library",
          inputs: [
            { label: "Foo", path: "foo", type: "string" },
            { label: "Bar", path: "bar", type: "number" },
          ],
        },
      });

      const schema = deriveInputSchema(config);

      expect(schema).toEqual({
        type: "object",
        properties: {
          foo: { type: "string", title: "Foo" },
          bar: { type: "number", title: "Bar" },
        },
        required: ["foo", "bar"],
      });
    });
  });

  // -------------------------------------------------------------------------
  // US-068 Scenario 2 — regular workflow with mixed isInput flags
  // -------------------------------------------------------------------------
  describe("US-068 Scenario 2: regular workflow → derived from ctx with isInput true", () => {
    it("emits only flagged ctx entries; required excludes entries with defaultValue", () => {
      const config = baseConfig({
        ctx: {
          customerId: {
            type: "string",
            isInput: true,
            description: "Customer to process",
          },
          internalCounter: { type: "number" },
          optionalFlag: {
            type: "boolean",
            isInput: true,
            defaultValue: false,
          },
        },
      });

      const schema = deriveInputSchema(config);

      expect(schema.type).toBe("object");
      expect(Object.keys(schema.properties)).toEqual([
        "customerId",
        "optionalFlag",
      ]);
      expect(schema.properties.customerId).toEqual({
        type: "string",
        description: "Customer to process",
      });
      expect(schema.properties.optionalFlag).toEqual({
        type: "boolean",
        default: false,
      });
      expect(schema.required).toEqual(["customerId"]);
      expect(schema.properties).not.toHaveProperty("internalCounter");
    });
  });

  // -------------------------------------------------------------------------
  // US-068 Scenario 3 — empty input set
  // -------------------------------------------------------------------------
  describe("US-068 Scenario 3: no inputs declared", () => {
    it("returns an empty object schema with empty required[]", () => {
      const config = baseConfig({
        ctx: {
          internalOnly: { type: "string" },
        },
      });

      const schema = deriveInputSchema(config);

      expect(schema).toEqual({
        type: "object",
        properties: {},
        required: [],
      });
    });
  });

  // -------------------------------------------------------------------------
  // US-068 Scenario 4 — object/array map without deep constraints
  // -------------------------------------------------------------------------
  describe("US-068 Scenario 4: object/array map without restriction", () => {
    it("maps object and array types as bare type declarations", () => {
      const config = baseConfig({
        ctx: {
          payload: { type: "object", isInput: true },
          items: { type: "array", isInput: true },
        },
      });

      const schema = deriveInputSchema(config);

      expect(schema.properties.payload).toEqual({ type: "object" });
      expect(schema.properties.items).toEqual({ type: "array" });
    });
  });

  // -------------------------------------------------------------------------
  // US-068 Scenario 6 — library wins when both are present
  // -------------------------------------------------------------------------
  describe("US-068 Scenario 6: library workflow with ctx isInput entries → library wins", () => {
    it("ignores ctx isInput entries when metadata.kind is library", () => {
      const config = baseConfig({
        metadata: {
          kind: "library",
          inputs: [{ label: "Foo", path: "foo", type: "string" }],
        },
        ctx: {
          ignoreMe: { type: "string", isInput: true },
        },
      });

      const schema = deriveInputSchema(config);

      expect(Object.keys(schema.properties)).toEqual(["foo"]);
      expect(schema.required).toEqual(["foo"]);
    });
  });

  // -------------------------------------------------------------------------
  // Library inputs[] absent → empty schema (library declared but no inputs yet)
  // -------------------------------------------------------------------------
  describe("library workflow with no inputs[] declared", () => {
    it("returns an empty schema", () => {
      const config = baseConfig({
        metadata: { kind: "library" },
        ctx: { somethingElse: { type: "string", isInput: true } },
      });

      const schema = deriveInputSchema(config);

      expect(schema).toEqual({
        type: "object",
        properties: {},
        required: [],
      });
    });
  });
});
