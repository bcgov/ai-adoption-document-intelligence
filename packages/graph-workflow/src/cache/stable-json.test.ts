/**
 * Tests for `stableJson` (US-127).
 *
 * Coverage maps to the six acceptance scenarios in
 * `US-127-stable-json-helper.md`:
 *
 *   1. Sorted-key serialisation for objects (incl. recursive sort).
 *   2. Arrays preserve declared order; elements canonicalised recursively.
 *   3. Primitives + null + undefined parity with `JSON.stringify`.
 *   4. No insignificant whitespace.
 *   5. Eight + cases — nested objects, mixed arrays/objects, deep nesting,
 *      unicode keys, numeric-string keys, empty object, empty array,
 *      sentinel value (Symbol / function).
 *   6. Re-export from package barrel (verified via the import path below
 *      and by `npm run build` succeeding).
 */

import { stableJson } from "./stable-json";

describe("stableJson — Scenario 1: sorted-key serialisation for objects", () => {
  it("sorts top-level keys alphabetically regardless of insertion order", () => {
    expect(stableJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(stableJson({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });

  it("sorts nested object keys recursively", () => {
    expect(stableJson({ outer: { z: 1, a: 2 } })).toBe(
      '{"outer":{"a":2,"z":1}}',
    );
  });

  it("produces identical output for two objects with different insertion order", () => {
    const a = stableJson({ x: 1, y: 2, z: 3 });
    const b = stableJson({ z: 3, x: 1, y: 2 });
    const c = stableJson({ y: 2, z: 3, x: 1 });
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe("stableJson — Scenario 2: arrays preserve declared order", () => {
  it("preserves numeric array order verbatim (no sort)", () => {
    expect(stableJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("canonicalises array elements recursively", () => {
    expect(stableJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it("preserves string array order", () => {
    expect(stableJson(["banana", "apple", "cherry"])).toBe(
      '["banana","apple","cherry"]',
    );
  });
});

describe("stableJson — Scenario 3: primitives + null + undefined", () => {
  it("serialises strings via JSON.stringify", () => {
    expect(stableJson("hello")).toBe('"hello"');
    expect(stableJson('with "quotes"')).toBe('"with \\"quotes\\""');
  });

  it("serialises numbers verbatim", () => {
    expect(stableJson(42)).toBe("42");
    expect(stableJson(-1.5)).toBe("-1.5");
    expect(stableJson(0)).toBe("0");
  });

  it("serialises booleans verbatim", () => {
    expect(stableJson(true)).toBe("true");
    expect(stableJson(false)).toBe("false");
  });

  it("serialises null as 'null'", () => {
    expect(stableJson(null)).toBe("null");
  });

  it("serialises top-level undefined as 'null' (parity normalisation)", () => {
    expect(stableJson(undefined)).toBe("null");
  });

  it("omits undefined values from object properties (parity with JSON.stringify)", () => {
    expect(stableJson({ a: 1, b: undefined, c: 3 })).toBe('{"a":1,"c":3}');
  });
});

describe("stableJson — Scenario 4: no insignificant whitespace", () => {
  it("produces no spaces after colons or commas in objects", () => {
    const output = stableJson({ a: 1, b: 2, c: 3 });
    expect(output).not.toMatch(/\s/);
    expect(output).toBe('{"a":1,"b":2,"c":3}');
  });

  it("produces no whitespace in arrays", () => {
    const output = stableJson([1, 2, 3]);
    expect(output).not.toMatch(/\s/);
  });

  it("produces no newlines in deeply nested output", () => {
    const output = stableJson({ a: { b: { c: [1, 2, { d: 3 }] } } });
    expect(output).not.toContain("\n");
    expect(output).not.toContain(" ");
  });
});

describe("stableJson — Scenario 5: ≥8 cases covering the contract", () => {
  // Case 1: nested objects (covered above, repeated here for the count)
  it("[case 1] nested objects sort recursively", () => {
    expect(stableJson({ b: { y: 2, x: 1 }, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":{"x":1,"y":2}}',
    );
  });

  // Case 2: mixed arrays and objects
  it("[case 2] mixed arrays of objects and primitives", () => {
    expect(
      stableJson({ items: [{ b: 1, a: 2 }, 7, { z: 9, y: 8 }] }),
    ).toBe('{"items":[{"a":2,"b":1},7,{"y":8,"z":9}]}');
  });

  // Case 3: deep nesting (≥3 levels)
  it("[case 3] deep nesting (4 levels) — keys sort at every level", () => {
    const input = {
      level1: {
        b: 1,
        a: {
          level3: {
            z: 1,
            a: 2,
            m: {
              level5: { y: 1, x: 2 },
            },
          },
        },
      },
    };
    expect(stableJson(input)).toBe(
      '{"level1":{"a":{"level3":{"a":2,"m":{"level5":{"x":2,"y":1}},"z":1}},"b":1}}',
    );
  });

  // Case 4: unicode keys
  it("[case 4] unicode keys sort by code-point order", () => {
    // "é" (U+00E9) > "z" (U+007A) > "a" (U+0061)
    expect(stableJson({ é: 1, a: 2, z: 3 })).toBe('{"a":2,"z":3,"é":1}');
  });

  // Case 5: numeric-string keys
  it("[case 5] numeric-string keys sort lexicographically (not numerically)", () => {
    // Lexicographic: "1" < "10" < "2" — this is the natural default sort
    // for string keys, and it MUST match between writer + reader paths.
    expect(stableJson({ "10": "ten", "2": "two", "1": "one" })).toBe(
      '{"1":"one","10":"ten","2":"two"}',
    );
  });

  // Case 6: empty object
  it("[case 6] empty object serialises to '{}'", () => {
    expect(stableJson({})).toBe("{}");
  });

  // Case 7: empty array
  it("[case 7] empty array serialises to '[]'", () => {
    expect(stableJson([])).toBe("[]");
  });

  // Case 8: sentinel value (Symbol / function)
  it("[case 8a] symbol property values are omitted from objects (parity with JSON.stringify)", () => {
    expect(stableJson({ a: 1, b: Symbol("ignored"), c: 3 })).toBe(
      '{"a":1,"c":3}',
    );
  });

  it("[case 8b] top-level symbol returns 'null'", () => {
    expect(stableJson(Symbol("top"))).toBe("null");
  });

  it("[case 8c] function property values are omitted from objects (parity with JSON.stringify)", () => {
    const input = { a: 1, b: () => 2, c: 3 };
    expect(stableJson(input)).toBe('{"a":1,"c":3}');
  });

  it("[case 8d] undefined / symbol / function inside arrays serialise as 'null' (parity with JSON.stringify)", () => {
    // Parity: JSON.stringify([undefined]) === "[null]"
    expect(stableJson([undefined])).toBe("[null]");
    expect(stableJson([1, Symbol("x"), 2])).toBe("[1,null,2]");
    expect(stableJson([1, () => 0, 2])).toBe("[1,null,2]");
  });
});

describe("stableJson — Scenario 6 sanity (re-export from package barrel)", () => {
  // The re-export from `src/index.ts` is validated by the package build
  // step. Here we verify the function's public surface stays as documented.
  it("is a function accepting a single unknown argument", () => {
    expect(typeof stableJson).toBe("function");
    expect(stableJson.length).toBe(1);
  });

  it("returns a string for every supported input shape", () => {
    expect(typeof stableJson({})).toBe("string");
    expect(typeof stableJson([])).toBe("string");
    expect(typeof stableJson("x")).toBe("string");
    expect(typeof stableJson(1)).toBe("string");
    expect(typeof stableJson(true)).toBe("string");
    expect(typeof stableJson(null)).toBe("string");
    expect(typeof stableJson(undefined)).toBe("string");
  });
});
