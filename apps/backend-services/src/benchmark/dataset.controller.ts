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
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
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
  CreateVersionDto,
  VersionResponseDto,
  VersionListResponseDto,
  UploadResponseDto,
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

  @Post(":id/upload")
  @HttpCode(HttpStatus.OK)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @UseInterceptors(
    FilesInterceptor("files", 100, {
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB per file
      },
    }),
  )
  @ApiOperation({ summary: "Upload files to a dataset" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiOkResponse({
    description:
      "Files uploaded successfully. Returns list of uploaded files and manifest status.",
    type: UploadResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Dataset not found",
  })
  @ApiBadRequestResponse({
    description: "Invalid file upload or dataset not found",
  })
  async uploadFiles(
    @Param("id") id: string,
    @UploadedFiles() files: Array<{
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    }>,
  ): Promise<UploadResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException("No files provided for upload");
    }

    // Check for file size limit violations (this is redundant with FilesInterceptor limits,
    // but provides a more specific error message)
    const maxSize = 100 * 1024 * 1024; // 100MB
    for (const file of files) {
      if (file.size > maxSize) {
        throw new PayloadTooLargeException(
          `File ${file.originalname} exceeds maximum size of 100MB`,
        );
      }
    }

    return this.datasetService.uploadFiles(id, files);
  }

  @Post(":id/versions")
  @HttpCode(HttpStatus.CREATED)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Create a new dataset version" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiBody({
    type: CreateVersionDto,
    description:
      "Version creation request with version label and optional ground truth schema",
  })
  @ApiCreatedResponse({
    description:
      "Version created successfully with DVC workflow (add, commit, push). Returns the created version with git revision.",
    type: VersionResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Dataset not found",
  })
  @ApiBadRequestResponse({
    description: "Invalid request body or validation error",
  })
  async createVersion(
    @Param("id") id: string,
    @Body() createDto: CreateVersionDto,
    @Req() req: Request,
  ): Promise<VersionResponseDto> {
    const user = req.user;
    const userId = user?.sub as string;

    if (!userId) {
      throw new BadRequestException("User ID not found in request");
    }

    return this.datasetService.createVersion(id, createDto, userId);
  }

  @Get(":id/versions")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "List versions for a dataset" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiOkResponse({
    description:
      "Returns list of versions with version label, status, documentCount, gitRevision, publishedAt, and createdAt",
    type: VersionListResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Dataset not found",
  })
  async listVersions(
    @Param("id") id: string,
  ): Promise<VersionListResponseDto> {
    return this.datasetService.listVersions(id);
  }

  @Get(":id/versions/:versionId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get version details by ID" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiOkResponse({
    description:
      "Returns full version details including groundTruthSchema, manifestPath, split list, and all metadata",
    type: VersionResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Version not found",
  })
  async getVersionById(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ): Promise<VersionResponseDto> {
    return this.datasetService.getVersionById(id, versionId);
  }

  @Patch(":id/versions/:versionId/publish")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Publish a dataset version" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiOkResponse({
    description:
      "Version published successfully. Status transitions to published and publishedAt is set.",
    type: VersionResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Version not found",
  })
  @ApiBadRequestResponse({
    description: "Version is already published",
  })
  async publishVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Req() req: Request,
  ): Promise<VersionResponseDto> {
    const user = req.user;
    const userId = user?.sub as string;

    if (!userId) {
      throw new BadRequestException("User ID not found in request");
    }

    return this.datasetService.publishVersion(id, versionId, userId);
  }

  @Patch(":id/versions/:versionId/archive")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Archive a dataset version" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiOkResponse({
    description:
      "Version archived successfully. Status transitions to archived.",
    type: VersionResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Version not found",
  })
  async archiveVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ): Promise<VersionResponseDto> {
    return this.datasetService.archiveVersion(id, versionId);
  }
}
