import { describe, expect, it } from "vitest";
import type { JsonSchemaProperty } from "../json-schema-form";
import {
  findOrphanedParameterKeys,
  removeParameterKeys,
} from "./orphaned-parameters";

const props = (...names: string[]): Record<string, JsonSchemaProperty> =>
  Object.fromEntries(
    names.map((n) => [n, { type: "string" } as JsonSchemaProperty]),
  );

describe("findOrphanedParameterKeys (G-099)", () => {
  it("names a saved value the schema no longer declares", () => {
    expect(
      findOrphanedParameterKeys(
        { locale: "en-US", legacyMode: true },
        props("locale"),
      ),
    ).toEqual(["legacyMode"]);
  });

  it("returns nothing when every saved key is declared", () => {
    expect(
      findOrphanedParameterKeys({ locale: "en-US" }, props("locale", "extra")),
    ).toEqual([]);
  });

  it("sorts, so the notice reads the same on every render", () => {
    expect(findOrphanedParameterKeys({ zeta: 1, alpha: 2 }, props())).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("handles a node with no parameters and a schema with no properties", () => {
    expect(findOrphanedParameterKeys(undefined, props("a"))).toEqual([]);
    expect(findOrphanedParameterKeys({ a: 1 }, undefined)).toEqual(["a"]);
  });

  it("treats a key whose value is undefined as still present", () => {
    // It is a key in the saved object, so it still round-trips through save.
    expect(findOrphanedParameterKeys({ gone: undefined }, props())).toEqual([
      "gone",
    ]);
  });
});

describe("removeParameterKeys", () => {
  it("drops only the named keys", () => {
    expect(removeParameterKeys({ a: 1, b: 2, c: 3 }, ["b"])).toEqual({
      a: 1,
      c: 3,
    });
  });

  it("returns the same object when there is nothing to drop", () => {
    const input = { a: 1 };
    expect(removeParameterKeys(input, [])).toBe(input);
  });

  it("never mutates its input", () => {
    const input = { a: 1, b: 2 };
    removeParameterKeys(input, ["a"]);
    expect(input).toEqual({ a: 1, b: 2 });
  });

  it("clears every orphan the finder reported", () => {
    const params = { locale: "en-US", legacyMode: true, oldRetries: 3 };
    const orphans = findOrphanedParameterKeys(params, props("locale"));
    const cleaned = removeParameterKeys(params, orphans);
    expect(findOrphanedParameterKeys(cleaned, props("locale"))).toEqual([]);
    expect(cleaned).toEqual({ locale: "en-US" });
  });
});
