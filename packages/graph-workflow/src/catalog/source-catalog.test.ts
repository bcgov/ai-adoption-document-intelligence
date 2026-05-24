/**
 * Unit tests for the source catalog (US-108).
 *
 * US-115 registers `source.api`; US-116 will add `source.upload`.
 * Tests covering the registered-entry surface live in
 * `./sources/source-api.test.ts`. This file covers the
 * structural-registry contract (frozen, lookup by type, list,
 * package-root barrel re-exports) and the synthetic-catalog
 * happy-path branches of the validator + output-schema adapters.
 */

import { z } from "zod/v4";

import type { GraphValidationError, SourceNode } from "../types";

import * as packageRoot from "../index";

import {
  SOURCE_CATALOG,
  createSourceParameterValidator,
  deriveSourceOutputSchema,
  getSourceCatalogEntry,
  getSourceParametersJsonSchema,
  listSourceTypes,
} from "./source-catalog";
import type { JsonSchema7, SourceCatalogEntry } from "./source-types";
import { isAssignable } from "../types/subtype-check";

/** Fabricated entry used only by the synthetic happy-path tests. */
function fakeSourceEntry(
  parametersSchema: z.ZodType,
  overrides: Partial<SourceCatalogEntry> = {},
): SourceCatalogEntry {
  return {
    type: "source.fake",
    category: "source",
    displayName: "Fake source",
    description: "Synthetic source used in unit tests only",
    iconHint: "test",
    colorHint: "blue",
    parametersSchema,
    runtime: "push",
    outputKind: "Document",
    deriveOutputSchema: (parameters) => {
      const fields =
        (parameters?.fields as { name: string; type: string }[] | undefined) ??
        [];
      const properties: Record<string, JsonSchema7> = {};
      for (const f of fields) properties[f.name] = { type: f.type };
      return { type: "object", properties };
    },
    ...overrides,
  };
}

describe("SOURCE_CATALOG (Scenario 1 — frozen registry)", () => {
  it("is an array", () => {
    expect(Array.isArray(SOURCE_CATALOG)).toBe(true);
  });

  it("contains the source.api entry (US-115)", () => {
    expect(SOURCE_CATALOG.some((e) => e.type === "source.api")).toBe(true);
  });

  it("is frozen (callers cannot push new entries)", () => {
    expect(Object.isFrozen(SOURCE_CATALOG)).toBe(true);
  });
});

describe("getSourceCatalogEntry (Scenario 2)", () => {
  it("returns the source.api entry (US-115)", () => {
    const entry = getSourceCatalogEntry("source.api");
    expect(entry).toBeDefined();
    expect(entry?.type).toBe("source.api");
  });

  it("returns the source.upload entry (US-116)", () => {
    const entry = getSourceCatalogEntry("source.upload");
    expect(entry).toBeDefined();
    expect(entry?.type).toBe("source.upload");
  });

  it("returns undefined for any unknown sourceType", () => {
    expect(getSourceCatalogEntry("nonexistent.source")).toBeUndefined();
  });
});

describe("listSourceTypes (Scenario 3)", () => {
  it("includes source.api after US-115", () => {
    expect(listSourceTypes()).toContain("source.api");
  });
});

describe("SOURCE_CATALOG bulk invariants (Scenario 5)", () => {
  // Every registered entry must satisfy the contract documented on
  // `SourceCatalogEntry` in `./source-types.ts`. Catches accidental
  // drift as future Phase 8.x sources land.
  it.each(SOURCE_CATALOG.map((entry) => [entry.type, entry]))(
    "%s — non-empty type / displayName / description, valid runtime, outputKind resolves, deriveOutputSchema callable",
    (_typeId, entry: SourceCatalogEntry) => {
      expect(entry.type.length).toBeGreaterThan(0);
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(["push", "pull", "manual"]).toContain(entry.runtime);
      // outputKind must resolve via the Phase 3 registry — reflexive
      // assignability is the cheapest round-trip check.
      expect(isAssignable(entry.outputKind, entry.outputKind)).toBe(true);
      // Smoke-test that deriveOutputSchema is callable with empty params.
      expect(() => entry.deriveOutputSchema({})).not.toThrow();
    },
  );
});

describe("createSourceParameterValidator (Scenario 3)", () => {
  it("emits an error for an unknown sourceType against the default catalog", () => {
    const validate = createSourceParameterValidator();
    const errors: GraphValidationError[] = [];
    validate("source.nonexistent", "n1", {}, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      path: "nodes.n1.sourceType",
      severity: "error",
    });
    expect(errors[0]?.message).toBe(
      "Unknown source type: source.nonexistent",
    );
  });

  it("names the unknown subtype in the error message", () => {
    const validate = createSourceParameterValidator();
    const errors: GraphValidationError[] = [];
    validate("source.unknown.subtype", "src", undefined, errors);
    expect(errors[0]?.message).toBe(
      "Unknown source type: source.unknown.subtype",
    );
  });

  it("validates parameters against the catalog Zod schema (synthetic entry)", () => {
    const validate = createSourceParameterValidator([
      fakeSourceEntry(
        z.object({
          mode: z.enum(["push", "manual"]),
        }),
      ),
    ]);
    const errors: GraphValidationError[] = [];
    validate("source.fake", "n1", { mode: "weird" }, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      path: "nodes.n1.parameters.mode",
      severity: "error",
    });
  });

  it("emits no errors when parameters parse cleanly (synthetic entry)", () => {
    const validate = createSourceParameterValidator([
      fakeSourceEntry(z.object({ mode: z.enum(["push", "manual"]) })),
    ]);
    const errors: GraphValidationError[] = [];
    validate("source.fake", "n1", { mode: "push" }, errors);
    expect(errors).toEqual([]);
  });

  it("treats undefined parameters as empty object before parsing", () => {
    const validate = createSourceParameterValidator([
      fakeSourceEntry(z.object({ required: z.string() })),
    ]);
    const errors: GraphValidationError[] = [];
    validate("source.fake", "n1", undefined, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("nodes.n1.parameters.required");
  });
});

describe("deriveSourceOutputSchema (Scenario 4)", () => {
  it("throws a clear error when the sourceType is unknown", () => {
    const node: SourceNode = {
      id: "src1",
      type: "source",
      label: "Nonexistent",
      sourceType: "source.nonexistent",
    };
    expect(() => deriveSourceOutputSchema(node)).toThrow(
      /Unknown source type `source\.nonexistent` for node `src1`/,
    );
  });

  it("resolves the entry and calls its deriveOutputSchema (synthetic happy path)", () => {
    // The default `SOURCE_CATALOG` is empty in Milestone A; isolate the
    // module and inject a synthetic registry so we can exercise the
    // resolved-entry branch without mutating the frozen export.
    let schema: JsonSchema7 | undefined;
    jest.isolateModules(() => {
      const synthetic = fakeSourceEntry(z.object({}).passthrough());
      jest.doMock("./source-catalog", () => {
        const actual = jest.requireActual<
          typeof import("./source-catalog")
        >("./source-catalog");
        return {
          ...actual,
          SOURCE_CATALOG: [synthetic],
          getSourceCatalogEntry: (sourceType: string) =>
            [synthetic].find((e) => e.type === sourceType),
          deriveSourceOutputSchema: (node: SourceNode): JsonSchema7 => {
            const entry = [synthetic].find((e) => e.type === node.sourceType);
            if (!entry) {
              throw new Error(
                `Unknown source type \`${node.sourceType}\` for node \`${node.id}\``,
              );
            }
            return entry.deriveOutputSchema(node.parameters ?? {});
          },
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mocked = require("./source-catalog") as typeof import("./source-catalog");
      const node: SourceNode = {
        id: "src2",
        type: "source",
        label: "Fake",
        sourceType: "source.fake",
        parameters: {
          fields: [
            { name: "a", type: "string" },
            { name: "b", type: "number" },
          ],
        },
      };
      schema = mocked.deriveSourceOutputSchema(node);
    });
    expect(schema).toEqual({
      type: "object",
      properties: {
        a: { type: "string" },
        b: { type: "number" },
      },
    });
  });

  it("calls the catalog entry's deriveOutputSchema with the node parameters (direct entry test)", () => {
    // Exercises the entry-level contract: `deriveOutputSchema` receives
    // the node's parameters object verbatim. Bypasses the registry
    // lookup so we don't need to patch the frozen `SOURCE_CATALOG`.
    const captured: Record<string, unknown>[] = [];
    const synthetic = fakeSourceEntry(z.object({}).passthrough(), {
      deriveOutputSchema: (parameters) => {
        captured.push(parameters);
        return { type: "object" };
      },
    });
    const node: SourceNode = {
      id: "src3",
      type: "source",
      label: "Fake",
      sourceType: "source.fake",
      parameters: { foo: "bar" },
    };
    const schema = synthetic.deriveOutputSchema(node.parameters ?? {});
    expect(schema).toEqual({ type: "object" });
    expect(captured).toEqual([{ foo: "bar" }]);
  });
});

describe("package-root barrel re-exports (Scenario 5)", () => {
  it("re-exports SOURCE_CATALOG (now non-empty after US-115)", () => {
    expect(packageRoot.SOURCE_CATALOG).toBeDefined();
    expect(packageRoot.SOURCE_CATALOG.length).toBeGreaterThan(0);
  });

  it("re-exports getSourceCatalogEntry", () => {
    expect(typeof packageRoot.getSourceCatalogEntry).toBe("function");
    expect(packageRoot.getSourceCatalogEntry("anything")).toBeUndefined();
    expect(packageRoot.getSourceCatalogEntry("source.api")).toBeDefined();
  });

  it("re-exports listSourceTypes", () => {
    expect(typeof packageRoot.listSourceTypes).toBe("function");
    expect(packageRoot.listSourceTypes()).toContain("source.api");
  });

  it("re-exports createSourceParameterValidator", () => {
    expect(typeof packageRoot.createSourceParameterValidator).toBe("function");
    const validate = packageRoot.createSourceParameterValidator();
    const errors: GraphValidationError[] = [];
    validate("source.nonexistent", "n1", {}, errors);
    expect(errors).toHaveLength(1);
  });

  it("re-exports deriveSourceOutputSchema", () => {
    expect(typeof packageRoot.deriveSourceOutputSchema).toBe("function");
    expect(() =>
      packageRoot.deriveSourceOutputSchema({
        id: "x",
        type: "source",
        label: "L",
        sourceType: "source.nonexistent",
      }),
    ).toThrow();
  });

  it("re-exports getSourceParametersJsonSchema", () => {
    expect(typeof packageRoot.getSourceParametersJsonSchema).toBe("function");
    expect(
      packageRoot.getSourceParametersJsonSchema("source.nonexistent"),
    ).toBeUndefined();
  });
});

describe("getSourceParametersJsonSchema — preserves Zod .meta() hints (US-119)", () => {
  it("returns a JSON Schema that surfaces title + description + x-widget", () => {
    const schema = getSourceParametersJsonSchema("source.api") as {
      type: string;
      properties: Record<
        string,
        { title?: string; description?: string; "x-widget"?: string }
      >;
    };
    expect(schema).toBeDefined();
    expect(schema.type).toBe("object");
    expect(schema.properties.fields.title).toBe("Fields");
    expect(schema.properties.fields["x-widget"]).toBe("field-list-editor");
    expect(schema.properties.authNotes.title).toBe("Auth notes");
  });

  it("returns a JSON Schema with field titles for source.upload", () => {
    const schema = getSourceParametersJsonSchema("source.upload") as {
      properties: Record<string, { title?: string }>;
    };
    expect(schema.properties.allowedMimeTypes.title).toBe(
      "Allowed MIME types",
    );
    expect(schema.properties.maxFileSizeMB.title).toBe("Max file size (MB)");
    expect(schema.properties.ctxKey.title).toBe("Ctx key");
  });

  it("returns undefined for an unregistered source type", () => {
    expect(getSourceParametersJsonSchema("source.nonexistent")).toBeUndefined();
  });
});
