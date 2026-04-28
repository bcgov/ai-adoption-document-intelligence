import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { TablesDbService } from "./tables-db.service";

const mockPrismaClient = {
  table: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
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
      mockPrismaClient.table.create.mockResolvedValue(mockTable);

      const result = await service.createTable({
        group_id: "grp1",
        table_id: "t1",
        label: "T 1",
        description: null,
      });

      expect(result.table_id).toBe("t1");
      expect(result.columns).toEqual([]);
      expect(result.lookups).toEqual([]);
      expect(mockPrismaClient.table.create).toHaveBeenCalledWith({
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
      mockPrismaClient.table.create.mockResolvedValueOnce({
        group_id: "grp1",
        table_id: "t1",
        label: "x",
        description: null,
        columns: [],
        lookups: [],
      });
      mockPrismaClient.table.create.mockRejectedValueOnce(
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
      mockPrismaClient.table.findMany.mockImplementation(
        ({ where }: { where: { group_id: string } }) =>
          Promise.resolve(allRows.filter((r) => r.group_id === where.group_id)),
      );

      const list = await service.listTables("grp1");

      expect(list).toHaveLength(2);
      expect(list.every((r) => r.group_id === "grp1")).toBe(true);
      expect(mockPrismaClient.table.findMany).toHaveBeenCalledWith({
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
      mockPrismaClient.table.update.mockResolvedValue(mockUpdated);

      const result = await service.updateTableMetadata("grp1", "t1", {
        label: "new",
        description: "d",
      });

      expect(result.label).toBe("new");
      expect(result.description).toBe("d");
      expect(mockPrismaClient.table.update).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
        data: { label: "new", description: "d" },
      });
    });
  });

  describe("deleteTable", () => {
    it("deletes a table", async () => {
      mockPrismaClient.table.delete.mockResolvedValue({});
      mockPrismaClient.table.findUnique.mockResolvedValue(null);

      await service.deleteTable("grp1", "t1");
      const found = await service.findTable("grp1", "t1");

      expect(found).toBeNull();
      expect(mockPrismaClient.table.delete).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
      });
      expect(mockPrismaClient.table.findUnique).toHaveBeenCalledWith({
        where: { group_id_table_id: { group_id: "grp1", table_id: "t1" } },
      });
    });
  });
});
