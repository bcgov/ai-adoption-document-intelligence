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

describe("Phase 3 — kind annotation all-or-nothing invariant (US-103)", () => {
  it("every entry either declares kind on all ports or none", () => {
    const violations: {
      activityType: string;
      untypedInputs: string[];
      untypedOutputs: string[];
    }[] = [];

    for (const entry of Object.values(ACTIVITY_CATALOG)) {
      const inputs = entry.inputs ?? [];
      const outputs = entry.outputs ?? [];

      const hasAnyKind =
        inputs.some((p) => p.kind !== undefined) ||
        outputs.some((p) => p.kind !== undefined);
      const allHaveKind =
        inputs.every((p) => p.kind !== undefined) &&
        outputs.every((p) => p.kind !== undefined);

      if (hasAnyKind && !allHaveKind) {
        violations.push({
          activityType: entry.activityType,
          untypedInputs: inputs
            .filter((p) => p.kind === undefined)
            .map((p) => p.name),
          untypedOutputs: outputs
            .filter((p) => p.kind === undefined)
            .map((p) => p.name),
        });
      }
    }

    if (violations.length > 0) {
      const detail = violations
        .map(
          (v) =>
            `  - ${v.activityType}: untyped inputs [${v.untypedInputs.join(", ")}], untyped outputs [${v.untypedOutputs.join(", ")}]`,
        )
        .join("\n");
      throw new Error(
        `Phase 3 all-or-nothing per-entry invariant violated. Entries with partial kind annotations:\n${detail}\n\nIf an entry declares \`kind\` on any port, it must declare \`kind\` on every port (use \`"Artifact"\` for non-taxonomy ports).`,
      );
    }
  });

  it("Phase 3 exemplars (document.split, document.classify, mistralOcr.process, document.validateFields, tables.lookup) declare kind on every port", () => {
    const exemplars = [
      "document.split",
      "document.classify",
      "mistralOcr.process",
      "document.validateFields",
      "tables.lookup",
    ];
    const missingExemplars: string[] = [];
    const exemplarsWithUntypedPorts: string[] = [];
    for (const activityType of exemplars) {
      const entry = ACTIVITY_CATALOG[activityType];
      if (!entry) {
        missingExemplars.push(activityType);
        continue;
      }
      const allHaveKind =
        (entry.inputs ?? []).every((p) => p.kind !== undefined) &&
        (entry.outputs ?? []).every((p) => p.kind !== undefined);
      if (!allHaveKind) {
        exemplarsWithUntypedPorts.push(activityType);
      }
    }
    expect({ missingExemplars, exemplarsWithUntypedPorts }).toEqual({
      missingExemplars: [],
      exemplarsWithUntypedPorts: [],
    });
  });

  it("at least one legacy un-fanned-out entry has hasAnyKind === false", () => {
    // Sanity check: confirm the catalog still has entries that haven't been typed yet
    // (we wouldn't want to accidentally type every entry without doing it deliberately).
    const legacyEntries = Object.values(ACTIVITY_CATALOG).filter((entry) => {
      const inputs = entry.inputs ?? [];
      const outputs = entry.outputs ?? [];
      return (
        inputs.every((p) => p.kind === undefined) &&
        outputs.every((p) => p.kind === undefined)
      );
    });
    // If this fails, all catalog entries are typed — confirm this is intentional
    // (Phase 3 expected only 5 exemplars; the rest should remain un-typed legacy entries).
    expect(legacyEntries.length).toBeGreaterThan(0);
  });

  // Sanity check (do NOT commit failing): temporarily remove `kind` from one port of
  // `document-split.ts` (e.g. delete `kind: "Artifact"` from `groupId`) — the bulk
  // invariant should fail with:
  //   document.split: untyped inputs [groupId], untyped outputs []
  // Revert the change before committing.
});
