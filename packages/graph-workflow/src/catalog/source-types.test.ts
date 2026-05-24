/**
 * Types-only smoke tests for `source-types.ts` (US-107).
 *
 * No runtime registry exists yet — the first concrete source catalog
 * entries land in US-108. These tests assert the exported types accept
 * well-formed values and reject obviously-wrong shapes via TypeScript's
 * type system (compile-time) plus minimal runtime sanity checks.
 */

import { z } from "zod/v4";

import type { KindRef } from "../types/artifacts";

import type {
  FieldDescriptor,
  JsonSchema7,
  SourceCatalogEntry,
  SourceRuntimePattern,
} from "./source-types";

describe("source-types (US-107)", () => {
  it("accepts the three documented SourceRuntimePattern values", () => {
    const push: SourceRuntimePattern = "push";
    const pull: SourceRuntimePattern = "pull";
    const manual: SourceRuntimePattern = "manual";

    expect([push, pull, manual]).toEqual(["push", "pull", "manual"]);
  });

  it("constructs a FieldDescriptor with all fields populated", () => {
    const kind: KindRef = "Document";
    const descriptor: FieldDescriptor = {
      name: "invoiceNumber",
      type: "string",
      kind,
      required: true,
      description: "Unique invoice identifier",
      defaultValue: "INV-000",
    };

    expect(descriptor.name).toBe("invoiceNumber");
    expect(descriptor.type).toBe("string");
    expect(descriptor.kind).toBe("Document");
    expect(descriptor.required).toBe(true);
  });

  it("constructs a FieldDescriptor with only required fields", () => {
    const descriptor: FieldDescriptor = {
      name: "amount",
      type: "number",
      required: false,
    };

    expect(descriptor.name).toBe("amount");
    expect(descriptor.kind).toBeUndefined();
    expect(descriptor.description).toBeUndefined();
    expect(descriptor.defaultValue).toBeUndefined();
  });

  it("constructs a SourceCatalogEntry whose deriveOutputSchema returns JsonSchema7", () => {
    const entry: SourceCatalogEntry = {
      type: "source.test",
      category: "source",
      displayName: "Test source",
      description: "Used by US-107 smoke test only",
      iconHint: "test",
      colorHint: "blue",
      parametersSchema: z.object({}),
      runtime: "push",
      outputKind: "Document",
      deriveOutputSchema: (parameters) => {
        // Pure derivation — no I/O, no side effects.
        const fields = (parameters?.fields as FieldDescriptor[] | undefined) ?? [];
        const properties: Record<string, JsonSchema7> = {};
        const required: string[] = [];
        for (const field of fields) {
          properties[field.name] = { type: field.type };
          if (field.required) required.push(field.name);
        }
        return { type: "object", properties, required };
      },
    };

    const schema = entry.deriveOutputSchema({
      fields: [
        { name: "a", type: "string", required: true },
        { name: "b", type: "number", required: false },
      ] satisfies FieldDescriptor[],
    });

    expect(entry.category).toBe("source");
    expect(entry.runtime).toBe("push");
    expect(schema.type).toBe("object");
    expect(schema.properties).toEqual({
      a: { type: "string" },
      b: { type: "number" },
    });
    expect(schema.required).toEqual(["a"]);
  });

  it("permits open-shape extension fields on JsonSchema7", () => {
    const schema: JsonSchema7 = {
      type: "object",
      properties: { foo: { type: "string", title: "Foo" } },
      required: ["foo"],
      // Open-shape: arbitrary JSON Schema vocabulary keys are allowed.
      $id: "https://example.test/schema/foo.json",
      additionalProperties: false,
    };

    expect(schema.properties?.foo.type).toBe("string");
    expect(schema.required).toEqual(["foo"]);
  });
});
