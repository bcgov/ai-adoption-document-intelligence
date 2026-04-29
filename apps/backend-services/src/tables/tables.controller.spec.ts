jest.mock("@/auth/identity.helpers", () => ({
  identityCanAccessGroup: jest.fn().mockReturnValue(undefined),
}));

import { GroupRole } from "@generated/client";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import * as identityHelpers from "@/auth/identity.helpers";
import { ColumnDto } from "./dto/column.dto";
import { LookupDto } from "./dto/lookup.dto";
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
    addColumn: jest.fn(),
    updateColumn: jest.fn(),
    removeColumn: jest.fn(),
    addLookup: jest.fn(),
    updateLookup: jest.fn(),
    removeLookup: jest.fn(),
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

  // -------------------------------------------------------------------------
  // 9. addColumn — happy path
  // -------------------------------------------------------------------------
  describe("POST /api/tables/:tableId/columns (addColumn)", () => {
    it("calls admin check and service.addColumn; returns mapped TableDetailDto", async () => {
      const colBody: ColumnDto = {
        key: "status",
        label: "Status",
        type: "string",
      };
      const updatedTable = {
        ...baseTable,
        columns: [colBody],
        lookups: [],
      };
      mockTablesService.addColumn.mockResolvedValue(updatedTable);

      const result: TableDetailDto = await controller.addColumn(
        mockReq,
        "my_table",
        "group-1",
        colBody,
      );

      expect(identityHelpers.identityCanAccessGroup).toHaveBeenCalledWith(
        mockReq.resolvedIdentity,
        "group-1",
        GroupRole.ADMIN,
      );
      expect(service.addColumn).toHaveBeenCalledWith(
        "u1",
        "group-1",
        "my_table",
        colBody,
      );
      expect(result.columns).toHaveLength(1);
      expect(result.table_id).toBe("my_table");
    });

    // 10. addColumn — forbidden short-circuit
    it("propagates ForbiddenException when not admin; service NOT called", async () => {
      (
        identityHelpers.identityCanAccessGroup as jest.Mock
      ).mockImplementationOnce(() => {
        throw new ForbiddenException();
      });

      const colBody: ColumnDto = { key: "col", label: "Col", type: "string" };

      await expect(
        controller.addColumn(mockReq, "my_table", "group-1", colBody),
      ).rejects.toThrow(ForbiddenException);

      expect(service.addColumn).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 11. removeColumn — 409 wrap
  // -------------------------------------------------------------------------
  describe("DELETE /api/tables/:tableId/columns/:columnKey (removeColumn)", () => {
    it("propagates ConflictException when column is referenced by lookups", async () => {
      mockTablesService.removeColumn.mockRejectedValue(
        new ConflictException('column "k" is referenced by lookups: byK'),
      );

      await expect(
        controller.removeColumn(mockReq, "my_table", "k", "group-1"),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(service.removeColumn).toHaveBeenCalledWith(
        "u1",
        "group-1",
        "my_table",
        "k",
      );
    });
  });

  // -------------------------------------------------------------------------
  // 12. addLookup — happy path
  // -------------------------------------------------------------------------
  describe("POST /api/tables/:tableId/lookups (addLookup)", () => {
    it("calls admin check and service.addLookup with cast body; returns mapped TableDetailDto", async () => {
      const lookupBody: LookupDto = {
        name: "byStatus",
        params: [],
        filter: { field: "status", op: "eq", value: "active" },
        pick: "all",
      };
      const updatedTable = {
        ...baseTable,
        columns: [],
        lookups: [lookupBody],
      };
      mockTablesService.addLookup.mockResolvedValue(updatedTable);

      const result: TableDetailDto = await controller.addLookup(
        mockReq,
        "my_table",
        "group-1",
        lookupBody,
      );

      expect(identityHelpers.identityCanAccessGroup).toHaveBeenCalledWith(
        mockReq.resolvedIdentity,
        "group-1",
        GroupRole.ADMIN,
      );
      expect(service.addLookup).toHaveBeenCalledWith(
        "u1",
        "group-1",
        "my_table",
        lookupBody,
      );
      expect(result.lookups).toHaveLength(1);
      expect(result.table_id).toBe("my_table");
    });
  });

  // -------------------------------------------------------------------------
  // 13. removeLookup — happy path
  // -------------------------------------------------------------------------
  describe("DELETE /api/tables/:tableId/lookups/:lookupName (removeLookup)", () => {
    it("calls admin check and service.removeLookup with correct args; returns void (204)", async () => {
      mockTablesService.removeLookup.mockResolvedValue(baseTable);

      await controller.removeLookup(mockReq, "my_table", "byStatus", "group-1");

      expect(identityHelpers.identityCanAccessGroup).toHaveBeenCalledWith(
        mockReq.resolvedIdentity,
        "group-1",
        GroupRole.ADMIN,
      );
      expect(service.removeLookup).toHaveBeenCalledWith(
        "u1",
        "group-1",
        "my_table",
        "byStatus",
      );
    });
  });
});
