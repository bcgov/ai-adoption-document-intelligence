import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { TablesDbService } from "./tables-db.service";
import type { ColumnDef, LookupDef } from "./types";

const mockPrismaClient = {
  referenceTable: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  referenceTableRow: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe("TablesDbService — tables CRUD", () => {
  let service: TablesDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesDbService,
        { provide: PrismaService, useValue: { prisma: mockPrismaClient } },
      ],
    }).compile();

    service = module.get<TablesDbService>(TablesDbService);
    jest.clearAllMocks();
  });

  describe("createTable", () => {
    it("creates a table with empty columns and lookups", async () => {
      const mockTable = {
        group_id: "grp1",
        table_id: "t1",
        label: "T 1",
        description: null,
        columns: [],
        lookups: [],
      };
      mockPrismaClient.referenceTable.create.mockResolvedValue(mockTable);

      const result = await service.createTable({
        group_id: "grp1",
        table_id: "t1",
        label: "T 1",
        description: null,
      });

      expect(result.table_id).toBe("t1");
      expect(result.columns).toEqual([]);
      expect(result.lookups).toEqual([]);
      expect(mockPrismaClient.referenceTable.create).toHaveBeenCalledWith({
        data: {
          group_id: "grp1",
          table_id: "t1",
          label: "T 1",
          description: null,
          columns: [],
          lookups: [],
        },
      });
    });
  });

  describe("createTable — duplicate rejection", () => {
    it("rejects duplicate (group_id, table_id) pairs", async () => {
      mockPrismaClient.referenceTable.create.mockResolvedValueOnce({
        group_id: "grp1",
        table_id: "t1",
        label: "x",
        description: null,
        columns: [],
        lookups: [],
      });
      mockPrismaClient.referenceTable.create.mockRejectedValueOnce(
        new Error("unique constraint violation"),
      );

      await service.createTable({
        group_id: "grp1",
        table_id: "t1",
        label: "x",
        description: null,
      });

      await expect(
        service.createTable({
          group_id: "grp1",
          table_id: "t1",
          label: "y",
          description: null,
        }),
      ).rejects.toThrow();
    });
  });

  describe("listTables", () => {
    it("lists tables for a group", async () => {
      const allRows = [
        {
          group_id: "grp1",
          table_id: "a",
          label: "A",
          description: null,
          columns: [],
          lookups: [],
        },
        {
          group_id: "grp1",
          table_id: "b",
          label: "B",
          description: null,
          columns: [],
          lookups: [],
        },
        {
          group_id: "grp2",
          table_id: "c",
          label: "C",
          description: null,
          columns: [],
          lookups: [],
        },
      ];
      mockPrismaClient.referenceTable.findMany.mockImplementation(
        ({ where }: { where: { group_id: string } }) =>
          Promise.resolve(allRows.filter((r) => r.group_id === where.group_id)),
      );

      const list = await service.listTables("grp1");

      expect(list).toHaveLength(2);
      expect(list.every((r) => r.group_id === "grp1")).toBe(true);
      expect(mockPrismaClient.referenceTable.findMany).toHaveBeenCalledWith({
        where: { group_id: "grp1" },
        orderBy: { label: "asc" },
      });
    });
  });

  describe("updateTableMetadata", () => {
    it("updates label and description", async () => {
      const mockUpdated = {
        group_id: "grp1",
        table_id: "t1",
        label: "new",
        description: "d",
        columns: [],
        lookups: [],
      };
      mockPrismaClient.referenceTable.update.mockResolvedValue(mockUpdated);

      const result = await service.updateTableMetadata("grp1", "t1", {
        label: "new",
        description: "d",
      });

      expect(result.label).toBe("new");
      expect(result.description).toBe("d");
      expect(mockPrismaClient.referenceTable.update).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
        data: { label: "new", description: "d" },
      });
    });
  });

  describe("deleteTable", () => {
    it("deletes a table", async () => {
      mockPrismaClient.referenceTable.delete.mockResolvedValue({});
      mockPrismaClient.referenceTable.findUnique.mockResolvedValue(null);

      await service.deleteTable("grp1", "t1");
      const found = await service.findTable("grp1", "t1");

      expect(found).toBeNull();
      expect(mockPrismaClient.referenceTable.delete).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
      });
      expect(mockPrismaClient.referenceTable.findUnique).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
      });
    });
  });
});

describe("TablesDbService — columns", () => {
  let service: TablesDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesDbService,
        { provide: PrismaService, useValue: { prisma: mockPrismaClient } },
      ],
    }).compile();

    service = module.get<TablesDbService>(TablesDbService);
    jest.clearAllMocks();
  });

  const colA: ColumnDef = {
    key: "name",
    label: "Name",
    type: "string",
    required: true,
  };
  const colB: ColumnDef = { key: "age", label: "Age", type: "number" };

  describe("addColumn", () => {
    it("appends a new column to an existing non-empty columns array", async () => {
      const existingTable = {
        group_id: "grp1",
        table_id: "t1",
        label: "T1",
        description: null,
        columns: [colA],
        lookups: [],
      };
      const newCol: ColumnDef = {
        key: "email",
        label: "Email",
        type: "string",
      };
      const updatedTable = { ...existingTable, columns: [colA, newCol] };

      mockPrismaClient.referenceTable.findUniqueOrThrow.mockResolvedValue(
        existingTable,
      );
      mockPrismaClient.referenceTable.update.mockResolvedValue(updatedTable);

      const result = await service.addColumn("grp1", "t1", newCol);

      expect(result.columns).toEqual([colA, newCol]);
      expect(
        mockPrismaClient.referenceTable.findUniqueOrThrow,
      ).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
      });
      expect(mockPrismaClient.referenceTable.update).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
        data: { columns: [colA, newCol] },
      });
    });

    it("appends a column when the existing columns array is empty", async () => {
      const existingTable = {
        group_id: "grp1",
        table_id: "t1",
        label: "T1",
        description: null,
        columns: [],
        lookups: [],
      };
      const updatedTable = { ...existingTable, columns: [colA] };

      mockPrismaClient.referenceTable.findUniqueOrThrow.mockResolvedValue(
        existingTable,
      );
      mockPrismaClient.referenceTable.update.mockResolvedValue(updatedTable);

      const result = await service.addColumn("grp1", "t1", colA);

      expect(result.columns).toEqual([colA]);
      expect(mockPrismaClient.referenceTable.update).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
        data: { columns: [colA] },
      });
    });
  });

  describe("updateColumn", () => {
    it("replaces the targeted column by key while leaving other columns unchanged", async () => {
      const existingTable = {
        group_id: "grp1",
        table_id: "t1",
        label: "T1",
        description: null,
        columns: [colA, colB],
        lookups: [],
      };
      const updatedColA: ColumnDef = {
        key: "name",
        label: "Full Name",
        type: "string",
        required: false,
      };
      const updatedTable = { ...existingTable, columns: [updatedColA, colB] };

      mockPrismaClient.referenceTable.findUniqueOrThrow.mockResolvedValue(
        existingTable,
      );
      mockPrismaClient.referenceTable.update.mockResolvedValue(updatedTable);

      const result = await service.updateColumn(
        "grp1",
        "t1",
        "name",
        updatedColA,
      );

      expect(result.columns).toEqual([updatedColA, colB]);
      expect(
        mockPrismaClient.referenceTable.findUniqueOrThrow,
      ).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
      });
      expect(mockPrismaClient.referenceTable.update).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
        data: { columns: [updatedColA, colB] },
      });
    });
  });

  describe("removeColumn", () => {
    it("removes the targeted column by key while preserving other columns", async () => {
      const existingTable = {
        group_id: "grp1",
        table_id: "t1",
        label: "T1",
        description: null,
        columns: [colA, colB],
        lookups: [],
      };
      const updatedTable = { ...existingTable, columns: [colB] };

      mockPrismaClient.referenceTable.findUniqueOrThrow.mockResolvedValue(
        existingTable,
      );
      mockPrismaClient.referenceTable.update.mockResolvedValue(updatedTable);

      const result = await service.removeColumn("grp1", "t1", "name");

      expect(result.columns).toEqual([colB]);
      expect(
        mockPrismaClient.referenceTable.findUniqueOrThrow,
      ).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
      });
      expect(mockPrismaClient.referenceTable.update).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
        data: { columns: [colB] },
      });
    });
  });
});

describe("TablesDbService — lookups", () => {
  let service: TablesDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesDbService,
        { provide: PrismaService, useValue: { prisma: mockPrismaClient } },
      ],
    }).compile();

    service = module.get<TablesDbService>(TablesDbService);
    jest.clearAllMocks();
  });

  const lookupA: LookupDef = {
    name: "byParam",
    params: [{ name: "p", type: "string" }],
    filter: {
      operator: "equals",
      left: { ref: "param.p" },
      right: { literal: "v" },
    },
    pick: "first",
  };
  const lookupB: LookupDef = {
    name: "another",
    params: [],
    filter: { operator: "is-not-null", value: { ref: "row.x" } },
    pick: "all",
  };

  describe("addLookup", () => {
    it("appends a new lookup to an existing non-empty lookups array", async () => {
      const existingTable = {
        group_id: "grp1",
        table_id: "t1",
        label: "T1",
        description: null,
        columns: [],
        lookups: [lookupA],
      };
      const updatedTable = { ...existingTable, lookups: [lookupA, lookupB] };

      mockPrismaClient.referenceTable.findUniqueOrThrow.mockResolvedValue(
        existingTable,
      );
      mockPrismaClient.referenceTable.update.mockResolvedValue(updatedTable);

      const result = await service.addLookup("grp1", "t1", lookupB);

      expect(result.lookups).toEqual([lookupA, lookupB]);
      expect(
        mockPrismaClient.referenceTable.findUniqueOrThrow,
      ).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
      });
      expect(mockPrismaClient.referenceTable.update).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
        data: { lookups: [lookupA, lookupB] },
      });
    });
  });

  describe("updateLookup", () => {
    it("replaces the targeted lookup by name while leaving other lookups unchanged", async () => {
      const existingTable = {
        group_id: "grp1",
        table_id: "t1",
        label: "T1",
        description: null,
        columns: [],
        lookups: [lookupA, lookupB],
      };
      const updatedLookupA: LookupDef = {
        name: "byParam",
        params: [
          { name: "p", type: "string" },
          { name: "q", type: "number" },
        ],
        filter: {
          operator: "equals",
          left: { ref: "param.p" },
          right: { literal: "w" },
        },
        pick: "last",
      };
      const updatedTable = {
        ...existingTable,
        lookups: [updatedLookupA, lookupB],
      };

      mockPrismaClient.referenceTable.findUniqueOrThrow.mockResolvedValue(
        existingTable,
      );
      mockPrismaClient.referenceTable.update.mockResolvedValue(updatedTable);

      const result = await service.updateLookup(
        "grp1",
        "t1",
        "byParam",
        updatedLookupA,
      );

      expect(result.lookups).toEqual([updatedLookupA, lookupB]);
      expect(
        mockPrismaClient.referenceTable.findUniqueOrThrow,
      ).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
      });
      expect(mockPrismaClient.referenceTable.update).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
        data: { lookups: [updatedLookupA, lookupB] },
      });
    });
  });

  describe("removeLookup", () => {
    it("removes the targeted lookup by name while preserving other lookups", async () => {
      const existingTable = {
        group_id: "grp1",
        table_id: "t1",
        label: "T1",
        description: null,
        columns: [],
        lookups: [lookupA, lookupB],
      };
      const updatedTable = { ...existingTable, lookups: [lookupB] };

      mockPrismaClient.referenceTable.findUniqueOrThrow.mockResolvedValue(
        existingTable,
      );
      mockPrismaClient.referenceTable.update.mockResolvedValue(updatedTable);

      const result = await service.removeLookup("grp1", "t1", "byParam");

      expect(result.lookups).toEqual([lookupB]);
      expect(
        mockPrismaClient.referenceTable.findUniqueOrThrow,
      ).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
      });
      expect(mockPrismaClient.referenceTable.update).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
        data: { lookups: [lookupB] },
      });
    });
  });
});

describe("TablesDbService — rows", () => {
  let service: TablesDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesDbService,
        { provide: PrismaService, useValue: { prisma: mockPrismaClient } },
      ],
    }).compile();

    service = module.get<TablesDbService>(TablesDbService);
    jest.clearAllMocks();
  });

  describe("createRow", () => {
    it("creates a row and passes data payload through unchanged", async () => {
      const rowData = { name: "Alice", age: 30 };
      const createdAt = new Date("2025-01-15T10:00:00Z");
      const updatedAt = new Date("2025-01-15T10:00:00Z");
      const mockRow = {
        id: "row1",
        group_id: "g",
        table_id: "t",
        data: rowData,
        created_at: createdAt,
        updated_at: updatedAt,
      };
      mockPrismaClient.referenceTableRow.create.mockResolvedValue(mockRow);

      const result = await service.createRow("g", "t", rowData);

      expect(result).toEqual(mockRow);
      expect(mockPrismaClient.referenceTableRow.create).toHaveBeenCalledWith({
        data: { group_id: "g", table_id: "t", data: rowData },
      });
    });
  });

  describe("listRows", () => {
    it("returns rows and total using the composite where, correct orderBy, and pagination", async () => {
      const createdAt = new Date("2025-01-15T10:00:00Z");
      const updatedAt = new Date("2025-01-15T10:00:00Z");
      const mockRows = [
        {
          id: "row2",
          group_id: "g",
          table_id: "t",
          data: { name: "Bob" },
          created_at: createdAt,
          updated_at: updatedAt,
        },
        {
          id: "row1",
          group_id: "g",
          table_id: "t",
          data: { name: "Alice" },
          created_at: createdAt,
          updated_at: updatedAt,
        },
      ];
      mockPrismaClient.referenceTableRow.findMany.mockResolvedValue(mockRows);
      mockPrismaClient.referenceTableRow.count.mockResolvedValue(2);

      const result = await service.listRows("g", "t", { offset: 0, limit: 10 });

      expect(result.rows).toEqual(mockRows);
      expect(result.total).toBe(2);
      expect(mockPrismaClient.referenceTableRow.findMany).toHaveBeenCalledWith({
        where: { group_id: "g", table_id: "t" },
        orderBy: { created_at: "desc" },
        skip: 0,
        take: 10,
      });
      expect(mockPrismaClient.referenceTableRow.count).toHaveBeenCalledWith({
        where: { group_id: "g", table_id: "t" },
      });
    });
  });

  describe("updateRow — happy path", () => {
    it("updates row data and returns refreshed row when updated_at matches", async () => {
      const expectedUpdatedAt = new Date("2025-01-15T09:00:00Z");
      const newUpdatedAt = new Date("2025-01-15T10:00:00Z");
      const newData = { name: "Alice Updated" };
      const refreshedRow = {
        id: "row1",
        group_id: "g",
        table_id: "t",
        data: newData,
        created_at: new Date("2025-01-15T08:00:00Z"),
        updated_at: newUpdatedAt,
      };

      mockPrismaClient.referenceTableRow.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaClient.referenceTableRow.findFirst.mockResolvedValue(
        refreshedRow,
      );

      const result = await service.updateRow("g", "t", "row1", {
        data: newData,
        expected_updated_at: expectedUpdatedAt,
      });

      expect(result).toEqual(refreshedRow);
      expect(
        mockPrismaClient.referenceTableRow.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          id: "row1",
          group_id: "g",
          table_id: "t",
          updated_at: expectedUpdatedAt,
        },
        data: { data: newData },
      });
      expect(mockPrismaClient.referenceTableRow.findFirst).toHaveBeenCalledWith(
        {
          where: { id: "row1", group_id: "g", table_id: "t" },
        },
      );
    });
  });

  describe("updateRow — stale lock", () => {
    it("throws a conflict error and does not call findFirst when updated_at is stale", async () => {
      const staleUpdatedAt = new Date("2025-01-14T08:00:00Z");

      mockPrismaClient.referenceTableRow.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.updateRow("g", "t", "row1", {
          data: { name: "Alice" },
          expected_updated_at: staleUpdatedAt,
        }),
      ).rejects.toThrow(/stale|conflict/i);

      expect(
        mockPrismaClient.referenceTableRow.findFirst,
      ).not.toHaveBeenCalled();
    });
  });

  describe("deleteRow + findRow", () => {
    it("deletes using the composite filter and findRow returns null afterwards", async () => {
      mockPrismaClient.referenceTableRow.deleteMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaClient.referenceTableRow.findFirst.mockResolvedValue(null);

      await service.deleteRow("g", "t", "row1");
      const found = await service.findRow("g", "t", "row1");

      expect(found).toBeNull();
      expect(
        mockPrismaClient.referenceTableRow.deleteMany,
      ).toHaveBeenCalledWith({
        where: { id: "row1", group_id: "g", table_id: "t" },
      });
      expect(mockPrismaClient.referenceTableRow.findFirst).toHaveBeenCalledWith(
        {
          where: { id: "row1", group_id: "g", table_id: "t" },
        },
      );
    });
  });
});
