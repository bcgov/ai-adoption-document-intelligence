import { findLookupsReferencingColumn } from "./dependency-check";
import type { LookupDef } from "./types";

const lookups: LookupDef[] = [
  {
    name: "byDate",
    params: [{ name: "p", type: "datetime" }],
    filter: {
      operator: "lte",
      left: { ref: "param.p" },
      right: { ref: "row.cutoff" },
    },
    order: [{ field: "cutoff", direction: "asc" }],
    pick: "first",
  },
  {
    name: "byId",
    params: [{ name: "id", type: "string" }],
    filter: {
      operator: "equals",
      left: { ref: "param.id" },
      right: { ref: "row.scheduleId" },
    },
    pick: "one",
  },
];

describe("findLookupsReferencingColumn", () => {
  it("finds lookups whose filter references the column", () => {
    expect(findLookupsReferencingColumn(lookups, "cutoff")).toEqual(["byDate"]);
    expect(findLookupsReferencingColumn(lookups, "scheduleId")).toEqual([
      "byId",
    ]);
  });

  it("finds lookups whose order references the column", () => {
    // 'cutoff' is in both filter and order of 'byDate'
    expect(findLookupsReferencingColumn(lookups, "cutoff")).toEqual(["byDate"]);
  });

  it("returns empty when no lookup references the column", () => {
    expect(findLookupsReferencingColumn(lookups, "unrelated")).toEqual([]);
  });

  it("finds lookups via nested and/or operators", () => {
    const lks: LookupDef[] = [
      {
        name: "nested",
        params: [],
        filter: {
          operator: "and",
          operands: [
            { operator: "is-not-null", value: { ref: "row.scheduleId" } },
            {
              operator: "equals",
              left: { ref: "row.cutoff" },
              right: { literal: "x" },
            },
          ],
        } as never,
        pick: "all",
      },
    ];
    expect(findLookupsReferencingColumn(lks, "cutoff")).toEqual(["nested"]);
  });

  it("finds lookups via not operator", () => {
    const lks: LookupDef[] = [
      {
        name: "negated",
        params: [],
        filter: {
          operator: "not",
          operand: { operator: "is-null", value: { ref: "row.cutoff" } },
        } as never,
        pick: "all",
      },
    ];
    expect(findLookupsReferencingColumn(lks, "cutoff")).toEqual(["negated"]);
  });

  it("finds lookups via in operator's list ref", () => {
    // ListMembershipExpression.list is a single ValueRef, not an array
    const lks: LookupDef[] = [
      {
        name: "membership",
        params: [{ name: "p", type: "string" }],
        filter: {
          operator: "in",
          value: { ref: "param.p" },
          list: { ref: "row.cutoff" },
        } as never,
        pick: "all",
      },
    ];
    expect(findLookupsReferencingColumn(lks, "cutoff")).toEqual(["membership"]);
  });

  it("matches dot-suffix subpath references (row.cutoff.year matches column 'cutoff')", () => {
    const lks: LookupDef[] = [
      {
        name: "subpath",
        params: [],
        filter: {
          operator: "equals",
          left: { ref: "row.cutoff.year" },
          right: { literal: 2026 },
        },
        pick: "all",
      },
    ];
    expect(findLookupsReferencingColumn(lks, "cutoff")).toEqual(["subpath"]);
    // The subpath segment 'year' is not a column key match
    expect(findLookupsReferencingColumn(lks, "year")).toEqual([]);
  });

  it("ignores ctx.X references", () => {
    const lks: LookupDef[] = [
      {
        name: "ctxRef",
        params: [],
        filter: {
          operator: "equals",
          left: { ref: "ctx.cutoff" },
          right: { literal: 1 },
        },
        pick: "all",
      },
    ];
    expect(findLookupsReferencingColumn(lks, "cutoff")).toEqual([]);
  });

  it("finds lookups via order-only reference (no filter ref)", () => {
    const lks: LookupDef[] = [
      {
        name: "orderOnly",
        params: [],
        filter: {
          operator: "is-not-null",
          value: { ref: "row.scheduleId" },
        } as never,
        order: [{ field: "cutoff", direction: "asc" }],
        pick: "first",
      },
    ];
    expect(findLookupsReferencingColumn(lks, "cutoff")).toEqual(["orderOnly"]);
  });
});
