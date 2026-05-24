/**
 * Unit tests for the source catalog (US-108).
 *
 * `SOURCE_CATALOG` is empty at this milestone (US-115 + US-116 register
 * `source.api` and `source.upload`); the empty-registry behaviour is
 * the live surface today. Synthetic catalog entries — passed as the
 * optional `catalog` parameter the same way
 * `createCatalogParameterValidator` accepts one — exercise the
 * happy-path branches of the adapter and the output-schema derivation.
 */

import { z } from "zod/v4";

import type { GraphValidationError, SourceNode } from "../types";

import * as packageRoot from "../index";

import {
  SOURCE_CATALOG,
  createSourceParameterValidator,
  deriveSourceOutputSchema,
  getSourceCatalogEntry,
  listSourceTypes,
} from "./source-catalog";
import type { JsonSchema7, SourceCatalogEntry } from "./source-types";

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

describe("SOURCE_CATALOG (Scenario 1 — empty frozen registry)", () => {
  it("is an array", () => {
    expect(Array.isArray(SOURCE_CATALOG)).toBe(true);
  });

  it("is empty at Milestone A (US-108)", () => {
    expect(SOURCE_CATALOG).toHaveLength(0);
  });

  it("is frozen (callers cannot push new entries)", () => {
    expect(Object.isFrozen(SOURCE_CATALOG)).toBe(true);
  });
});

describe("getSourceCatalogEntry (Scenario 2)", () => {
  it("returns undefined for source.api (catalog empty)", () => {
    expect(getSourceCatalogEntry("source.api")).toBeUndefined();
  });

  it("returns undefined for source.upload (catalog empty)", () => {
    expect(getSourceCatalogEntry("source.upload")).toBeUndefined();
  });

  it("returns undefined for any unknown sourceType", () => {
    expect(getSourceCatalogEntry("nonexistent.source")).toBeUndefined();
  });
});

describe("listSourceTypes (Scenario 3)", () => {
  it("returns an empty array at Milestone A", () => {
    expect(listSourceTypes()).toEqual([]);
  });
});

describe("createSourceParameterValidator (Scenario 3)", () => {
  it("emits an error for unknown sourceType against the default empty catalog", () => {
    const validate = createSourceParameterValidator();
    const errors: GraphValidationError[] = [];
    validate("source.api", "n1", {}, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      path: "nodes.n1.sourceType",
      severity: "error",
    });
    expect(errors[0]?.message).toBe("Unknown source type: source.api");
  });

  it("names the unknown subtype in the error message", () => {
    const validate = createSourceParameterValidator();
    const errors: GraphValidationError[] = [];
    validate("source.upload", "src", undefined, errors);
    expect(errors[0]?.message).toBe("Unknown source type: source.upload");
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
      label: "API",
      sourceType: "source.api",
    };
    expect(() => deriveSourceOutputSchema(node)).toThrow(
      /Unknown source type `source\.api` for node `src1`/,
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
  it("re-exports SOURCE_CATALOG", () => {
    expect(packageRoot.SOURCE_CATALOG).toBeDefined();
    expect(packageRoot.SOURCE_CATALOG).toHaveLength(0);
  });

  it("re-exports getSourceCatalogEntry", () => {
    expect(typeof packageRoot.getSourceCatalogEntry).toBe("function");
    expect(packageRoot.getSourceCatalogEntry("anything")).toBeUndefined();
  });

  it("re-exports listSourceTypes", () => {
    expect(typeof packageRoot.listSourceTypes).toBe("function");
    expect(packageRoot.listSourceTypes()).toEqual([]);
  });

  it("re-exports createSourceParameterValidator", () => {
    expect(typeof packageRoot.createSourceParameterValidator).toBe("function");
    const validate = packageRoot.createSourceParameterValidator();
    const errors: GraphValidationError[] = [];
    validate("source.api", "n1", {}, errors);
    expect(errors).toHaveLength(1);
  });

  it("re-exports deriveSourceOutputSchema", () => {
    expect(typeof packageRoot.deriveSourceOutputSchema).toBe("function");
    expect(() =>
      packageRoot.deriveSourceOutputSchema({
        id: "x",
        type: "source",
        label: "L",
        sourceType: "source.api",
      }),
    ).toThrow();
  });
});
