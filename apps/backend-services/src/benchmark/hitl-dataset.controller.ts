import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { AuditService } from "@/audit/audit.service";
import { Identity } from "@/auth/identity.decorator";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { GroupRole } from "@/generated/edge";
import { DatasetService } from "./dataset.service";
import {
  AddVersionFromHitlDto,
  AddVersionFromHitlResponseDto,
  CreateDatasetFromHitlDto,
  CreateDatasetFromHitlResponseDto,
  EligibleDocumentsFilterDto,
  EligibleDocumentsResponseDto,
} from "./dto";
import { HitlDatasetService } from "./hitl-dataset.service";

@ApiTags("Benchmark - HITL Datasets")
@Controller("api/benchmark/datasets")
export class HitlDatasetController {
  constructor(
    private readonly hitlDatasetService: HitlDatasetService,
    private readonly datasetService: DatasetService,
    private readonly auditService: AuditService,
  ) {}

  @Get("from-hitl/eligible-documents")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "List HITL-verified documents eligible for dataset creation",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({
    name: "search",
    required: false,
    type: String,
    description: "Filter by filename",
  })
  @ApiOkResponse({
    description: "Paginated list of eligible documents",
    type: EligibleDocumentsResponseDto,
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async listEligibleDocuments(
    @Query() filters: EligibleDocumentsFilterDto,
    @Req() req: Request,
  ) {
    let groupIds: string[];
    if (filters.group_id) {
      identityCanAccessGroup(req.resolvedIdentity, filters.group_id);
      groupIds = [filters.group_id];
    } else {
      groupIds = getIdentityGroupIds(req.resolvedIdentity);
    }

    if (groupIds.length === 0) {
      return { documents: [], total: 0, page: 1, limit: 20 };
    }

    const result = await this.hitlDatasetService.listEligibleDocuments(
      filters,
      groupIds,
    );
    await this.auditService.recordEvent({
      event_type: "document_list_accessed",
      resource_type: "hitl_eligible",
      resource_id:
        filters.group_id ?? (groupIds.length === 1 ? groupIds[0] : "multi"),
      actor_id: req.resolvedIdentity.actorId,
      group_id: filters.group_id,
      payload: {
        action: "metadata",
        document_ids: result.documents.map((d) => d.id),
        count: result.documents.length,
        group_ids: groupIds,
      },
    });
    return result;
  }

  @Post("from-hitl")
  @HttpCode(HttpStatus.CREATED)
  @Identity({
    allowApiKey: true,
    groupIdFrom: { body: "groupId" },
    minimumRole: GroupRole.MEMBER,
  })
  @ApiOperation({
    summary: "Create a new dataset from HITL-verified documents",
  })
  @ApiBody({ type: CreateDatasetFromHitlDto })
  @ApiCreatedResponse({
    description: "Dataset and version created from verified documents",
    type: CreateDatasetFromHitlResponseDto,
  })
  @ApiBadRequestResponse({
    description: "Invalid request or no documents could be processed",
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async createDatasetFromHitl(
    @Body() dto: CreateDatasetFromHitlDto,
    @Req() req: Request,
  ) {
    return this.hitlDatasetService.createDatasetFromHitl(
      dto,
      req.resolvedIdentity.actorId,
    );
  }

  @Post(":id/versions/from-hitl")
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary:
      "Add a new version to an existing dataset from HITL-verified documents",
  })
  @ApiParam({ name: "id", description: "Dataset ID" })
  @ApiBody({ type: AddVersionFromHitlDto })
  @ApiCreatedResponse({
    description: "New version created from verified documents",
    type: AddVersionFromHitlResponseDto,
  })
  @ApiNotFoundResponse({ description: "Dataset not found" })
  @ApiBadRequestResponse({
    description: "Invalid request or no documents could be processed",
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async addVersionFromHitl(
    @Param("id") datasetId: string,
    @Body() dto: AddVersionFromHitlDto,
    @Req() req: Request,
  ) {
    const dataset = await this.datasetService.getDatasetById(datasetId);
    identityCanAccessGroup(req.resolvedIdentity, dataset.groupId);

    return this.hitlDatasetService.addVersionFromHitl(
      datasetId,
      dto,
      req.resolvedIdentity.actorId,
      dataset.groupId,
    );
  }
}
