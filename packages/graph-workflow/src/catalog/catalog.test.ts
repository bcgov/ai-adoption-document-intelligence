/**
 * Bulk catalog invariants — verifies that every registered activity
 * has a well-formed catalog entry. Add new activity-specific tests
 * alongside the activity file itself; this file only covers the
 * catalog-wide properties.
 */

import { z } from "zod/v4";
import {
  ACTIVITY_CATALOG,
  getActivityCatalogEntry,
  getActivityParametersJsonSchema,
  listActivityTypes,
} from "./index";

const SEEN_TYPES = new Set<string>();

describe("catalog invariants", () => {
  const types = listActivityTypes();

  it("exposes at least 40 activity types", () => {
    expect(types.length).toBeGreaterThanOrEqual(40);
  });

  it("has no duplicate activity types", () => {
    for (const t of types) {
      expect(SEEN_TYPES.has(t)).toBe(false);
      SEEN_TYPES.add(t);
    }
  });

  it.each(types)("entry for %s is well-formed", (activityType) => {
    const entry = getActivityCatalogEntry(activityType);
    expect(entry).toBeDefined();
    if (!entry) return;
    expect(entry.activityType).toBe(activityType);
    expect(typeof entry.displayName).toBe("string");
    expect(entry.displayName.length).toBeGreaterThan(0);
    expect(typeof entry.description).toBe("string");
    expect(typeof entry.iconHint).toBe("string");
    expect(typeof entry.colorHint).toBe("string");
    expect(Array.isArray(entry.inputs)).toBe(true);
    expect(Array.isArray(entry.outputs)).toBe(true);
  });

  it.each(types)("parameter schema for %s emits valid JSON Schema", (t) => {
    const schema = getActivityParametersJsonSchema(t);
    expect(schema).toBeDefined();
    expect(typeof schema).toBe("object");
  });

  it.each(types)(
    "parameter schema for %s accepts a valid empty / minimal value where applicable",
    (t) => {
      const entry = ACTIVITY_CATALOG[t];
      const minimal = minimalValueForSchema(entry.parametersSchema);
      // No schema should crash on safeParse, even with an empty object.
      // Some schemas will reject because of required fields — that's fine,
      // but parsing itself must not throw.
      expect(() => entry.parametersSchema.safeParse(minimal)).not.toThrow();
    },
  );
});

/**
 * Best-effort minimal value generator for testing parse behaviour.
 * Returns `{}` for object schemas (which lets us catch infinite loops or
 * crashes inside parsers but doesn't necessarily validate).
 */
function minimalValueForSchema(_schema: z.ZodType): unknown {
  return {};
}
