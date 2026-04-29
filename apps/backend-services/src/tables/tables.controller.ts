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
import {
  CreateTableDto,
  TableDetailDto,
  TableSummaryDto,
  UpdateTableMetadataDto,
} from "./dto/table.dto";
import { TablesService } from "./tables.service";

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
}
