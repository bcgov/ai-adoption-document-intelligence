import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AuditService } from "@/audit/audit.service";
import { TablesService } from "./tables.service";
import { TablesDbService } from "./tables-db.service";
import type { ColumnDef, LookupDef } from "./types";

// Minimal Prisma-shaped table fixture. The cast to `unknown` avoids fighting
// Prisma's JsonValue types in unit test fixtures; the real Prisma typing is
// covered by the db-service tests.
function makeTable(
  overrides: {
    columns?: ColumnDef[];
    lookups?: LookupDef[];
    table_id?: string;
    group_id?: string;
    id?: string;
    label?: string;
  } = {},
) {
  return {
    id: overrides.id ?? "tbl1",
    group_id: overrides.group_id ?? "g",
    table_id: overrides.table_id ?? "t",
    label: overrides.label ?? "T",
    description: null,
    columns: (overrides.columns ?? []) as unknown,
    lookups: (overrides.lookups ?? []) as unknown,
    created_at: new Date("2025-01-15T09:00:00Z"),
    updated_at: new Date("2025-01-15T09:00:00Z"),
  } as unknown;
}

function makeRow(
  overrides: {
    id?: string;
    group_id?: string;
    table_id?: string;
    data?: Record<string, unknown>;
  } = {},
) {
  return {
    id: overrides.id ?? "row1",
    group_id: overrides.group_id ?? "g",
    table_id: overrides.table_id ?? "t",
    data: (overrides.data ?? {}) as unknown,
    created_at: new Date("2025-01-15T09:00:00Z"),
    updated_at: new Date("2025-01-15T09:00:00Z"),
  } as unknown;
}

describe("TablesService", () => {
  let svc: TablesService;
  let db: jest.Mocked<TablesDbService>;
  let audit: { recordEvent: jest.Mock };

  beforeEach(async () => {
    db = {
      createTable: jest.fn(),
      findTable: jest.fn(),
      listTables: jest.fn(),
      updateTableMetadata: jest.fn(),
      deleteTable: jest.fn(),
      addColumn: jest.fn(),
      backfillColumn: jest.fn(),
      addColumnAndBackfill: jest.fn(),
      updateColumn: jest.fn(),
      removeColumn: jest.fn(),
      addLookup: jest.fn(),
      updateLookup: jest.fn(),
      removeLookup: jest.fn(),
      createRow: jest.fn(),
      findRow: jest.fn(),
      listRows: jest.fn(),
      updateRow: jest.fn(),
      deleteRow: jest.fn(),
      hasRowWithColumnValue: jest.fn(),
      columnHasDuplicateValues: jest.fn(),
      hasRows: jest.fn(),
      backfillAndUpdateColumn: jest.fn(),
    } as unknown as jest.Mocked<TablesDbService>;
    audit = { recordEvent: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: TablesDbService, useValue: db },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    svc = moduleRef.get(TablesService);
  });

  // Test 1: createTable records audit with correct shape (resource_id is UUID from db, not slug)
  it("createTable records audit with event_type tables.created and resource_type table", async () => {
    const created = makeTable({
      id: "new-tbl-uuid",
      table_id: "my-table",
      group_id: "grp1",
    });
    db.createTable.mockResolvedValueOnce(created as never);

    await svc.createTable({
      actor_id: "user1",
      group_id: "grp1",
      table_id: "my-table",
      label: "My Table",
      description: null,
    });

    expect(audit.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "tables.created",
        resource_type: "table",
        resource_id: "new-tbl-uuid",
        actor_id: "user1",
        group_id: "grp1",
      }),
    );
  });

  // Test 2: addColumn rejects invalid column key
  it("addColumn rejects a column with key matching /invalid column key/i", async () => {
    db.findTable.mockResolvedValueOnce(makeTable() as never);

    await expect(
      svc.addColumn("user1", "g", "t", {
        key: "1bad",
        label: "Bad",
        type: "string",
      }),
    ).rejects.toThrow(/invalid column key/i);
  });

  // Test 2a: addColumn backfills rows when seed_value is provided
  it("addColumn calls addColumnAndBackfill with seed_value when provided", async () => {
    const col = {
      key: "code",
      label: "Code",
      type: "string" as const,
      required: true,
    };
    db.findTable.mockResolvedValueOnce(makeTable() as never);
    db.addColumnAndBackfill.mockResolvedValueOnce(
      makeTable({ columns: [col] }) as never,
    );

    await svc.addColumn("user1", "g", "t", col, "ABC");

    expect(db.addColumnAndBackfill).toHaveBeenCalledWith("g", "t", col, "ABC");
    expect(db.addColumn).not.toHaveBeenCalled();
  });

  // Test 2b: addColumn does not backfill when seed_value is not provided
  it("addColumn does not call addColumnAndBackfill when seed_value is not provided", async () => {
    const col = { key: "name", label: "Name", type: "string" as const };
    db.findTable.mockResolvedValueOnce(makeTable() as never);
    db.addColumn.mockResolvedValueOnce(makeTable({ columns: [col] }) as never);

    await svc.addColumn("user1", "g", "t", col);

    expect(db.addColumnAndBackfill).not.toHaveBeenCalled();
  });

  // Test 2c: addColumn rejects seed_value that does not match column type
  it("addColumn rejects seed_value incompatible with column type", async () => {
    const col = {
      key: "count",
      label: "Count",
      type: "number" as const,
      required: true,
    };
    db.findTable.mockResolvedValueOnce(makeTable() as never);

    await expect(
      svc.addColumn("user1", "g", "t", col, "not-a-number"),
    ).rejects.toThrow(/seed_value is invalid/i);

    expect(db.addColumn).not.toHaveBeenCalled();
  });
  // Test 2d: addColumn rejects seed_value when column is unique (non-required column)
  it("addColumn rejects seed_value when column has unique: true", async () => {
    const col = {
      key: "code",
      label: "Code",
      type: "string" as const,
      unique: true,
    };
    db.findTable.mockResolvedValueOnce(makeTable() as never);

    await expect(svc.addColumn("user1", "g", "t", col, "ABC")).rejects.toThrow(
      /seed value.*unique/i,
    );

    expect(db.addColumn).not.toHaveBeenCalled();
  });

  // Test 2e: addColumn rejects required+unique column when table already has rows
  it("addColumn rejects required+unique column when the table already has rows", async () => {
    const col = {
      key: "code",
      label: "Code",
      type: "string" as const,
      required: true,
      unique: true,
    };
    db.findTable.mockResolvedValueOnce(makeTable() as never);
    db.hasRows.mockResolvedValueOnce(true);

    await expect(svc.addColumn("user1", "g", "t", col)).rejects.toThrow(
      /required.*unique.*already has rows/i,
    );

    expect(db.addColumn).not.toHaveBeenCalled();
  });

  // Test 2e2: addColumn rejects required-only column (no seed) when table already has rows
  it("addColumn rejects a required column without seed_value when the table already has rows", async () => {
    const col = {
      key: "notes",
      label: "Notes",
      type: "string" as const,
      required: true,
    };
    db.findTable.mockResolvedValueOnce(makeTable() as never);
    db.hasRows.mockResolvedValueOnce(true);

    await expect(svc.addColumn("user1", "g", "t", col)).rejects.toThrow(
      /required column without a seed_value.*already has rows/i,
    );

    expect(db.addColumn).not.toHaveBeenCalled();
  });

  // Test 2f: addColumn allows unique-only column on a table with existing rows
  it("addColumn allows a nullable unique column when the table already has rows", async () => {
    const col = {
      key: "code",
      label: "Code",
      type: "string" as const,
      unique: true,
    };
    db.findTable.mockResolvedValueOnce(makeTable() as never);
    db.addColumn.mockResolvedValueOnce(makeTable() as never);

    await expect(svc.addColumn("user1", "g", "t", col)).resolves.toBeDefined();

    expect(db.hasRows).not.toHaveBeenCalled();
    expect(db.addColumn).toHaveBeenCalledTimes(1);
  });

  // Test 3: createRow validates required fields
  it("createRow rejects empty data when a required column exists", async () => {
    const cols: ColumnDef[] = [
      { key: "name", label: "Name", type: "string", required: true },
    ];
    db.findTable.mockResolvedValueOnce(makeTable({ columns: cols }) as never);

    await expect(svc.createRow("user1", "g", "t", {})).rejects.toThrow();
  });

  // Test 3a: createRow rejects duplicate value for a unique column
  it("createRow throws ConflictException when a unique column already has the value", async () => {
    const cols: ColumnDef[] = [
      { key: "code", label: "Code", type: "string", unique: true },
    ];
    db.findTable.mockResolvedValueOnce(makeTable({ columns: cols }) as never);
    db.hasRowWithColumnValue.mockResolvedValueOnce(true);

    await expect(
      svc.createRow("user1", "g", "t", { code: "ABC" }),
    ).rejects.toThrow(/unique values/i);

    expect(db.createRow).not.toHaveBeenCalled();
  });

  // Test 3b: updateRow rejects duplicate value for a unique column in another row
  it("updateRow throws ConflictException when another row already holds the unique value", async () => {
    const cols: ColumnDef[] = [
      { key: "code", label: "Code", type: "string", unique: true },
    ];
    db.findTable.mockResolvedValueOnce(makeTable({ columns: cols }) as never);
    db.hasRowWithColumnValue.mockResolvedValueOnce(true);

    await expect(
      svc.updateRow("user1", "g", "t", "row1", {
        data: { code: "ABC" },
        expected_updated_at: new Date(),
      }),
    ).rejects.toThrow(/unique values/i);

    expect(db.updateRow).not.toHaveBeenCalled();
  });

  // Test 3c: updateColumn rejects enabling unique when existing rows have duplicates
  it("updateColumn throws ConflictException when enabling unique on a column with duplicate values", async () => {
    const before: ColumnDef[] = [
      { key: "code", label: "Code", type: "string" },
    ];
    db.findTable.mockResolvedValueOnce(makeTable({ columns: before }) as never);
    db.columnHasDuplicateValues.mockResolvedValueOnce(true);

    const next: ColumnDef = {
      key: "code",
      label: "Code",
      type: "string",
      unique: true,
    };

    await expect(
      svc.updateColumn("user1", "g", "t", "code", next),
    ).rejects.toThrow(/cannot be saved.*duplicate/i);

    expect(db.updateColumn).not.toHaveBeenCalled();
  });

  // Test 3c3: updateColumn applies seed then rejects if seeded values create duplicates
  it("updateColumn applies seed_value then rejects with ConflictException if duplicates remain", async () => {
    const before: ColumnDef[] = [
      { key: "code", label: "Code", type: "string" },
    ];
    db.findTable.mockResolvedValueOnce(makeTable({ columns: before }) as never);
    db.backfillAndUpdateColumn.mockRejectedValueOnce(
      new ConflictException(
        'Column "Code" cannot be saved — rows contain duplicate values.',
      ),
    );

    const next: ColumnDef = {
      key: "code",
      label: "Code",
      type: "string",
      unique: true,
    };

    await expect(
      svc.updateColumn("user1", "g", "t", "code", next, "SAME"),
    ).rejects.toThrow(/cannot be saved.*duplicate/i);

    expect(db.backfillAndUpdateColumn).toHaveBeenCalledWith(
      "g",
      "t",
      "code",
      next,
      "SAME",
      true,
      "Code",
    );
    expect(db.updateColumn).not.toHaveBeenCalled();
  });

  // Test 3c3b: updateColumn rejects when seeding an already-unique column creates duplicates
  it("updateColumn rejects seed_value on already-unique column when it creates duplicates", async () => {
    const before: ColumnDef[] = [
      { key: "code", label: "Code", type: "string", unique: true },
    ];
    db.findTable.mockResolvedValueOnce(makeTable({ columns: before }) as never);
    db.backfillAndUpdateColumn.mockRejectedValueOnce(
      new ConflictException(
        'Column "Code" cannot be saved — rows contain duplicate values.',
      ),
    );

    const next: ColumnDef = {
      key: "code",
      label: "Code",
      type: "string",
      required: true,
      unique: true,
    };

    await expect(
      svc.updateColumn("user1", "g", "t", "code", next, "SAME"),
    ).rejects.toThrow(/cannot be saved.*duplicate/i);

    expect(db.backfillAndUpdateColumn).toHaveBeenCalledWith(
      "g",
      "t",
      "code",
      next,
      "SAME",
      true,
      "Code",
    );
    expect(db.updateColumn).not.toHaveBeenCalled();
  });

  // Test 3c4: updateColumn uses backfillAndUpdateColumn when seed_value is provided
  it("updateColumn uses backfillAndUpdateColumn when seed_value is provided", async () => {
    const before: ColumnDef[] = [
      { key: "notes", label: "Notes", type: "string" },
    ];
    db.findTable.mockResolvedValueOnce(makeTable({ columns: before }) as never);
    const updated = makeTable({ columns: before });
    db.backfillAndUpdateColumn.mockResolvedValueOnce(updated as never);

    const next: ColumnDef = {
      key: "notes",
      label: "Notes",
      type: "string",
      required: true,
    };

    await svc.updateColumn("user1", "g", "t", "notes", next, "N/A");

    expect(db.backfillAndUpdateColumn).toHaveBeenCalledWith(
      "g",
      "t",
      "notes",
      next,
      "N/A",
      false,
      "Notes",
    );
    expect(db.updateColumn).not.toHaveBeenCalled();
    expect(db.backfillColumn).not.toHaveBeenCalled();
  });

  // Test 3d: createRow succeeds when hasRowWithColumnValue returns false for a unique column
  it("createRow calls hasRowWithColumnValue and proceeds when value is not a duplicate", async () => {
    const cols: ColumnDef[] = [
      { key: "code", label: "Code", type: "string", unique: true },
    ];
    db.findTable.mockResolvedValueOnce(makeTable({ columns: cols }) as never);
    db.hasRowWithColumnValue.mockResolvedValueOnce(false);
    const row = makeRow({ id: "row-uuid", data: { code: "ABC" } });
    db.createRow.mockResolvedValueOnce(row as never);

    await svc.createRow("user1", "g", "t", { code: "ABC" });

    expect(db.hasRowWithColumnValue).toHaveBeenCalledWith(
      "g",
      "t",
      "code",
      "ABC",
    );
    expect(db.createRow).toHaveBeenCalledWith("g", "t", { code: "ABC" });
  });

  // Test 3e: updateRow calls hasRowWithColumnValue with the row's own id as excludeId
  it("updateRow calls hasRowWithColumnValue with excludeId and proceeds when value is unique", async () => {
    const cols: ColumnDef[] = [
      { key: "code", label: "Code", type: "string", unique: true },
    ];
    db.findTable.mockResolvedValueOnce(makeTable({ columns: cols }) as never);
    db.hasRowWithColumnValue.mockResolvedValueOnce(false);
    const updatedRow = makeRow({ id: "row1", data: { code: "ABC" } });
    db.updateRow.mockResolvedValueOnce(updatedRow as never);

    await svc.updateRow("user1", "g", "t", "row1", {
      data: { code: "ABC" },
      expected_updated_at: new Date("2025-01-15T09:00:00Z"),
    });

    expect(db.hasRowWithColumnValue).toHaveBeenCalledWith(
      "g",
      "t",
      "code",
      "ABC",
      "row1",
    );
    expect(db.updateRow).toHaveBeenCalled();
  });

  // Test 4: removeColumn blocks when lookup references the column
  it("removeColumn throws ConflictException when a lookup references the column", async () => {
    const cols: ColumnDef[] = [{ key: "name", label: "Name", type: "string" }];
    const lookups: LookupDef[] = [
      {
        name: "byName",
        params: [],
        filter: {
          operator: "equals",
          left: { ref: "row.name" },
          right: { literal: "x" },
        },
        pick: "first",
      },
    ];
    db.findTable.mockResolvedValueOnce(
      makeTable({ columns: cols, lookups }) as never,
    );

    await expect(svc.removeColumn("user1", "g", "t", "name")).rejects.toThrow(
      /referenced by lookups/i,
    );
  });

  // Test 5: updateRow wraps stale-lock error as ConflictException
  it("updateRow wraps db stale-lock error as ConflictException", async () => {
    const cols: ColumnDef[] = [{ key: "x", label: "X", type: "string" }];
    db.findTable.mockResolvedValueOnce(makeTable({ columns: cols }) as never);
    const existingRow = {
      id: "row1",
      group_id: "g",
      table_id: "t",
      data: { x: "old" } as unknown,
      created_at: new Date(),
      updated_at: new Date("2025-01-15T09:00:00Z"),
    };
    db.findRow.mockResolvedValueOnce(existingRow as never);
    db.updateRow.mockRejectedValueOnce(
      new Error("row update conflict: stale expected_updated_at"),
    );

    await expect(
      svc.updateRow("user1", "g", "t", "row1", {
        data: { x: "new" },
        expected_updated_at: new Date("2025-01-15T09:00:00Z"),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // Test 6: removeLookup records audit and does NOT call db.findTable (no validation)
  it("removeLookup records audit and does not call db.findTable", async () => {
    const updated = makeTable({ id: "tbl-uuid" });
    db.removeLookup.mockResolvedValueOnce(updated as never);

    await svc.removeLookup("user1", "g", "t", "byName");

    expect(db.removeLookup).toHaveBeenCalledWith("g", "t", "byName");
    expect(audit.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "tables.lookup.removed",
        resource_type: "table",
        resource_id: "tbl-uuid",
        actor_id: "user1",
        group_id: "g",
        payload: { lookup_name: "byName" },
      }),
    );
    expect(db.findTable).not.toHaveBeenCalled();
  });

  // Test 7: deleteTable no-op when table not found
  it("deleteTable does not call db.deleteTable or audit when table not found", async () => {
    db.findTable.mockResolvedValueOnce(null);

    await svc.deleteTable("user1", "g", "t");

    expect(db.deleteTable).not.toHaveBeenCalled();
    expect(audit.recordEvent).not.toHaveBeenCalled();
  });

  // Test 8: addLookup validation failure — db.addLookup NOT called
  it("addLookup rejects with BadRequestException and does not call db.addLookup when lookup references non-existent column", async () => {
    db.findTable.mockResolvedValueOnce(makeTable() as never); // empty columns

    const badLookup: LookupDef = {
      name: "byNonExistent",
      params: [],
      filter: {
        operator: "equals",
        left: { ref: "row.nonexistent" },
        right: { literal: "x" },
      },
      pick: "first",
    };

    await expect(
      svc.addLookup("user1", "g", "t", badLookup),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(db.addLookup).not.toHaveBeenCalled();
  });

  // Test 9: updateTableMetadata happy path — db called with correct args, audit uses UUID resource_id
  it("updateTableMetadata calls db.updateTableMetadata and records audit with UUID resource_id", async () => {
    const updated = makeTable({ id: "tbl-uuid", table_id: "t", group_id: "g" });
    db.updateTableMetadata.mockResolvedValueOnce(updated as never);

    const patch = { label: "New Label" };
    await svc.updateTableMetadata("user1", "g", "t", patch);

    expect(db.updateTableMetadata).toHaveBeenCalledWith("g", "t", patch);
    expect(audit.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "tables.updated",
        resource_type: "table",
        resource_id: "tbl-uuid",
        payload: patch,
      }),
    );
  });

  // Test 10: addLookup happy path — db called, audit uses UUID resource_id
  it("addLookup calls db.addLookup and records audit with UUID resource_id", async () => {
    const col: ColumnDef = { key: "k", label: "K", type: "string" };
    const tableWithCol = makeTable({ id: "tbl-uuid", columns: [col] });
    db.findTable.mockResolvedValueOnce(tableWithCol as never);
    const updatedTable = makeTable({ id: "tbl-uuid", columns: [col] });
    db.addLookup.mockResolvedValueOnce(updatedTable as never);

    const lookup: LookupDef = {
      name: "byK",
      params: [{ name: "p", type: "string" }],
      filter: {
        operator: "equals",
        left: { ref: "param.p" },
        right: { ref: "row.k" },
      },
      pick: "one",
    };
    await svc.addLookup("user1", "g", "t", lookup);

    expect(db.addLookup).toHaveBeenCalledWith("g", "t", lookup);
    expect(audit.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "tables.lookup.added",
        resource_type: "table",
        resource_id: "tbl-uuid",
        payload: { lookup },
      }),
    );
  });

  // Test 11: updateColumn happy path — audit uses column_key in payload
  it("updateColumn calls db.updateColumn and records audit with column_key payload key", async () => {
    const before: ColumnDef = {
      key: "name",
      label: "Old Name",
      type: "string",
    };
    const next: ColumnDef = { key: "name", label: "New Name", type: "string" };
    const tableWithCol = makeTable({ id: "tbl-uuid", columns: [before] });
    db.findTable.mockResolvedValueOnce(tableWithCol as never);
    const updatedTable = makeTable({ id: "tbl-uuid", columns: [next] });
    db.updateColumn.mockResolvedValueOnce(updatedTable as never);

    await svc.updateColumn("user1", "g", "t", "name", next);

    expect(db.updateColumn).toHaveBeenCalledWith("g", "t", "name", next);
    expect(audit.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "tables.column.updated",
        resource_type: "table",
        resource_id: "tbl-uuid",
        payload: { column_key: "name", before, after: next },
      }),
    );
  });

  // Test 12: createRow happy path — audit uses resource_type table_row, row UUID as resource_id, table_id in payload
  it("createRow calls db.createRow and records audit with resource_type table_row and table_id in payload", async () => {
    const col: ColumnDef = { key: "name", label: "Name", type: "string" };
    db.findTable.mockResolvedValueOnce(makeTable({ columns: [col] }) as never);
    const row = makeRow({
      id: "row-uuid",
      table_id: "t",
      data: { name: "Alice" },
    });
    db.createRow.mockResolvedValueOnce(row as never);

    await svc.createRow("user1", "g", "t", { name: "Alice" });

    expect(db.createRow).toHaveBeenCalledWith("g", "t", { name: "Alice" });
    expect(audit.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "tables.row.created",
        resource_type: "table_row",
        resource_id: "row-uuid",
        payload: expect.objectContaining({
          table_id: "t",
          after: { name: "Alice" },
        }),
      }),
    );
  });

  // Test 13: deleteRow happy path — audit uses resource_type table_row, row UUID as resource_id, table_id + before.data in payload
  it("deleteRow calls db.findRow then db.deleteRow and records audit with resource_type table_row", async () => {
    const existing = makeRow({
      id: "row-uuid",
      table_id: "t",
      data: { name: "Alice" },
    });
    db.findRow.mockResolvedValueOnce(existing as never);
    db.deleteRow.mockResolvedValueOnce(undefined as never);

    await svc.deleteRow("user1", "g", "t", "row-uuid");

    expect(db.findRow).toHaveBeenCalledWith("g", "t", "row-uuid");
    expect(db.deleteRow).toHaveBeenCalledWith("g", "t", "row-uuid");
    expect(audit.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "tables.row.deleted",
        resource_type: "table_row",
        resource_id: "row-uuid",
        payload: { table_id: "t", before: { name: "Alice" } },
      }),
    );
  });
});
