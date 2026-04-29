import { describe, expect, it } from "vitest";
import type { ColumnDef } from "../types";
import { customJson } from "./custom-json";
import { earliestAfter } from "./earliest-after";
import { exactMatch } from "./exact-match";
import { LOOKUP_TEMPLATES, templateFor } from "./index";
import { latestBefore } from "./latest-before";
import { multiFieldExact } from "./multi-field-exact";
import { rangeContains } from "./range-contains";

const cols: ColumnDef[] = [
  { key: "cutoff", label: "Cutoff", type: "date" },
  { key: "report_end", label: "Report End", type: "date" },
  { key: "name", label: "Name", type: "string" },
];

describe("exactMatch round-trip", () => {
  it("recovers form values", () => {
    const lookup = exactMatch.toLookupDef(
      "byName",
      { column: "name", param: "n" },
      cols,
    );
    expect(exactMatch.fromLookupDef(lookup)).toEqual({
      column: "name",
      param: "n",
    });
  });
});

describe("rangeContains round-trip", () => {
  it("recovers form values", () => {
    const lookup = rangeContains.toLookupDef(
      "byPeriod",
      {
        startColumn: "cutoff",
        endColumn: "report_end",
        param: "submissionDate",
      },
      cols,
    );
    expect(rangeContains.fromLookupDef(lookup)).toEqual({
      startColumn: "cutoff",
      endColumn: "report_end",
      param: "submissionDate",
    });
  });
});

describe("latestBefore round-trip", () => {
  it("recovers form values", () => {
    const lookup = latestBefore.toLookupDef(
      "lastCutoff",
      { column: "cutoff", param: "submissionDate" },
      cols,
    );
    expect(latestBefore.fromLookupDef(lookup)).toEqual({
      column: "cutoff",
      param: "submissionDate",
    });
  });
});

describe("earliestAfter round-trip", () => {
  it("recovers form values", () => {
    const lookup = earliestAfter.toLookupDef(
      "byDate",
      { column: "cutoff", param: "submissionDate" },
      cols,
    );
    expect(earliestAfter.fromLookupDef(lookup)).toEqual({
      column: "cutoff",
      param: "submissionDate",
    });
  });
});

describe("multiFieldExact round-trip", () => {
  it("recovers form values with multiple pairs", () => {
    const lookup = multiFieldExact.toLookupDef(
      "byTwo",
      {
        pairs: [
          { column: "name", param: "n" },
          { column: "cutoff", param: "c" },
        ],
      },
      cols,
    );
    expect(multiFieldExact.fromLookupDef(lookup)).toEqual({
      pairs: [
        { column: "name", param: "n" },
        { column: "cutoff", param: "c" },
      ],
    });
  });
});

describe("customJson round-trip", () => {
  it("preserves filter JSON, params, order, pick", () => {
    const filter = {
      operator: "equals",
      left: { ref: "row.x" },
      right: { literal: 1 },
    };
    const lookup = customJson.toLookupDef(
      "raw",
      {
        filterJson: JSON.stringify(filter),
        params: [{ name: "p", type: "string" }],
        order: [{ field: "x", direction: "asc" }],
        pick: "all",
      },
      cols,
    );
    const recovered = customJson.fromLookupDef(lookup);
    expect(JSON.parse(recovered?.filterJson as string)).toEqual(filter);
    expect(recovered?.params).toEqual([{ name: "p", type: "string" }]);
    expect(recovered?.pick).toBe("all");
  });
});

describe("templateFor", () => {
  it("dispatches to the template via templateId", () => {
    const lookup = exactMatch.toLookupDef(
      "n",
      { column: "name", param: "p" },
      cols,
    );
    expect(templateFor(lookup).id).toBe("exact-match");
  });

  it("falls back to customJson when no template matches", () => {
    const lookup = {
      name: "raw",
      params: [],
      filter: {
        operator: "equals",
        left: { ref: "row.x" },
        right: { literal: 1 },
      },
      pick: "first" as const,
    };
    expect(templateFor(lookup).id).toBe("custom-json");
  });

  it("LOOKUP_TEMPLATES exposes all 6 templates", () => {
    expect(LOOKUP_TEMPLATES.map((t) => t.id)).toEqual([
      "exact-match",
      "range-contains",
      "latest-before",
      "earliest-after",
      "multi-field-exact",
      "custom-json",
    ]);
  });
});
