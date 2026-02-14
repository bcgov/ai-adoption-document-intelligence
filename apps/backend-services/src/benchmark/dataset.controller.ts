/**
 * Dataset Controller
 *
 * REST API endpoints for dataset CRUD operations.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-006-dataset-service-controller.md
 */

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
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiQuery,
  ApiParam,
  ApiBody,
} from "@nestjs/swagger";
import { Request } from "express";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import { DatasetService } from "./dataset.service";
import {
  CreateDatasetDto,
  DatasetResponseDto,
  PaginatedDatasetResponseDto,
} from "./dto";

@ApiTags("Benchmark - Datasets")
@Controller("api/benchmark/datasets")
export class DatasetController {
  constructor(private readonly datasetService: DatasetService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Create a new dataset" })
  @ApiBody({
    type: CreateDatasetDto,
    description:
      "Dataset creation request with name, description, metadata, and repositoryUrl",
  })
  @ApiCreatedResponse({
    description:
      "Dataset created successfully with DVC initialization. Returns the created dataset with its ID.",
    type: DatasetResponseDto,
  })
  @ApiBadRequestResponse({
    description: "Invalid request body or validation error",
  })
  async createDataset(
    @Body() createDto: CreateDatasetDto,
    @Req() req: Request,
  ): Promise<DatasetResponseDto> {
    const user = req.user;
    const userId = user?.sub as string;

    if (!userId) {
      throw new BadRequestException("User ID not found in request");
    }

    return this.datasetService.createDataset(createDto, userId);
  }

  @Get()
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "List datasets with pagination" })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    description: "Page number (default: 1)",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    type: Number,
    description: "Items per page (default: 20, max: 100)",
  })
  @ApiOkResponse({
    description:
      "Returns paginated list of datasets with name, description, metadata, version count, createdBy, and timestamps",
    type: PaginatedDatasetResponseDto,
  })
  async listDatasets(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ): Promise<PaginatedDatasetResponseDto> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    return this.datasetService.listDatasets(pageNum, limitNum);
  }

  @Get(":id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get dataset details by ID" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiOkResponse({
    description:
      "Returns full dataset details including repositoryUrl, dvcRemote, metadata, version count, and list of recent versions",
    type: DatasetResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Dataset not found",
  })
  async getDatasetById(@Param("id") id: string): Promise<DatasetResponseDto> {
    return this.datasetService.getDatasetById(id);
  }
}
