jest.mock("@/auth/identity.helpers", () => ({
  identityCanAccessGroup: jest.fn().mockReturnValue(undefined),
}));

import { GroupRole } from "@generated/client";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import * as identityHelpers from "@/auth/identity.helpers";
import {
  CreateTableDto,
  TableDetailDto,
  TableSummaryDto,
  UpdateTableMetadataDto,
} from "./dto/table.dto";
import { TablesController } from "./tables.controller";
import { TablesService } from "./tables.service";

describe("TablesController", () => {
  let controller: TablesController;
  let service: TablesService;

  const mockTablesService = {
    listTables: jest.fn(),
    getTable: jest.fn(),
    createTable: jest.fn(),
    updateTableMetadata: jest.fn(),
    deleteTable: jest.fn(),
  };

  const mockReq = {
    resolvedIdentity: {
      actorId: "u1",
      userId: "u1",
      isSystemAdmin: false,
      groupRoles: { "group-1": GroupRole.ADMIN },
    },
  } as unknown as Request;

  const baseTable = {
    id: "tbl-uuid",
    group_id: "group-1",
    table_id: "my_table",
    label: "My Table",
    description: "A description",
    columns: [],
    lookups: [],
    updated_at: new Date("2025-01-01T00:00:00Z"),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TablesController],
      providers: [
        {
          provide: TablesService,
          useValue: mockTablesService,
        },
      ],
    }).compile();

    controller = module.get<TablesController>(TablesController);
    service = module.get<TablesService>(TablesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. listTables — happy path
  // -------------------------------------------------------------------------
  describe("GET /api/tables (listTables)", () => {
    it("returns TableSummaryDto[] with row_count 0 on happy path", async () => {
      const dbRows = [
        { ...baseTable, table_id: "tbl_a", label: "A" },
        { ...baseTable, table_id: "tbl_b", label: "B" },
      ];
      mockTablesService.listTables.mockResolvedValue(dbRows);

      const result = await controller.listTables(mockReq, "group-1");

      expect(
        (identityHelpers.identityCanAccessGroup as jest.Mock).mock.calls,
      ).toHaveLength(1);
      expect(identityHelpers.identityCanAccessGroup).toHaveBeenCalledWith(
        mockReq.resolvedIdentity,
        "group-1",
      );
      expect(service.listTables).toHaveBeenCalledWith("group-1");
      expect(result).toHaveLength(2);
      const summary = result[0] as TableSummaryDto;
      expect(summary.row_count).toBe(0);
      expect(summary.table_id).toBe("tbl_a");
    });

    // 2. listTables — forbidden
    it("propagates ForbiddenException without calling service", async () => {
      (
        identityHelpers.identityCanAccessGroup as jest.Mock
      ).mockImplementationOnce(() => {
        throw new ForbiddenException();
      });

      await expect(controller.listTables(mockReq, "group-1")).rejects.toThrow(
        ForbiddenException,
      );

      expect(service.listTables).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. getTable — happy path
  // -------------------------------------------------------------------------
  describe("GET /api/tables/:tableId (getTable)", () => {
    it("returns TableDetailDto with columns and lookups", async () => {
      const dbRow = {
        ...baseTable,
        columns: [{ key: "col1", type: "text", label: "Col 1" }],
        lookups: [{ name: "lookup1", column_key: "col1", values: {} }],
      };
      mockTablesService.getTable.mockResolvedValue(dbRow);

      const result: TableDetailDto = await controller.getTable(
        mockReq,
        "my_table",
        "group-1",
      );

      expect(identityHelpers.identityCanAccessGroup).toHaveBeenCalledWith(
        mockReq.resolvedIdentity,
        "group-1",
      );
      expect(service.getTable).toHaveBeenCalledWith("group-1", "my_table");
      expect(result.table_id).toBe("my_table");
      expect(result.columns).toHaveLength(1);
      expect(result.lookups).toHaveLength(1);
    });

    // 4. getTable — 404
    it("throws NotFoundException when service returns null", async () => {
      mockTablesService.getTable.mockResolvedValue(null);

      await expect(
        controller.getTable(mockReq, "missing_table", "group-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // 5. createTable — happy path with admin role
  // -------------------------------------------------------------------------
  describe("POST /api/tables (createTable)", () => {
    it("calls identityCanAccessGroup with ADMIN and creates table", async () => {
      const body: CreateTableDto = {
        group_id: "group-1",
        table_id: "new_table",
        label: "New Table",
        description: "desc",
      };
      mockTablesService.createTable.mockResolvedValue({
        ...baseTable,
        table_id: "new_table",
        label: "New Table",
        description: "desc",
      });

      const result: TableDetailDto = await controller.createTable(
        mockReq,
        body,
      );

      expect(identityHelpers.identityCanAccessGroup).toHaveBeenCalledWith(
        mockReq.resolvedIdentity,
        "group-1",
        GroupRole.ADMIN,
      );
      expect(service.createTable).toHaveBeenCalledWith({
        actor_id: "u1",
        group_id: "group-1",
        table_id: "new_table",
        label: "New Table",
        description: "desc",
      });
      expect(result.table_id).toBe("new_table");
      expect(result.columns).toEqual([]);
      expect(result.lookups).toEqual([]);
    });

    // 6. createTable — forbidden
    it("propagates ForbiddenException when not admin; service NOT called", async () => {
      (
        identityHelpers.identityCanAccessGroup as jest.Mock
      ).mockImplementationOnce(() => {
        throw new ForbiddenException();
      });

      const body: CreateTableDto = {
        group_id: "group-1",
        table_id: "new_table",
        label: "New Table",
      };

      await expect(controller.createTable(mockReq, body)).rejects.toThrow(
        ForbiddenException,
      );

      expect(service.createTable).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 7. updateTableMetadata — happy path
  // -------------------------------------------------------------------------
  describe("PATCH /api/tables/:tableId (updateTableMetadata)", () => {
    it("calls admin check and service with correct args; returns mapped DTO", async () => {
      const patch: UpdateTableMetadataDto = { label: "Updated Label" };
      const updated = { ...baseTable, label: "Updated Label" };
      mockTablesService.updateTableMetadata.mockResolvedValue(updated);

      const result: TableDetailDto = await controller.updateTableMetadata(
        mockReq,
        "my_table",
        "group-1",
        patch,
      );

      expect(identityHelpers.identityCanAccessGroup).toHaveBeenCalledWith(
        mockReq.resolvedIdentity,
        "group-1",
        GroupRole.ADMIN,
      );
      expect(service.updateTableMetadata).toHaveBeenCalledWith(
        "u1",
        "group-1",
        "my_table",
        patch,
      );
      expect(result.label).toBe("Updated Label");
    });
  });

  // -------------------------------------------------------------------------
  // 8. deleteTable — happy path
  // -------------------------------------------------------------------------
  describe("DELETE /api/tables/:tableId (deleteTable)", () => {
    it("calls admin check and service.deleteTable", async () => {
      mockTablesService.deleteTable.mockResolvedValue(undefined);

      await controller.deleteTable(mockReq, "my_table", "group-1");

      expect(identityHelpers.identityCanAccessGroup).toHaveBeenCalledWith(
        mockReq.resolvedIdentity,
        "group-1",
        GroupRole.ADMIN,
      );
      expect(service.deleteTable).toHaveBeenCalledWith(
        "u1",
        "group-1",
        "my_table",
      );
    });
  });
});
