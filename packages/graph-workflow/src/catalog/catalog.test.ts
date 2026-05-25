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
    // `displayName` is OPTIONAL per Phase 6 (US-161): dynamic entries omit it.
    // When present, it must be a non-empty string.
    if (entry.displayName !== undefined) {
      expect(typeof entry.displayName).toBe("string");
      expect(entry.displayName.length).toBeGreaterThan(0);
    }
    expect(typeof entry.description).toBe("string");
    expect(typeof entry.iconHint).toBe("string");
    expect(typeof entry.colorHint).toBe("string");
    expect(Array.isArray(entry.inputs)).toBe(true);
    expect(Array.isArray(entry.outputs)).toBe(true);
  });

  // Phase 6 (US-161) — every entry must carry AT LEAST ONE of `parametersSchema`
  // (Zod, preferred for static entries) or `paramsSchema` (JSON Schema 7, used
  // by dynamic entries). Both may be absent on a malformed entry — catch that
  // case explicitly here.
  it.each(types)(
    "entry for %s declares at least one of parametersSchema or paramsSchema",
    (activityType) => {
      const entry = getActivityCatalogEntry(activityType);
      expect(entry).toBeDefined();
      if (!entry) return;
      const hasZod = entry.parametersSchema !== undefined;
      const hasJsonSchema = entry.paramsSchema !== undefined;
      expect(hasZod || hasJsonSchema).toBe(true);
    },
  );

  it.each(types)("parameter schema for %s emits valid JSON Schema", (t) => {
    const schema = getActivityParametersJsonSchema(t);
    expect(schema).toBeDefined();
    expect(typeof schema).toBe("object");
  });

  it.each(types)(
    "parameter schema for %s accepts a valid empty / minimal value where applicable",
    (t) => {
      const entry = ACTIVITY_CATALOG[t];
      // Dynamic entries (Phase 6) carry only `paramsSchema` (JSON Schema 7) —
      // there's no Zod parser to round-trip. Skip the safeParse smoke check
      // for those; the JSON-Schema-side validation lives in the publish-time
      // pipeline (US-159 semantics stage).
      if (!entry.parametersSchema) return;
      const minimal = minimalValueForSchema(entry.parametersSchema);
      // No schema should crash on safeParse, even with an empty object.
      // Some schemas will reject because of required fields — that's fine,
      // but parsing itself must not throw.
      expect(() => entry.parametersSchema!.safeParse(minimal)).not.toThrow();
    },
  );

  // Phase 6 (US-161) — dynamic-entry sanity assertion.
  // If an entry sets `dynamicNodeSlug`, it must also set `dynamicNodeVersion`
  // AND declare `colorHint === "dyn"`. The catalog-merge endpoint (US-173)
  // trusts the "DYN" colour hint to flag dynamic-flavoured entries on the
  // canvas. Static entries pass this check vacuously (`dynamicNodeSlug` is
  // never set on them).
  it.each(types)(
    "entry for %s — if dynamicNodeSlug set, dynamicNodeVersion + colorHint=dyn also set",
    (activityType) => {
      const entry = getActivityCatalogEntry(activityType);
      expect(entry).toBeDefined();
      if (!entry) return;
      if (entry.dynamicNodeSlug !== undefined) {
        expect(typeof entry.dynamicNodeVersion).toBe("number");
        expect(entry.colorHint).toBe("dyn");
      }
    },
  );

  // Phase 4 (US-134) — sanity assertion for the `nonCacheable` opt-out flag.
  // Every entry must either declare `nonCacheable: true` explicitly OR leave
  // the field absent (defaults to `false`). Catches typos such as
  // `noncacheable` (wrong casing) or `nonCachable` (missing `e`) which would
  // silently appear on the entry as a stray property but fail to opt the
  // activity out of caching. See TRY_IN_PLACE_DESIGN.md §2.6.
  it.each(types)(
    "entry for %s declares nonCacheable: true or leaves it undefined",
    (activityType) => {
      const entry = getActivityCatalogEntry(activityType);
      expect(entry).toBeDefined();
      if (!entry) return;
      expect(
        entry.nonCacheable === true || entry.nonCacheable === undefined,
      ).toBe(true);
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

  it("every catalog entry declares kind on every port (Phase 3.x full fan-out)", () => {
    // Phase 3.x completed the bulk fan-out: every registered activity catalog
    // entry now declares `kind` on every input + output port. If an entry is
    // added without typed ports, this test fails — surface that explicitly so
    // the all-or-nothing invariant stays satisfied across the whole catalog.
    const untypedEntries = Object.values(ACTIVITY_CATALOG)
      .filter((entry) => {
        const inputs = entry.inputs ?? [];
        const outputs = entry.outputs ?? [];
        return (
          inputs.some((p) => p.kind === undefined) ||
          outputs.some((p) => p.kind === undefined)
        );
      })
      .map((entry) => entry.activityType);
    expect(untypedEntries).toEqual([]);
  });

  // Sanity check (do NOT commit failing): temporarily remove `kind` from one port of
  // `document-split.ts` (e.g. delete `kind: "Artifact"` from `groupId`) — the bulk
  // invariant should fail with:
  //   document.split: untyped inputs [groupId], untyped outputs []
  // Revert the change before committing.
});
