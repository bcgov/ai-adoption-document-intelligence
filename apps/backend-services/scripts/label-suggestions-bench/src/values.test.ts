import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRng, seedFor, valueFor } from "./values";

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const first = [a(), a(), a()];
    assert.deepEqual([b(), b(), b()], first);
    assert.ok(first.every((n) => n >= 0 && n < 1));
  });

  it("gives different copies different seeds", () => {
    assert.notEqual(seedFor("form-a", 1), seedFor("form-a", 2));
    assert.equal(seedFor("form-a", 1), seedFor("form-a", 1));
  });
});

describe("valueFor", () => {
  it("picks a value shaped like the field name", () => {
    const rng = createRng(7);
    assert.match(
      valueFor("Telephone", false, undefined, rng),
      /^\d{3}-555-\d{4}$/,
    );
    assert.match(
      valueFor("Postal Code", false, undefined, rng),
      /^[A-Z]\d[A-Z] \d[A-Z]\d$/,
    );
    assert.match(
      valueFor("Date of hearing", false, undefined, rng),
      /^\d{4}-\d{2}-\d{2}$/,
    );
    assert.match(
      valueFor("Email address", false, undefined, rng),
      /^[a-z]+\.[a-z]+@example\.com$/,
    );
    assert.match(
      valueFor("Claimant name", false, undefined, rng),
      /^[A-Z][a-z]+ [A-Z][a-zA-Z]+$/,
    );
  });

  it("respects the field's maximum length", () => {
    const value = valueFor("Comments", true, 12, createRng(3));
    assert.ok(value.length <= 12);
  });
});
