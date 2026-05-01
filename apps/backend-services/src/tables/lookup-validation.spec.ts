import { validateLookupDefs } from "./lookup-validation";
import type { ColumnDef, LookupDef } from "./types";

const cols: ColumnDef[] = [
  { key: "cutoff", label: "Cutoff", type: "date" },
  { key: "scheduleId", label: "Schedule ID", type: "string" },
];

describe("validateLookupDefs", () => {
  it("accepts a valid date-range lookup", () => {
    const lookups: LookupDef[] = [
      {
        name: "byDate",
        params: [{ name: "submissionDate", type: "datetime" }],
        filter: {
          operator: "lte",
          left: { ref: "param.submissionDate" },
          right: { ref: "row.cutoff" },
        },
        order: [{ field: "cutoff", direction: "asc" }],
        pick: "first",
      },
    ];
    expect(() => validateLookupDefs(lookups, cols)).not.toThrow();
  });

  it("rejects duplicate lookup names", () => {
    const lookups: LookupDef[] = [
      {
        name: "x",
        params: [],
        filter: {
          operator: "is-not-null",
          value: { ref: "row.cutoff" },
        } as never,
        pick: "all",
      },
      {
        name: "x",
        params: [],
        filter: {
          operator: "is-not-null",
          value: { ref: "row.cutoff" },
        } as never,
        pick: "all",
      },
    ];
    expect(() => validateLookupDefs(lookups, cols)).toThrow(
      /duplicate lookup name/i,
    );
  });

  it("rejects order referencing unknown column", () => {
    const lookups: LookupDef[] = [
      {
        name: "x",
        params: [],
        filter: {
          operator: "is-not-null",
          value: { ref: "row.cutoff" },
        } as never,
        order: [{ field: "missing", direction: "asc" }],
        pick: "first",
      },
    ];
    expect(() => validateLookupDefs(lookups, cols)).toThrow(
      /unknown column.*missing/i,
    );
  });

  it("rejects row.X reference to unknown column", () => {
    const lookups: LookupDef[] = [
      {
        name: "x",
        params: [],
        filter: {
          operator: "equals",
          left: { ref: "row.nope" },
          right: { literal: 1 },
        },
        pick: "first",
      },
    ];
    expect(() => validateLookupDefs(lookups, cols)).toThrow(
      /unknown column.*nope/i,
    );
  });

  it("rejects param.X reference to undeclared param", () => {
    const lookups: LookupDef[] = [
      {
        name: "x",
        params: [{ name: "a", type: "string" }],
        filter: {
          operator: "equals",
          left: { ref: "param.b" },
          right: { ref: "row.scheduleId" },
        },
        pick: "first",
      },
    ];
    expect(() => validateLookupDefs(lookups, cols)).toThrow(
      /undeclared param.*b/i,
    );
  });

  it("descends into nested and/or to find unknown column", () => {
    const lookups: LookupDef[] = [
      {
        name: "x",
        params: [],
        filter: {
          operator: "and",
          operands: [
            { operator: "is-not-null", value: { ref: "row.cutoff" } },
            {
              operator: "equals",
              left: { ref: "row.unknown" },
              right: { literal: 1 },
            },
          ],
        } as never,
        pick: "all",
      },
    ];
    expect(() => validateLookupDefs(lookups, cols)).toThrow(
      /unknown column.*unknown/i,
    );
  });

  it("validates in/not-in list members against columns", () => {
    const lookups: LookupDef[] = [
      {
        name: "x",
        params: [],
        filter: {
          operator: "in",
          value: { ref: "row.scheduleId" },
          list: { ref: "row.unknown" },
        } as never,
        pick: "all",
      },
    ];
    expect(() => validateLookupDefs(lookups, cols)).toThrow(
      /unknown column.*unknown/i,
    );
  });

  it("allows ctx.X references without validation", () => {
    const lookups: LookupDef[] = [
      {
        name: "x",
        params: [],
        filter: {
          operator: "equals",
          left: { ref: "ctx.someKey" },
          right: { ref: "row.scheduleId" },
        },
        pick: "all",
      },
    ];
    expect(() => validateLookupDefs(lookups, cols)).not.toThrow();
  });
});
