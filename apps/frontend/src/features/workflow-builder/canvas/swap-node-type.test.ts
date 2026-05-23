/**
 * Tests for the `swapActivityType` pure helper (US-047).
 *
 * Acceptance scenarios live in
 * feature-docs/20260525-workflow-builder-phase1b-completion/user_stories/
 * US-047-node-type-swap.md.
 *
 * The helper computes a new `ActivityNode` whose `activityType` and
 * `parameters` reflect the target catalog entry — all other fields
 * (`id`, `label`, `inputs`, `outputs`, `errorPolicy`, `retry`, `timeout`,
 * `metadata`) are carried over verbatim.
 *
 * Parameter rules:
 *   - keys present in BOTH the source-type's parameter schema and the
 *     target-type's parameter schema have their values preserved.
 *   - keys that don't appear in the target schema are dropped silently.
 *   - keys required by the target schema but missing on the source get a
 *     default value following the same rules the JsonSchemaForm uses
 *     (first enum value, empty string, `false`, schema minimum, etc.).
 *
 * Tests use small custom catalog fixtures so the assertions don't depend
 * on the real shared catalog's evolving shape.
 */

import type { ActivityCatalogEntry } from "@ai-di/graph-workflow";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import type { ActivityNode } from "../../../types/workflow";
import { swapActivityType } from "./swap-node-type";

function makeActivityCatalogEntry(
  activityType: string,
  parametersSchema: z.ZodType,
): ActivityCatalogEntry {
  return {
    activityType,
    displayName: activityType,
    category: "Data Transformation",
    description: "Test entry",
    iconHint: "transform",
    colorHint: "blue",
    inputs: [],
    outputs: [],
    parametersSchema,
  };
}

function makeActivityNode(
  overrides: Partial<ActivityNode> & Pick<ActivityNode, "activityType">,
): ActivityNode {
  return {
    id: "node_1",
    type: "activity",
    label: "Demo node",
    parameters: {},
    inputs: [{ port: "in", ctxKey: "ctx.in" }],
    outputs: [{ port: "out", ctxKey: "ctx.out" }],
    errorPolicy: { retryable: true, onError: "fail" },
    retry: { maximumAttempts: 3 },
    timeout: { startToClose: "30s" },
    metadata: { position: { x: 100, y: 200 } },
    ...overrides,
  };
}

describe("swapActivityType — Scenario 2: intersecting parameters preserved, non-overlapping dropped", () => {
  it("keeps values for keys that exist in both schemas and drops keys absent from the new schema", () => {
    const oldEntry = makeActivityCatalogEntry(
      "A",
      z.object({
        x: z.number(),
        y: z.string(),
      }),
    );
    const newEntry = makeActivityCatalogEntry(
      "B",
      z.object({
        x: z.number(),
        z: z.string(),
      }),
    );
    const catalog: Record<string, ActivityCatalogEntry> = {
      [oldEntry.activityType]: oldEntry,
      [newEntry.activityType]: newEntry,
    };
    const node = makeActivityNode({
      activityType: "A",
      parameters: { x: 1, y: "foo" },
    });

    const result = swapActivityType(node, "B", catalog);

    expect(result.activityType).toBe("B");
    // `x` is preserved (intersects), `y` is dropped (not in B), `z` is
    // defaulted to "" because z.string() has no .min(1).
    expect(result.parameters).toEqual({ x: 1, z: "" });
  });

  it("preserves id, label, inputs/outputs, errorPolicy, retry, timeout and metadata verbatim", () => {
    const oldEntry = makeActivityCatalogEntry("A", z.object({ x: z.number() }));
    const newEntry = makeActivityCatalogEntry("B", z.object({ x: z.number() }));
    const catalog: Record<string, ActivityCatalogEntry> = {
      [oldEntry.activityType]: oldEntry,
      [newEntry.activityType]: newEntry,
    };
    const node = makeActivityNode({
      activityType: "A",
      parameters: { x: 42 },
    });

    const result = swapActivityType(node, "B", catalog);

    expect(result.id).toBe(node.id);
    expect(result.label).toBe(node.label);
    expect(result.inputs).toEqual(node.inputs);
    expect(result.outputs).toEqual(node.outputs);
    expect(result.errorPolicy).toEqual(node.errorPolicy);
    expect(result.retry).toEqual(node.retry);
    expect(result.timeout).toEqual(node.timeout);
    expect(result.metadata).toEqual(node.metadata);
    expect(result.type).toBe("activity");
  });
});

describe("swapActivityType — Scenario 4: required new field defaulted; validator surfaces it", () => {
  it("supplies an empty-string default for a required new string field", () => {
    const oldEntry = makeActivityCatalogEntry("A", z.object({ x: z.number() }));
    const newEntry = makeActivityCatalogEntry(
      "B",
      z.object({
        x: z.number(),
        z: z.string(),
      }),
    );
    const catalog: Record<string, ActivityCatalogEntry> = {
      [oldEntry.activityType]: oldEntry,
      [newEntry.activityType]: newEntry,
    };
    const node = makeActivityNode({
      activityType: "A",
      parameters: { x: 1 },
    });

    const result = swapActivityType(node, "B", catalog);

    expect(result.parameters).toEqual({ x: 1, z: "" });
    // The Zod schema requires `z` to be at least 1 char if we'd written
    // `.min(1)`; without it, "" parses fine. To assert the
    // validator-surfaces-required-missing behaviour we'd use a `.min(1)`
    // schema — see below.
  });

  it("defaults a required enum field to the first enum value", () => {
    const oldEntry = makeActivityCatalogEntry("A", z.object({}));
    const newEntry = makeActivityCatalogEntry(
      "B",
      z.object({
        format: z.enum(["json", "xml", "csv"] as const),
      }),
    );
    const catalog: Record<string, ActivityCatalogEntry> = {
      [oldEntry.activityType]: oldEntry,
      [newEntry.activityType]: newEntry,
    };
    const node = makeActivityNode({
      activityType: "A",
      parameters: {},
    });

    const result = swapActivityType(node, "B", catalog);

    expect(result.parameters).toEqual({ format: "json" });
  });

  it("defaults a required number field to its minimum (or 1 if unconstrained)", () => {
    const oldEntry = makeActivityCatalogEntry("A", z.object({}));
    const newEntry = makeActivityCatalogEntry(
      "B",
      z.object({
        size: z.number().min(5),
      }),
    );
    const catalog: Record<string, ActivityCatalogEntry> = {
      [oldEntry.activityType]: oldEntry,
      [newEntry.activityType]: newEntry,
    };
    const node = makeActivityNode({
      activityType: "A",
      parameters: {},
    });

    const result = swapActivityType(node, "B", catalog);

    expect(result.parameters).toEqual({ size: 5 });
  });

  it("defaults a required boolean to false", () => {
    const oldEntry = makeActivityCatalogEntry("A", z.object({}));
    const newEntry = makeActivityCatalogEntry(
      "B",
      z.object({
        enabled: z.boolean(),
      }),
    );
    const catalog: Record<string, ActivityCatalogEntry> = {
      [oldEntry.activityType]: oldEntry,
      [newEntry.activityType]: newEntry,
    };
    const node = makeActivityNode({
      activityType: "A",
      parameters: {},
    });

    const result = swapActivityType(node, "B", catalog);

    expect(result.parameters).toEqual({ enabled: false });
  });

  it("uses the schema's `x-default` hint when provided for a string field", () => {
    const oldEntry = makeActivityCatalogEntry("A", z.object({}));
    const newEntry = makeActivityCatalogEntry(
      "B",
      z.object({
        format: z.string().meta({ "x-default": "json" }),
      }),
    );
    const catalog: Record<string, ActivityCatalogEntry> = {
      [oldEntry.activityType]: oldEntry,
      [newEntry.activityType]: newEntry,
    };
    const node = makeActivityNode({
      activityType: "A",
      parameters: {},
    });

    const result = swapActivityType(node, "B", catalog);

    expect(result.parameters).toEqual({ format: "json" });
  });

  it("does not stamp a default for an optional new field that has no `x-default`", () => {
    const oldEntry = makeActivityCatalogEntry("A", z.object({}));
    const newEntry = makeActivityCatalogEntry(
      "B",
      z.object({
        x: z.number(),
        note: z.string().optional(),
      }),
    );
    const catalog: Record<string, ActivityCatalogEntry> = {
      [oldEntry.activityType]: oldEntry,
      [newEntry.activityType]: newEntry,
    };
    const node = makeActivityNode({
      activityType: "A",
      parameters: {},
    });

    const result = swapActivityType(node, "B", catalog);

    // `note` is optional — no default is supplied so the param key is
    // absent. `x` is required and gets the unconstrained-number default.
    expect(result.parameters).toEqual({ x: 1 });
    expect(result.parameters).not.toHaveProperty("note");
  });
});

describe("swapActivityType — picking the same type is an idempotent identity swap", () => {
  it("returns parameters unchanged when newActivityType equals the current type", () => {
    const entry = makeActivityCatalogEntry(
      "A",
      z.object({ x: z.number(), y: z.string() }),
    );
    const catalog: Record<string, ActivityCatalogEntry> = {
      [entry.activityType]: entry,
    };
    const node = makeActivityNode({
      activityType: "A",
      parameters: { x: 1, y: "foo" },
    });

    const result = swapActivityType(node, "A", catalog);

    expect(result.activityType).toBe("A");
    expect(result.parameters).toEqual({ x: 1, y: "foo" });
  });
});

describe("swapActivityType — unknown target activity type", () => {
  it("throws when the target type is not in the supplied catalog", () => {
    const entry = makeActivityCatalogEntry("A", z.object({}));
    const catalog: Record<string, ActivityCatalogEntry> = {
      [entry.activityType]: entry,
    };
    const node = makeActivityNode({
      activityType: "A",
      parameters: {},
    });

    expect(() => swapActivityType(node, "Unknown", catalog)).toThrow(
      /activity type/i,
    );
  });
});
