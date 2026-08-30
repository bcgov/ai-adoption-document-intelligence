import { z } from "zod/v4";

import { deriveInputSchema } from "./derive-input-schema";
import type {
  GraphWorkflowConfig,
  JsonSchema7,
  SourceCatalogEntry,
  SourceNode,
} from "./graph-workflow-types";

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
  // Item 32 — library input keys are derived from the ctx-binding path leaf,
  // not the raw `path` string. A `ctx.<key>` path yields the run-input key
  // `<key>`; a namespaced short-form resolves to its underlying ctx root.
  // -------------------------------------------------------------------------
  describe("Item 32: library run-input keys derive from the path leaf", () => {
    it("strips the `ctx.` prefix from a library input path", () => {
      const config = baseConfig({
        metadata: {
          kind: "library",
          inputs: [
            { label: "Document URL", path: "ctx.documentUrl", type: "string" },
          ],
        },
      });

      const schema = deriveInputSchema(config);

      expect(Object.keys(schema.properties)).toEqual(["documentUrl"]);
      expect(schema.properties.documentUrl).toEqual({
        type: "string",
        title: "Document URL",
      });
      expect(schema.required).toEqual(["documentUrl"]);
    });

    it("resolves a namespaced short-form path to its ctx root key", () => {
      const config = baseConfig({
        metadata: {
          kind: "library",
          // `doc.X` resolves to the `documentMetadata` ctx root.
          inputs: [
            { label: "Doc field", path: "doc.someField", type: "object" },
          ],
        },
      });

      const schema = deriveInputSchema(config);

      expect(Object.keys(schema.properties)).toEqual(["documentMetadata"]);
      expect(schema.required).toEqual(["documentMetadata"]);
    });

    it("leaves a bare key path unchanged", () => {
      const config = baseConfig({
        metadata: {
          kind: "library",
          inputs: [{ label: "Foo", path: "foo", type: "string" }],
        },
      });

      const schema = deriveInputSchema(config);

      expect(Object.keys(schema.properties)).toEqual(["foo"]);
      expect(schema.required).toEqual(["foo"]);
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

  // -------------------------------------------------------------------------
  // US-111 — source.api precedence over library / isInput / empty
  // -------------------------------------------------------------------------
  describe("US-111: deriveInputSchema precedence (source.api > library > isInput > empty)", () => {
    /**
     * Synthetic source.api catalog entry. The real entry is registered
     * by US-115; until then tests inject this fake via the
     * `getSourceCatalogEntry` option (mirrors the validator's injection
     * pattern in `ValidateGraphConfigOptions.getSourceCatalogEntry`).
     */
    const fakeSourceApiEntry: SourceCatalogEntry = {
      type: "source.api",
      category: "source",
      displayName: "API endpoint (test)",
      description: "Synthetic source.api entry used in unit tests",
      parametersSchema: z.object({}).passthrough(),
      runtime: "push",
      outputKind: "Artifact",
      deriveOutputSchema: (parameters) => {
        const fields =
          (parameters?.fields as
            | {
                name: string;
                type: "string" | "number" | "boolean" | "object" | "array";
                required?: boolean;
                description?: string;
                defaultValue?: unknown;
              }[]
            | undefined) ?? [];
        const properties: Record<string, JsonSchema7> = {};
        const required: string[] = [];
        for (const f of fields) {
          const prop: JsonSchema7 = { type: f.type };
          if (f.description) prop.description = f.description;
          if (f.defaultValue !== undefined) prop.default = f.defaultValue;
          properties[f.name] = prop;
          if (f.required) required.push(f.name);
        }
        return { type: "object", properties, required };
      },
    };

    const synthLookup = (sourceType: string) =>
      sourceType === "source.api" ? fakeSourceApiEntry : undefined;

    const sourceApiNode = (
      parameters: Record<string, unknown>,
    ): SourceNode => ({
      id: "src-1",
      type: "source",
      label: "API source",
      sourceType: "source.api",
      parameters,
    });

    // ---------------------------------------------------------------------
    // Scenario 1: source.api wins over isInput-flagged ctx
    // ---------------------------------------------------------------------
    it("Scenario 1: source.api wins over isInput-flagged ctx", () => {
      const config = baseConfig({
        ctx: {
          legacyInput: {
            type: "string",
            isInput: true,
            description: "Should be IGNORED when source.api is present",
          },
        },
        nodes: {
          src: sourceApiNode({
            fields: [
              {
                name: "customerId",
                type: "string",
                required: true,
                description: "from source.api",
              },
              { name: "count", type: "number", required: false },
            ],
          }),
          noop: {
            id: "noop",
            type: "activity",
            label: "Noop",
            activityType: "noop.activity",
          },
        },
      });

      const schema = deriveInputSchema(config, {
        getSourceCatalogEntry: synthLookup,
      });

      expect(Object.keys(schema.properties)).toEqual(["customerId", "count"]);
      expect(schema.properties.customerId).toEqual({
        type: "string",
        description: "from source.api",
      });
      expect(schema.properties.count).toEqual({ type: "number" });
      expect(schema.required).toEqual(["customerId"]);
      expect(schema.properties).not.toHaveProperty("legacyInput");
    });

    // ---------------------------------------------------------------------
    // Scenario 1b: source.api wins over library inputs[] too
    // ---------------------------------------------------------------------
    it("Scenario 1b: source.api wins over library metadata.inputs[]", () => {
      const config = baseConfig({
        metadata: {
          kind: "library",
          inputs: [{ label: "Ignored", path: "ignored", type: "string" }],
        },
        nodes: {
          src: sourceApiNode({
            fields: [{ name: "winner", type: "string", required: true }],
          }),
          noop: {
            id: "noop",
            type: "activity",
            label: "Noop",
            activityType: "noop.activity",
          },
        },
      });

      const schema = deriveInputSchema(config, {
        getSourceCatalogEntry: synthLookup,
      });

      expect(Object.keys(schema.properties)).toEqual(["winner"]);
      expect(schema.required).toEqual(["winner"]);
      expect(schema.properties).not.toHaveProperty("ignored");
    });

    // ---------------------------------------------------------------------
    // Scenario 2: library inputs[] wins when no source.api
    // ---------------------------------------------------------------------
    it("Scenario 2: library inputs[] wins when no source.api node is present", () => {
      const config = baseConfig({
        metadata: {
          kind: "library",
          inputs: [
            { label: "Foo", path: "foo", type: "string" },
            { label: "Bar", path: "bar", type: "number" },
          ],
        },
        ctx: { ignoreMe: { type: "string", isInput: true } },
      });

      const schema = deriveInputSchema(config, {
        getSourceCatalogEntry: synthLookup,
      });

      expect(schema).toEqual({
        type: "object",
        properties: {
          foo: { type: "string", title: "Foo" },
          bar: { type: "number", title: "Bar" },
        },
        required: ["foo", "bar"],
      });
    });

    // ---------------------------------------------------------------------
    // Scenario 3: isInput wins when no source.api + no library
    // ---------------------------------------------------------------------
    it("Scenario 3: isInput-flagged ctx wins when no source.api and no library", () => {
      const config = baseConfig({
        ctx: {
          customerId: {
            type: "string",
            isInput: true,
            description: "Customer to process",
          },
          internalCounter: { type: "number" },
        },
      });

      const schema = deriveInputSchema(config, {
        getSourceCatalogEntry: synthLookup,
      });

      expect(schema.properties.customerId).toEqual({
        type: "string",
        description: "Customer to process",
      });
      expect(schema.required).toEqual(["customerId"]);
      expect(schema.properties).not.toHaveProperty("internalCounter");
    });

    // ---------------------------------------------------------------------
    // Scenario 4: empty schema fallback when none of the above
    // ---------------------------------------------------------------------
    it("Scenario 4: empty schema fallback when no source.api, no library, no isInput ctx", () => {
      const config = baseConfig({
        ctx: { internalOnly: { type: "string" } },
      });

      const schema = deriveInputSchema(config, {
        getSourceCatalogEntry: synthLookup,
      });

      expect(schema).toEqual({
        type: "object",
        properties: {},
        required: [],
      });
    });

    // ---------------------------------------------------------------------
    // Scenario 5: source.api with empty fields[] → empty-object schema
    // ---------------------------------------------------------------------
    it("Scenario 5: source.api with empty fields[] returns empty-object schema", () => {
      const config = baseConfig({
        nodes: {
          src: sourceApiNode({ fields: [] }),
          noop: {
            id: "noop",
            type: "activity",
            label: "Noop",
            activityType: "noop.activity",
          },
        },
      });

      const schema = deriveInputSchema(config, {
        getSourceCatalogEntry: synthLookup,
      });

      expect(schema).toEqual({
        type: "object",
        properties: {},
        required: [],
      });
    });

    // ---------------------------------------------------------------------
    // Safety: an unresolved source.api (catalog empty) throws — mirrors
    // `deriveSourceOutputSchema`. Production calls only happen once the
    // catalog is populated (US-115); the validator gates upstream.
    // ---------------------------------------------------------------------
    it("throws when a source.api node is present but the catalog lookup returns undefined", () => {
      const config = baseConfig({
        nodes: {
          src: sourceApiNode({ fields: [] }),
          noop: {
            id: "noop",
            type: "activity",
            label: "Noop",
            activityType: "noop.activity",
          },
        },
      });

      expect(() =>
        deriveInputSchema(config, {
          getSourceCatalogEntry: () => undefined,
        }),
      ).toThrow(/Unknown source type/);
    });
  });
});
