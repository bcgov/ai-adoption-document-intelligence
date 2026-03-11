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
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { Identity } from "@/auth/identity.decorator";
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
  @ApiOkResponse({ description: "Paginated list of eligible documents", type: EligibleDocumentsResponseDto })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async listEligibleDocuments(
    @Query() filters: EligibleDocumentsFilterDto,
    @Req() req: Request,
  ) {
    let groupIds: string[];
    if (filters.group_id) {
      identityCanAccessGroup(
        req.resolvedIdentity,
        filters.group_id,
      );
      groupIds = [filters.group_id];
    } else {
      groupIds = getIdentityGroupIds(
        req.resolvedIdentity,
      );
    }

    if (groupIds.length === 0) {
      return { documents: [], total: 0, page: 1, limit: 20 };
    }

    return this.hitlDatasetService.listEligibleDocuments(filters, groupIds);
  }

  @Post("from-hitl")
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
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
    const userId = req.user?.sub || req.resolvedIdentity?.userId || "anonymous";

    identityCanAccessGroup(
      req.resolvedIdentity,
      dto.groupId,
    );

    return this.hitlDatasetService.createDatasetFromHitl(dto, userId);
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
    const userId = req.user?.sub || req.resolvedIdentity?.userId || "anonymous";

    const dataset = await this.datasetService.getDatasetById(datasetId);
    identityCanAccessGroup(
      req.resolvedIdentity,
      dataset.groupId,
    );

    return this.hitlDatasetService.addVersionFromHitl(datasetId, dto, userId);
  }
}
