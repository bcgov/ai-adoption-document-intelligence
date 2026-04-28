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

  // Test 1: createTable records audit with correct shape
  it("createTable records audit with event_type tables.created and resource_type table", async () => {
    const created = makeTable({
      id: "new-tbl",
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
        resource_id: "my-table",
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
    const updated = makeTable();
    db.removeLookup.mockResolvedValueOnce(updated as never);

    await svc.removeLookup("user1", "g", "t", "byName");

    expect(db.removeLookup).toHaveBeenCalledWith("g", "t", "byName");
    expect(audit.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "tables.lookup.removed",
        resource_type: "table",
        actor_id: "user1",
        group_id: "g",
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
});
