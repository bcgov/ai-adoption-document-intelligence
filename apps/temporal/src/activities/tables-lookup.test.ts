import { MAX_LOOKUP_ROWS, tablesLookup } from "./tables-lookup";

const mockTable = { findUnique: jest.fn() };
const mockTableRow = { findMany: jest.fn() };

jest.mock("./database-client", () => ({
  getPrismaClient: () => ({
    referenceTable: mockTable,
    referenceTableRow: mockTableRow,
  }),
}));

describe("tablesLookup activity", () => {
  beforeEach(() => {
    mockTable.findUnique.mockReset();
    mockTableRow.findMany.mockReset();
  });

  it("returns the matched row for a single-row pick=first lookup", async () => {
    mockTable.findUnique.mockResolvedValue({
      lookups: [
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
      ],
    });
    mockTableRow.findMany.mockResolvedValue([
      { data: { cutoff: "2026-02-12", id: "feb" } },
      { data: { cutoff: "2026-03-12", id: "mar" } },
    ]);

    const result = await tablesLookup({
      groupId: "g",
      tableId: "t",
      lookupName: "byDate",
      submissionDate: "2026-02-05",
    });

    expect(result.result).toEqual({ cutoff: "2026-02-12", id: "feb" });
    // Verify the where clause uses the composite key (cross-group safety)
    expect(mockTable.findUnique).toHaveBeenCalledWith({
      where: { group_id_table_id: { group_id: "g", table_id: "t" } },
    });
    expect(mockTableRow.findMany).toHaveBeenCalledWith({
      where: { group_id: "g", table_id: "t" },
      take: MAX_LOOKUP_ROWS + 1,
    });
  });

  it("throws TABLES_NOT_FOUND when table missing (nonRetryable)", async () => {
    mockTable.findUnique.mockResolvedValue(null);
    await expect(
      tablesLookup({ groupId: "g", tableId: "missing", lookupName: "x" }),
    ).rejects.toMatchObject({
      type: "TABLES_NOT_FOUND",
      nonRetryable: true,
    });
    // tableRow.findMany should NOT be called when table is missing
    expect(mockTableRow.findMany).not.toHaveBeenCalled();
  });

  it("throws TABLES_LOOKUP_NOT_FOUND when named lookup missing on table", async () => {
    mockTable.findUnique.mockResolvedValue({
      lookups: [{ name: "other", pick: "first", params: [], filter: {} }],
    });
    await expect(
      tablesLookup({ groupId: "g", tableId: "t", lookupName: "missing" }),
    ).rejects.toMatchObject({
      type: "TABLES_LOOKUP_NOT_FOUND",
      nonRetryable: true,
    });
    expect(mockTableRow.findMany).not.toHaveBeenCalled();
  });

  it("translates LookupError TABLES_NO_MATCH from engine to ApplicationFailure (nonRetryable)", async () => {
    mockTable.findUnique.mockResolvedValue({
      lookups: [
        {
          name: "exact",
          params: [],
          filter: {
            operator: "equals",
            left: { ref: "row.x" },
            right: { literal: "never_matches" },
          },
          pick: "one",
        },
      ],
    });
    mockTableRow.findMany.mockResolvedValue([{ data: { x: "a" } }]);

    await expect(
      tablesLookup({ groupId: "g", tableId: "t", lookupName: "exact" }),
    ).rejects.toMatchObject({
      type: "TABLES_NO_MATCH",
      nonRetryable: true,
    });
  });

  it("returns null when pick=first and no rows match (does NOT throw)", async () => {
    mockTable.findUnique.mockResolvedValue({
      lookups: [
        {
          name: "maybe",
          params: [],
          filter: {
            operator: "equals",
            left: { ref: "row.x" },
            right: { literal: "never" },
          },
          pick: "first",
        },
      ],
    });
    mockTableRow.findMany.mockResolvedValue([{ data: { x: "a" } }]);

    const result = await tablesLookup({
      groupId: "g",
      tableId: "t",
      lookupName: "maybe",
    });
    expect(result.result).toBeNull();
  });

  it("requests at most MAX_LOOKUP_ROWS + 1 rows from the database", async () => {
    mockTable.findUnique.mockResolvedValue({
      lookups: [
        {
          name: "x",
          pick: "all",
          params: [],
          // Tautology — matches every row.
          filter: {
            operator: "equals",
            left: { literal: 1 },
            right: { literal: 1 },
          },
        },
      ],
    });
    mockTableRow.findMany.mockResolvedValue([]);

    await tablesLookup({ groupId: "g", tableId: "t", lookupName: "x" });

    expect(mockTableRow.findMany).toHaveBeenCalledWith({
      where: { group_id: "g", table_id: "t" },
      take: MAX_LOOKUP_ROWS + 1,
    });
  });

  it("throws TABLES_TOO_MANY_ROWS (nonRetryable) when row count exceeds the cap", async () => {
    mockTable.findUnique.mockResolvedValue({
      lookups: [
        {
          name: "x",
          pick: "all",
          params: [],
          // Tautology — matches every row.
          filter: {
            operator: "equals",
            left: { literal: 1 },
            right: { literal: 1 },
          },
        },
      ],
    });
    // Simulate the take limit returning MAX + 1 rows (the overflow signal).
    mockTableRow.findMany.mockResolvedValue(
      Array.from({ length: MAX_LOOKUP_ROWS + 1 }, (_, i) => ({
        data: { i },
      })),
    );

    await expect(
      tablesLookup({ groupId: "g", tableId: "t", lookupName: "x" }),
    ).rejects.toMatchObject({
      type: "TABLES_TOO_MANY_ROWS",
      nonRetryable: true,
    });
  });

  it("does NOT throw at exactly MAX_LOOKUP_ROWS rows", async () => {
    mockTable.findUnique.mockResolvedValue({
      lookups: [
        {
          name: "x",
          pick: "all",
          params: [],
          // Tautology — matches every row.
          filter: {
            operator: "equals",
            left: { literal: 1 },
            right: { literal: 1 },
          },
        },
      ],
    });
    mockTableRow.findMany.mockResolvedValue(
      Array.from({ length: MAX_LOOKUP_ROWS }, (_, i) => ({ data: { i } })),
    );

    const result = await tablesLookup({
      groupId: "g",
      tableId: "t",
      lookupName: "x",
    });
    expect(Array.isArray(result.result)).toBe(true);
  });

  it("throws TABLES_GROUP_ID_MISSING (nonRetryable) when groupId is missing", async () => {
    await expect(
      tablesLookup({
        groupId: "",
        tableId: "t",
        lookupName: "any",
      }),
    ).rejects.toMatchObject({
      type: "TABLES_GROUP_ID_MISSING",
      nonRetryable: true,
    });
    expect(mockTable.findUnique).not.toHaveBeenCalled();
  });
});
