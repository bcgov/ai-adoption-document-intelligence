import { describe, expect, it } from "vitest";
import type { RunSpecInputSchema } from "../../../data/hooks/useWorkflows";
import { buildStubInput } from "./build-stub-input";

const schema = (
  properties: RunSpecInputSchema["properties"],
): RunSpecInputSchema => ({
  type: "object",
  properties,
  required: [],
});

describe("buildStubInput", () => {
  it("returns empty object when schema has no properties", () => {
    expect(buildStubInput(schema({}))).toEqual({});
  });

  it("uses defaults when present", () => {
    expect(
      buildStubInput(
        schema({
          count: { type: "number", default: 5 },
          enabled: { type: "boolean", default: true },
        }),
      ),
    ).toEqual({ count: 5, enabled: true });
  });

  it("uses type-appropriate stubs when no default is set", () => {
    expect(
      buildStubInput(
        schema({
          customerId: { type: "string" },
          count: { type: "number" },
          flag: { type: "boolean" },
          payload: { type: "object" },
          items: { type: "array" },
        }),
      ),
    ).toEqual({
      customerId: "",
      count: 0,
      flag: false,
      payload: {},
      items: [],
    });
  });

  it("respects insertion order of schema properties", () => {
    const body = buildStubInput(
      schema({
        b: { type: "string" },
        a: { type: "string" },
        c: { type: "string" },
      }),
    );
    expect(Object.keys(body)).toEqual(["b", "a", "c"]);
  });
});
