import type { ConditionExpression } from "../graph-workflow-types";
import { executeLookup, LookupError } from "./lookup-engine";
import type { LookupDef } from "./types";

// Base lookup fixture: filter rows where row.cutoff >= param.submissionDate
const baseLookup: LookupDef = {
  name: "cutoffLookup",
  params: [{ name: "submissionDate", type: "date" }],
  filter: {
    operator: "gte",
    left: { ref: "row.cutoff" },
    right: { ref: "param.submissionDate" },
  } as ConditionExpression,
  order: [{ field: "cutoff", direction: "asc" }],
  pick: "first",
};

const rows = [
  { cutoff: "2026-02-12", label: "Week 2" },
  { cutoff: "2026-01-15", label: "Week 1 (past)" },
  { cutoff: "2026-03-05", label: "Week 3" },
];

describe("executeLookup", () => {
  it("pick=first: returns earliest matching row after sort", () => {
    const result = executeLookup(
      baseLookup,
      { submissionDate: "2026-02-05" },
      rows,
    );
    expect(result).toEqual({ cutoff: "2026-02-12", label: "Week 2" });
  });

  it("pick=first: returns null when no rows match", () => {
    const result = executeLookup(
      baseLookup,
      { submissionDate: "2026-02-05" },
      [],
    );
    expect(result).toBeNull();
  });

  it("pick=one: throws TABLES_NO_MATCH when 0 rows match", () => {
    const lookup: LookupDef = { ...baseLookup, pick: "one" };
    let thrown: unknown;
    try {
      executeLookup(lookup, { submissionDate: "2026-02-05" }, []);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(LookupError);
    expect((thrown as LookupError).code).toBe("TABLES_NO_MATCH");
  });

  it("pick=one: throws TABLES_AMBIGUOUS_MATCH when >1 rows match", () => {
    const lookup: LookupDef = { ...baseLookup, pick: "one" };
    const twoMatchingRows = [
      { cutoff: "2026-02-12", label: "Week 2" },
      { cutoff: "2026-03-05", label: "Week 3" },
    ];
    let thrown: unknown;
    try {
      executeLookup(lookup, { submissionDate: "2026-02-05" }, twoMatchingRows);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(LookupError);
    expect((thrown as LookupError).code).toBe("TABLES_AMBIGUOUS_MATCH");
  });

  it("pick=all: returns array of all matching rows", () => {
    const lookup: LookupDef = { ...baseLookup, pick: "all" };
    const twoMatchingRows = [
      { cutoff: "2026-02-12", label: "Week 2" },
      { cutoff: "2026-03-05", label: "Week 3" },
    ];
    const result = executeLookup(
      lookup,
      { submissionDate: "2026-02-05" },
      twoMatchingRows,
    );
    expect(Array.isArray(result)).toBe(true);
    expect((result as Array<Record<string, unknown>>).length).toBe(2);
  });

  it("pick=last: returns latest matching row after sort", () => {
    const lookup: LookupDef = { ...baseLookup, pick: "last" };
    const result = executeLookup(
      lookup,
      { submissionDate: "2026-02-05" },
      rows,
    );
    // After filter (cutoff >= 2026-02-05): "2026-02-12" and "2026-03-05"
    // After sort asc: ["2026-02-12", "2026-03-05"]
    // last => "2026-03-05"
    expect(result).toEqual({ cutoff: "2026-03-05", label: "Week 3" });
  });
});
