import { GroupRole } from "@generated/client";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { ColumnDto } from "./dto/column.dto";
import { LookupDto } from "./dto/lookup.dto";
import { CreateRowDto, RowDto, RowListDto, UpdateRowDto } from "./dto/row.dto";
import {
  CreateTableDto,
  TableDetailDto,
  TableSummaryDto,
  UpdateTableMetadataDto,
} from "./dto/table.dto";
import { TablesService } from "./tables.service";
import type { LookupDef } from "./types";

@ApiTags("tables")
@ApiBearerAuth()
@Controller("api/tables")
export class TablesController {
  constructor(private readonly svc: TablesService) {}

  @Get()
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "List tables in a group" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiOkResponse({ type: TableSummaryDto, isArray: true })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async listTables(
    @Req() req: Request,
    @Query("group_id") group_id: string,
  ): Promise<TableSummaryDto[]> {
    identityCanAccessGroup(req.resolvedIdentity, group_id);
    const tables = await this.svc.listTables(group_id);
    return tables.map((t) => ({
      id: t.id,
      group_id: t.group_id,
      table_id: t.table_id,
      label: t.label,
      description: t.description,
      row_count: 0,
      updated_at: t.updated_at,
    }));
  }

  @Get(":tableId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get a table with its columns and lookups" })
  @ApiParam({ name: "tableId", description: "Stable table identifier" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiOkResponse({ type: TableDetailDto })
  @ApiForbiddenResponse({ description: "Access denied" })
  @ApiNotFoundResponse({ description: "Table not found" })
  async getTable(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Query("group_id") group_id: string,
  ): Promise<TableDetailDto> {
    identityCanAccessGroup(req.resolvedIdentity, group_id);
    const t = await this.svc.getTable(group_id, tableId);
    if (!t) throw new NotFoundException("Table not found");
    return {
      id: t.id,
      group_id: t.group_id,
      table_id: t.table_id,
      label: t.label,
      description: t.description,
      columns: (t.columns as unknown as unknown[]) ?? [],
      lookups: (t.lookups as unknown as unknown[]) ?? [],
      updated_at: t.updated_at,
    };
  }

  @Post()
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Create a new table (admin only)" })
  @ApiBody({ type: CreateTableDto })
  @ApiCreatedResponse({ type: TableDetailDto })
  @ApiForbiddenResponse({ description: "Admin role required" })
  @ApiBadRequestResponse({ description: "Invalid input" })
  @HttpCode(HttpStatus.CREATED)
  async createTable(
    @Req() req: Request,
    @Body() body: CreateTableDto,
  ): Promise<TableDetailDto> {
    identityCanAccessGroup(
      req.resolvedIdentity,
      body.group_id,
      GroupRole.ADMIN,
    );
    const actor_id = req.resolvedIdentity!.actorId;
    const created = await this.svc.createTable({
      actor_id,
      group_id: body.group_id,
      table_id: body.table_id,
      label: body.label,
      description: body.description ?? null,
    });
    return {
      id: created.id,
      group_id: created.group_id,
      table_id: created.table_id,
      label: created.label,
      description: created.description,
      columns: [],
      lookups: [],
      updated_at: created.updated_at,
    };
  }

  @Patch(":tableId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Update table label/description (admin only)" })
  @ApiParam({ name: "tableId", description: "Stable table identifier" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiBody({ type: UpdateTableMetadataDto })
  @ApiOkResponse({ type: TableDetailDto })
  @ApiForbiddenResponse({ description: "Admin role required" })
  async updateTableMetadata(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Query("group_id") group_id: string,
    @Body() body: UpdateTableMetadataDto,
  ): Promise<TableDetailDto> {
    identityCanAccessGroup(req.resolvedIdentity, group_id, GroupRole.ADMIN);
    const actor_id = req.resolvedIdentity!.actorId;
    const updated = await this.svc.updateTableMetadata(
      actor_id,
      group_id,
      tableId,
      body,
    );
    return {
      id: updated.id,
      group_id: updated.group_id,
      table_id: updated.table_id,
      label: updated.label,
      description: updated.description,
      columns: (updated.columns as unknown as unknown[]) ?? [],
      lookups: (updated.lookups as unknown as unknown[]) ?? [],
      updated_at: updated.updated_at,
    };
  }

  @Delete(":tableId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete a table (admin only)" })
  @ApiParam({ name: "tableId", description: "Stable table identifier" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiNoContentResponse({ description: "Table deleted (or did not exist)" })
  @ApiForbiddenResponse({ description: "Admin role required" })
  async deleteTable(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Query("group_id") group_id: string,
  ): Promise<void> {
    identityCanAccessGroup(req.resolvedIdentity, group_id, GroupRole.ADMIN);
    const actor_id = req.resolvedIdentity!.actorId;
    await this.svc.deleteTable(actor_id, group_id, tableId);
  }

  // ---------------------------------------------------------------------------
  // Column subresource endpoints
  // ---------------------------------------------------------------------------

  @Post(":tableId/columns")
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Add a column to a table (admin only)" })
  @ApiParam({ name: "tableId", description: "Stable table identifier" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiBody({ type: ColumnDto })
  @ApiCreatedResponse({ type: TableDetailDto })
  @ApiForbiddenResponse({ description: "Admin role required" })
  @ApiBadRequestResponse({ description: "Invalid column definition" })
  @ApiConflictResponse({ description: "Column key already exists" })
  async addColumn(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Query("group_id") group_id: string,
    @Body() body: ColumnDto,
  ): Promise<TableDetailDto> {
    identityCanAccessGroup(req.resolvedIdentity, group_id, GroupRole.ADMIN);
    const actor_id = req.resolvedIdentity!.actorId;
    const updated = await this.svc.addColumn(actor_id, group_id, tableId, body);
    return {
      id: updated.id,
      group_id: updated.group_id,
      table_id: updated.table_id,
      label: updated.label,
      description: updated.description,
      columns: (updated.columns as unknown as unknown[]) ?? [],
      lookups: (updated.lookups as unknown as unknown[]) ?? [],
      updated_at: updated.updated_at,
    };
  }

  @Patch(":tableId/columns/:columnKey")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Update a column definition (admin only)" })
  @ApiParam({ name: "tableId", description: "Stable table identifier" })
  @ApiParam({ name: "columnKey", description: "Column key to update" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiBody({ type: ColumnDto })
  @ApiOkResponse({ type: TableDetailDto })
  @ApiForbiddenResponse({ description: "Admin role required" })
  @ApiBadRequestResponse({
    description: "Invalid column definition or table not found",
  })
  @ApiConflictResponse({
    description: "Column update conflicts with existing lookups",
  })
  async updateColumn(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Param("columnKey") columnKey: string,
    @Query("group_id") group_id: string,
    @Body() body: ColumnDto,
  ): Promise<TableDetailDto> {
    identityCanAccessGroup(req.resolvedIdentity, group_id, GroupRole.ADMIN);
    const actor_id = req.resolvedIdentity!.actorId;
    const updated = await this.svc.updateColumn(
      actor_id,
      group_id,
      tableId,
      columnKey,
      body,
    );
    return {
      id: updated.id,
      group_id: updated.group_id,
      table_id: updated.table_id,
      label: updated.label,
      description: updated.description,
      columns: (updated.columns as unknown as unknown[]) ?? [],
      lookups: (updated.lookups as unknown as unknown[]) ?? [],
      updated_at: updated.updated_at,
    };
  }

  @Delete(":tableId/columns/:columnKey")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Remove a column from a table (admin only)" })
  @ApiParam({ name: "tableId", description: "Stable table identifier" })
  @ApiParam({ name: "columnKey", description: "Column key to remove" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiNoContentResponse({ description: "Column removed" })
  @ApiForbiddenResponse({ description: "Admin role required" })
  @ApiBadRequestResponse({ description: "Table not found" })
  @ApiConflictResponse({ description: "Column referenced by lookups" })
  async removeColumn(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Param("columnKey") columnKey: string,
    @Query("group_id") group_id: string,
  ): Promise<void> {
    identityCanAccessGroup(req.resolvedIdentity, group_id, GroupRole.ADMIN);
    const actor_id = req.resolvedIdentity!.actorId;
    await this.svc.removeColumn(actor_id, group_id, tableId, columnKey);
  }

  // ---------------------------------------------------------------------------
  // Lookup subresource endpoints
  // ---------------------------------------------------------------------------

  @Post(":tableId/lookups")
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Add a lookup to a table (admin only)" })
  @ApiParam({ name: "tableId", description: "Stable table identifier" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiBody({ type: LookupDto })
  @ApiCreatedResponse({ type: TableDetailDto })
  @ApiForbiddenResponse({ description: "Admin role required" })
  @ApiBadRequestResponse({ description: "Invalid lookup definition" })
  @ApiConflictResponse({ description: "Lookup name already exists" })
  async addLookup(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Query("group_id") group_id: string,
    @Body() body: LookupDto,
  ): Promise<TableDetailDto> {
    identityCanAccessGroup(req.resolvedIdentity, group_id, GroupRole.ADMIN);
    const actor_id = req.resolvedIdentity!.actorId;
    const updated = await this.svc.addLookup(
      actor_id,
      group_id,
      tableId,
      body as unknown as LookupDef,
    );
    return {
      id: updated.id,
      group_id: updated.group_id,
      table_id: updated.table_id,
      label: updated.label,
      description: updated.description,
      columns: (updated.columns as unknown as unknown[]) ?? [],
      lookups: (updated.lookups as unknown as unknown[]) ?? [],
      updated_at: updated.updated_at,
    };
  }

  @Patch(":tableId/lookups/:lookupName")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Update a lookup definition (admin only)" })
  @ApiParam({ name: "tableId", description: "Stable table identifier" })
  @ApiParam({ name: "lookupName", description: "Lookup name to update" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiBody({ type: LookupDto })
  @ApiOkResponse({ type: TableDetailDto })
  @ApiForbiddenResponse({ description: "Admin role required" })
  @ApiBadRequestResponse({
    description: "Invalid lookup definition or table not found",
  })
  @ApiConflictResponse({
    description: "Lookup update conflicts with existing definitions",
  })
  async updateLookup(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Param("lookupName") lookupName: string,
    @Query("group_id") group_id: string,
    @Body() body: LookupDto,
  ): Promise<TableDetailDto> {
    identityCanAccessGroup(req.resolvedIdentity, group_id, GroupRole.ADMIN);
    const actor_id = req.resolvedIdentity!.actorId;
    const updated = await this.svc.updateLookup(
      actor_id,
      group_id,
      tableId,
      lookupName,
      body as unknown as LookupDef,
    );
    return {
      id: updated.id,
      group_id: updated.group_id,
      table_id: updated.table_id,
      label: updated.label,
      description: updated.description,
      columns: (updated.columns as unknown as unknown[]) ?? [],
      lookups: (updated.lookups as unknown as unknown[]) ?? [],
      updated_at: updated.updated_at,
    };
  }

  @Delete(":tableId/lookups/:lookupName")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Remove a lookup from a table (admin only)" })
  @ApiParam({ name: "tableId", description: "Stable table identifier" })
  @ApiParam({ name: "lookupName", description: "Lookup name to remove" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiNoContentResponse({ description: "Lookup removed" })
  @ApiForbiddenResponse({ description: "Admin role required" })
  @ApiConflictResponse({
    description: "Lookup removal conflicts with existing definitions",
  })
  async removeLookup(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Param("lookupName") lookupName: string,
    @Query("group_id") group_id: string,
  ): Promise<void> {
    identityCanAccessGroup(req.resolvedIdentity, group_id, GroupRole.ADMIN);
    const actor_id = req.resolvedIdentity!.actorId;
    await this.svc.removeLookup(actor_id, group_id, tableId, lookupName);
  }

  // ---------------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------------

  @Get(":tableId/rows")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "List rows in a table (paginated)" })
  @ApiParam({ name: "tableId" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ type: RowListDto })
  @ApiForbiddenResponse({ description: "Access denied" })
  async listRows(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Query("group_id") group_id: string,
    @Query("offset") offset = "0",
    @Query("limit") limit = "50",
  ): Promise<RowListDto> {
    identityCanAccessGroup(req.resolvedIdentity, group_id);
    const { rows, total } = await this.svc.listRows(group_id, tableId, {
      offset: Number(offset),
      limit: Number(limit),
    });
    return {
      rows: rows.map((r) => ({
        id: r.id,
        group_id: r.group_id,
        table_id: r.table_id,
        data: r.data as unknown as Record<string, unknown>,
        updated_at: r.updated_at,
      })),
      total,
    };
  }

  @Get(":tableId/rows/:rowId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get a single row" })
  @ApiParam({ name: "tableId" })
  @ApiParam({ name: "rowId" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiOkResponse({ type: RowDto })
  @ApiForbiddenResponse({ description: "Access denied" })
  @ApiNotFoundResponse({ description: "Row not found" })
  async getRow(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Param("rowId") rowId: string,
    @Query("group_id") group_id: string,
  ): Promise<RowDto> {
    identityCanAccessGroup(req.resolvedIdentity, group_id);
    const r = await this.svc.getRow(group_id, tableId, rowId);
    if (!r) throw new NotFoundException("Row not found");
    return {
      id: r.id,
      group_id: r.group_id,
      table_id: r.table_id,
      data: r.data as unknown as Record<string, unknown>,
      updated_at: r.updated_at,
    };
  }

  @Post(":tableId/rows")
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Create a row" })
  @ApiParam({ name: "tableId" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiBody({ type: CreateRowDto })
  @ApiCreatedResponse({ type: RowDto })
  @ApiForbiddenResponse({ description: "Access denied" })
  @ApiBadRequestResponse({ description: "Row data violates column schema" })
  async createRow(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Query("group_id") group_id: string,
    @Body() body: CreateRowDto,
  ): Promise<RowDto> {
    identityCanAccessGroup(req.resolvedIdentity, group_id);
    const actor_id = req.resolvedIdentity!.actorId;
    const r = await this.svc.createRow(actor_id, group_id, tableId, body.data);
    return {
      id: r.id,
      group_id: r.group_id,
      table_id: r.table_id,
      data: r.data as unknown as Record<string, unknown>,
      updated_at: r.updated_at,
    };
  }

  @Patch(":tableId/rows/:rowId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Update a row with optimistic locking" })
  @ApiParam({ name: "tableId" })
  @ApiParam({ name: "rowId" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiBody({ type: UpdateRowDto })
  @ApiOkResponse({ type: RowDto })
  @ApiForbiddenResponse({ description: "Access denied" })
  @ApiBadRequestResponse({ description: "Row data violates column schema" })
  @ApiConflictResponse({
    description:
      "Stale expected_updated_at — row was modified by another writer",
  })
  async updateRow(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Param("rowId") rowId: string,
    @Query("group_id") group_id: string,
    @Body() body: UpdateRowDto,
  ): Promise<RowDto> {
    identityCanAccessGroup(req.resolvedIdentity, group_id);
    const actor_id = req.resolvedIdentity!.actorId;
    const r = await this.svc.updateRow(actor_id, group_id, tableId, rowId, {
      data: body.data,
      expected_updated_at: new Date(body.expected_updated_at),
    });
    return {
      id: r.id,
      group_id: r.group_id,
      table_id: r.table_id,
      data: r.data as unknown as Record<string, unknown>,
      updated_at: r.updated_at,
    };
  }

  @Delete(":tableId/rows/:rowId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete a row" })
  @ApiParam({ name: "tableId" })
  @ApiParam({ name: "rowId" })
  @ApiQuery({ name: "group_id", required: true, type: String })
  @ApiNoContentResponse({ description: "Row deleted (or did not exist)" })
  @ApiForbiddenResponse({ description: "Access denied" })
  async deleteRow(
    @Req() req: Request,
    @Param("tableId") tableId: string,
    @Param("rowId") rowId: string,
    @Query("group_id") group_id: string,
  ): Promise<void> {
    identityCanAccessGroup(req.resolvedIdentity, group_id);
    const actor_id = req.resolvedIdentity!.actorId;
    await this.svc.deleteRow(actor_id, group_id, tableId, rowId);
  }
}
