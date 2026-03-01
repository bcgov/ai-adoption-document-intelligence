import {
  BadRequestException,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import { HitlDatasetService } from "./hitl-dataset.service";
import {
  AddVersionFromHitlDto,
  CreateDatasetFromHitlDto,
  EligibleDocumentsFilterDto,
} from "./dto";

@ApiTags("Benchmark - HITL Datasets")
@Controller("api/benchmark/datasets")
export class HitlDatasetController {
  constructor(private readonly hitlDatasetService: HitlDatasetService) {}

  @Get("from-hitl/eligible-documents")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
  @ApiOkResponse({ description: "Paginated list of eligible documents" })
  async listEligibleDocuments(
    @Query() filters: EligibleDocumentsFilterDto,
  ) {
    return this.hitlDatasetService.listEligibleDocuments(filters);
  }

  @Post("from-hitl")
  @HttpCode(HttpStatus.CREATED)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Create a new dataset from HITL-verified documents",
  })
  @ApiBody({ type: CreateDatasetFromHitlDto })
  @ApiCreatedResponse({
    description: "Dataset and version created from verified documents",
  })
  @ApiBadRequestResponse({
    description: "Invalid request or no documents could be processed",
  })
  async createDatasetFromHitl(
    @Body() dto: CreateDatasetFromHitlDto,
    @Req() req: Request,
  ) {
    const userId = req.user?.sub as string;
    if (!userId) {
      throw new BadRequestException("User ID not found in request");
    }

    return this.hitlDatasetService.createDatasetFromHitl(dto, userId);
  }

  @Post(":id/versions/from-hitl")
  @HttpCode(HttpStatus.CREATED)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Add a new version to an existing dataset from HITL-verified documents",
  })
  @ApiParam({ name: "id", description: "Dataset ID" })
  @ApiBody({ type: AddVersionFromHitlDto })
  @ApiCreatedResponse({
    description: "New version created from verified documents",
  })
  @ApiNotFoundResponse({ description: "Dataset not found" })
  @ApiBadRequestResponse({
    description: "Invalid request or no documents could be processed",
  })
  async addVersionFromHitl(
    @Param("id") datasetId: string,
    @Body() dto: AddVersionFromHitlDto,
    @Req() req: Request,
  ) {
    const userId = req.user?.sub as string;
    if (!userId) {
      throw new BadRequestException("User ID not found in request");
    }

    return this.hitlDatasetService.addVersionFromHitl(datasetId, dto, userId);
  }
}
