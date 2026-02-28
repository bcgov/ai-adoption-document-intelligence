/**
 * Dataset Controller
 *
 * REST API endpoints for dataset CRUD operations.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-006-dataset-service-controller.md
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import type { Response } from "express";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
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
import { DatasetService } from "./dataset.service";
import {
  CreateDatasetDto,
  CreateVersionDto,
  DatasetResponseDto,
  GroundTruthResponseDto,
  PaginatedDatasetResponseDto,
  SampleListResponseDto,
  CreateSplitDto,
  UploadResponseDto,
  ValidateDatasetRequestDto,
  ValidationResponseDto,
  VersionListResponseDto,
  VersionResponseDto,
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

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Delete a dataset by ID" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiOkResponse({
    description: "Dataset deleted successfully",
  })
  @ApiNotFoundResponse({
    description: "Dataset not found",
  })
  async deleteDataset(@Param("id") id: string): Promise<void> {
    return this.datasetService.deleteDataset(id);
  }

  @Post(":id/versions/:versionId/upload")
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
  @ApiOperation({ summary: "Upload files to a specific dataset version" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiOkResponse({
    description:
      "Files uploaded successfully. Returns list of uploaded files and updated version info.",
    type: UploadResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Dataset or version not found",
  })
  @ApiBadRequestResponse({
    description: "Invalid file upload or no files provided",
  })
  async uploadFilesToVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @UploadedFiles() files: Array<{
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    }>,
    @Req() req: Request,
  ): Promise<UploadResponseDto> {
    const user = req.user;
    const userId = user?.sub as string;

    if (!userId) {
      throw new BadRequestException("User ID not found in request");
    }

    if (!files || files.length === 0) {
      throw new BadRequestException("No files provided for upload");
    }

    const maxSize = 100 * 1024 * 1024; // 100MB
    for (const file of files) {
      if (file.size > maxSize) {
        throw new PayloadTooLargeException(
          `File ${file.originalname} exceeds maximum size of 100MB`,
        );
      }
    }

    return this.datasetService.uploadFilesToVersion(id, versionId, files, userId);
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
  async listVersions(@Param("id") id: string): Promise<VersionListResponseDto> {
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

  @Delete(":id/versions/:versionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Delete a dataset version",
    description:
      "Deletes a dataset version and its splits. Blocked if any benchmark definitions reference this version.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiOkResponse({
    description: "Version deleted successfully",
  })
  @ApiNotFoundResponse({
    description: "Version not found",
  })
  @ApiConflictResponse({
    description:
      "Version cannot be deleted because it is referenced by benchmark definitions",
  })
  async deleteVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ): Promise<void> {
    return this.datasetService.deleteVersion(id, versionId);
  }

  @Delete(":id/versions/:versionId/samples/:sampleId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Delete a sample from a draft dataset version",
    description:
      "Removes a sample from the manifest and deletes its files from the git repo. Only works on draft versions.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiParam({ name: "sampleId", description: "Sample ID" })
  @ApiOkResponse({
    description: "Sample deleted successfully",
  })
  @ApiNotFoundResponse({
    description: "Dataset version or sample not found",
  })
  @ApiBadRequestResponse({
    description: "Version has no files uploaded",
  })
  async deleteSample(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Param("sampleId") sampleId: string,
  ): Promise<void> {
    return this.datasetService.deleteSample(id, versionId, sampleId);
  }

  @Get(":id/versions/:versionId/samples")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "List samples from a dataset version" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
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
      "Returns paginated list of samples from the manifest with IDs, input file references, ground truth file references, and metadata",
    type: SampleListResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Version not found",
  })
  @ApiBadRequestResponse({
    description: "Invalid manifest or malformed JSON",
  })
  async listSamples(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ): Promise<SampleListResponseDto> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    return this.datasetService.listSamples(id, versionId, pageNum, limitNum);
  }

  @Get(":id/versions/:versionId/samples/:sampleId/ground-truth")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Get ground truth JSON content for a sample",
    description:
      "Fetches and returns the ground truth JSON content for a specific sample from the dataset repository",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiParam({ name: "sampleId", description: "Sample ID" })
  @ApiOkResponse({
    description: "Returns the ground truth JSON content",
    type: GroundTruthResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Dataset version or sample not found",
  })
  @ApiBadRequestResponse({
    description: "Invalid ground truth file or malformed JSON",
  })
  async getGroundTruth(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Param("sampleId") sampleId: string,
  ): Promise<GroundTruthResponseDto> {
    return this.datasetService.getGroundTruth(id, versionId, sampleId);
  }

  @Get(":id/versions/:versionId/files/download")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Download a raw file from a dataset version",
    description:
      "Serves the original uploaded file (input document or ground truth) from the dataset repository",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiOkResponse({ description: "Returns the raw file" })
  @ApiNotFoundResponse({ description: "File or version not found" })
  async downloadFile(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Query("path") filePath: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!filePath) {
      throw new BadRequestException("Query parameter 'path' is required");
    }
    const { buffer, filename, mimeType } =
      await this.datasetService.getSampleFile(id, versionId, filePath);
    res.set({
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length.toString(),
    });
    res.send(buffer);
  }

  @Post(":id/versions/:versionId/validate")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Validate a dataset version for quality issues",
    description:
      "Runs validation checks on a dataset version including schema validation, missing ground truth detection, duplicate detection, and file corruption checks. Returns a structured validation report.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiBody({
    type: ValidateDatasetRequestDto,
    description:
      "Optional request body with sampleSize parameter for sampling validation",
    required: false,
  })
  @ApiOkResponse({
    description:
      "Returns validation report with pass/fail status, issue counts by category, and detailed list of issues",
    type: ValidationResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Dataset version not found",
  })
  @ApiBadRequestResponse({
    description: "Invalid request or validation failed",
  })
  async validateDatasetVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Body() requestDto: ValidateDatasetRequestDto,
  ): Promise<ValidationResponseDto> {
    return this.datasetService.validateDatasetVersion(
      id,
      versionId,
      requestDto,
    );
  }

  @Post(":id/versions/:versionId/splits")
  @HttpCode(HttpStatus.CREATED)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Create a split for a dataset version",
    description:
      "Creates a new split with the specified name, type (train/val/test/golden), and sample IDs. Optionally accepts stratificationRules for proportional distribution.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiBody({
    description: "Split creation request with name, type, and sampleIds",
  })
  @ApiCreatedResponse({
    description: "Split created successfully",
  })
  @ApiNotFoundResponse({
    description: "Dataset version not found",
  })
  async createSplit(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Body() createDto: CreateSplitDto,
  ): Promise<any> {
    return this.datasetService.createSplit(id, versionId, createDto);
  }

  @Get(":id/versions/:versionId/splits")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "List splits for a dataset version",
    description:
      "Returns all splits for the specified version with name, type, sample count, frozen status, and creation date.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiOkResponse({
    description: "List of splits for this dataset version",
  })
  @ApiNotFoundResponse({
    description: "Dataset version not found",
  })
  async listSplits(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ): Promise<any> {
    const splits = await this.datasetService.listSplits(id, versionId);
    return { splits };
  }

  @Get(":id/versions/:versionId/splits/:splitId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Get a single split with full details",
    description:
      "Returns complete split details including the full sampleIds array.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiParam({ name: "splitId", description: "Split ID (UUID)" })
  @ApiOkResponse({
    description: "Split details",
  })
  @ApiNotFoundResponse({
    description: "Split not found",
  })
  async getSplit(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Param("splitId") splitId: string,
  ): Promise<any> {
    return this.datasetService.getSplit(id, versionId, splitId);
  }

  @Patch(":id/versions/:versionId/splits/:splitId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Update a split",
    description:
      "Updates the sampleIds for an unfrozen split. Returns 400 if the split is frozen.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiParam({ name: "splitId", description: "Split ID (UUID)" })
  @ApiBody({
    description: "Update request with new sampleIds",
  })
  @ApiOkResponse({
    description: "Split updated successfully",
  })
  @ApiNotFoundResponse({
    description: "Split not found",
  })
  @ApiBadRequestResponse({
    description: "Split is frozen and cannot be modified",
  })
  async updateSplit(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Param("splitId") splitId: string,
    @Body() updateDto: any,
  ): Promise<any> {
    return this.datasetService.updateSplit(id, versionId, splitId, updateDto);
  }

  @Post(":id/versions/:versionId/splits/:splitId/freeze")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Freeze a split",
    description:
      "Freezes a split, making it immutable. Typically used for golden regression sets.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiParam({ name: "splitId", description: "Split ID (UUID)" })
  @ApiOkResponse({
    description: "Split frozen successfully",
  })
  @ApiNotFoundResponse({
    description: "Split not found",
  })
  async freezeSplit(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Param("splitId") splitId: string,
  ): Promise<any> {
    return this.datasetService.freezeSplit(id, versionId, splitId);
  }
}
