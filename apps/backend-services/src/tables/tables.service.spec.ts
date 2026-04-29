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

  // Test 3: createRow validates required fields
  it("createRow rejects empty data when a required column exists", async () => {
    const cols: ColumnDef[] = [
      { key: "name", label: "Name", type: "string", required: true },
    ];
    db.findTable.mockResolvedValueOnce(makeTable({ columns: cols }) as never);

    await expect(svc.createRow("user1", "g", "t", {})).rejects.toThrow();
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
