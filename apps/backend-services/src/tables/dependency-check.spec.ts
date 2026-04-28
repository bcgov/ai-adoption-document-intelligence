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
});
