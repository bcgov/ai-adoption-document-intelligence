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
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { DatasetService } from "./dataset.service";
import {
  CreateDatasetDto,
  CreateSplitDto,
  CreateVersionDto,
  DatasetResponseDto,
  FreezeSplitResponseDto,
  GroundTruthResponseDto,
  PaginatedDatasetResponseDto,
  SampleListResponseDto,
  SplitDetailResponseDto,
  SplitListResponseDto,
  SplitResponseDto,
  UpdateVersionDto,
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

  private async assertDatasetGroupAccess(
    datasetId: string,
    req: Request,
  ): Promise<void> {
    const dataset = await this.datasetService.getDatasetById(datasetId);
    identityCanAccessGroup(req.resolvedIdentity, dataset.groupId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Identity({
    allowApiKey: true,
    groupIdFrom: { body: "groupId" },
  })
  @ApiOperation({ summary: "Create a new dataset" })
  @ApiBody({
    type: CreateDatasetDto,
    description:
      "Dataset creation request with name, description, and metadata",
  })
  @ApiCreatedResponse({
    description:
      "Dataset created successfully. Returns the created dataset with its ID.",
    type: DatasetResponseDto,
  })
  @ApiBadRequestResponse({
    description: "Invalid request body or validation error",
  })
  async createDataset(
    @Body() createDto: CreateDatasetDto,
    @Req() req: Request,
  ): Promise<DatasetResponseDto> {
    return this.datasetService.createDataset(
      createDto,
      req.resolvedIdentity.actorId,
    );
  }

  @Get()
  @Identity({ allowApiKey: true })
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
  @ApiQuery({
    name: "groupId",
    required: false,
    description: "Optional group ID to filter datasets by a specific group",
  })
  @ApiOkResponse({
    description:
      "Returns paginated list of datasets with name, description, metadata, version count, createdBy, and timestamps",
    type: PaginatedDatasetResponseDto,
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async listDatasets(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("groupId") groupId?: string,
    @Req() req?: Request,
  ): Promise<PaginatedDatasetResponseDto> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    if (groupId) {
      identityCanAccessGroup(req!.resolvedIdentity, groupId);
      return this.datasetService.listDatasets(pageNum, limitNum, [groupId]);
    }

    const groupIds = getIdentityGroupIds(req!.resolvedIdentity);

    if (groupIds.length === 0) {
      return {
        data: [],
        total: 0,
        page: pageNum,
        limit: limitNum,
        totalPages: 0,
      };
    }

    return this.datasetService.listDatasets(pageNum, limitNum, groupIds);
  }

  @Get(":id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get dataset details by ID" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiOkResponse({
    description:
      "Returns full dataset details including storagePath, metadata, version count, and list of recent versions",
    type: DatasetResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Dataset not found",
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getDatasetById(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<DatasetResponseDto> {
    const dataset = await this.datasetService.getDatasetById(id);

    identityCanAccessGroup(req.resolvedIdentity, dataset.groupId);

    return dataset;
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete a dataset by ID" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiOkResponse({
    description: "Dataset deleted successfully",
  })
  @ApiNotFoundResponse({
    description: "Dataset not found",
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteDataset(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.deleteDataset(id);
  }

  @Post(":id/versions/:versionId/upload")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
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
    await this.assertDatasetGroupAccess(id, req);
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

    const groupId = (await this.datasetService.getDatasetById(id)).groupId;
    return this.datasetService.uploadFilesToVersion(
      id,
      versionId,
      files,
      req.resolvedIdentity.actorId,
      groupId,
    );
  }

  @Post(":id/versions")
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Create a new dataset version" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiBody({
    type: CreateVersionDto,
    description:
      "Version creation request with version label and optional ground truth schema",
  })
  @ApiCreatedResponse({
    description:
      "Version created successfully. Returns the created version with storage prefix.",
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
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.createVersion(
      id,
      createDto,
      req.resolvedIdentity.actorId,
    );
  }

  @Get(":id/versions")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "List versions for a dataset" })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiOkResponse({
    description:
      "Returns list of versions with version label, status, documentCount, storagePrefix, publishedAt, and createdAt",
    type: VersionListResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Dataset not found",
  })
  async listVersions(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<VersionListResponseDto> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.listVersions(id);
  }

  @Get(":id/versions/:versionId")
  @Identity({ allowApiKey: true })
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
    @Req() req: Request,
  ): Promise<VersionResponseDto> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.getVersionById(id, versionId);
  }

  @Patch(":id/versions/:versionId")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Update a dataset version",
    description:
      "Updates metadata for an unfrozen dataset version. Currently supports updating the name.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiBody({
    type: UpdateVersionDto,
    description: "Version update request",
  })
  @ApiOkResponse({
    description: "Version updated successfully",
    type: VersionResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Version not found",
  })
  @ApiBadRequestResponse({
    description: "Version is frozen and cannot be modified",
  })
  async updateVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Body() updateDto: UpdateVersionDto,
    @Req() req: Request,
  ): Promise<VersionResponseDto> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.updateVersionName(
      id,
      versionId,
      updateDto.name ?? "",
    );
  }

  @Delete(":id/versions/:versionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
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
    @Req() req: Request,
  ): Promise<void> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.deleteVersion(id, versionId);
  }

  @Delete(":id/versions/:versionId/samples/:sampleId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Delete a sample from a draft dataset version",
    description:
      "Removes a sample from the manifest and deletes its files from object storage. Only works on draft versions.",
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
    @Req() req: Request,
  ): Promise<void> {
    await this.assertDatasetGroupAccess(id, req);
    const groupId = (await this.datasetService.getDatasetById(id)).groupId;
    return this.datasetService.deleteSample(id, versionId, sampleId, groupId);
  }

  @Get(":id/versions/:versionId/samples")
  @Identity({ allowApiKey: true })
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
    @Req() req: Request,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ): Promise<SampleListResponseDto> {
    await this.assertDatasetGroupAccess(id, req);

    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    return this.datasetService.listSamples(id, versionId, pageNum, limitNum);
  }

  @Get(":id/versions/:versionId/samples/:sampleId/ground-truth")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Get ground truth JSON content for a sample",
    description:
      "Fetches and returns the ground truth JSON content for a specific sample from object storage",
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
    @Req() req: Request,
  ): Promise<GroundTruthResponseDto> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.getGroundTruth(id, versionId, sampleId);
  }

  @Get(":id/versions/:versionId/files/download")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Download a raw file from a dataset version",
    description:
      "Serves the original uploaded file (input document or ground truth) from object storage",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiOkResponse({ description: "Returns the raw file" })
  @ApiNotFoundResponse({ description: "File or version not found" })
  async downloadFile(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Query("path") filePath: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.assertDatasetGroupAccess(id, req);

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
  @Identity({ allowApiKey: true })
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
    @Req() req: Request,
  ): Promise<ValidationResponseDto> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.validateDatasetVersion(
      id,
      versionId,
      requestDto,
    );
  }

  @Post(":id/versions/:versionId/splits")
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Create a split for a dataset version",
    description:
      "Creates a new split with the specified name, type (train/val/test/golden), and sample IDs. Optionally accepts stratificationRules for proportional distribution.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiBody({
    description: "Split creation request with name, type, and sampleIds",
    type: CreateSplitDto,
  })
  @ApiCreatedResponse({
    description: "Split created successfully",
    type: SplitResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Dataset version not found",
  })
  async createSplit(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Body() createDto: CreateSplitDto,
    @Req() req: Request,
  ): Promise<SplitResponseDto> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.createSplit(id, versionId, createDto);
  }

  @Get(":id/versions/:versionId/splits")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "List splits for a dataset version",
    description:
      "Returns all splits for the specified version with name, type, sample count, frozen status, and creation date.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiOkResponse({
    description: "List of splits for this dataset version",
    type: SplitListResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Dataset version not found",
  })
  async listSplits(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Req() req: Request,
  ): Promise<SplitListResponseDto> {
    await this.assertDatasetGroupAccess(id, req);
    const splits = await this.datasetService.listSplits(id, versionId);
    return { splits };
  }

  @Get(":id/versions/:versionId/splits/:splitId")
  @Identity({ allowApiKey: true })
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
    type: SplitDetailResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Split not found",
  })
  async getSplit(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Param("splitId") splitId: string,
    @Req() req: Request,
  ): Promise<SplitDetailResponseDto> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.getSplit(id, versionId, splitId);
  }

  @Patch(":id/versions/:versionId/splits/:splitId")
  @Identity({ allowApiKey: true })
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
    schema: {
      type: "object",
      properties: {
        sampleIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of sample IDs to include in the split",
        },
      },
      required: ["sampleIds"],
    },
  })
  @ApiOkResponse({
    description: "Split updated successfully",
    type: SplitResponseDto,
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
    @Body() updateDto: { sampleIds: string[] },
    @Req() req: Request,
  ): Promise<SplitResponseDto> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.updateSplit(id, versionId, splitId, updateDto);
  }

  @Post(":id/versions/:versionId/freeze")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Freeze a dataset version",
    description:
      "Freezes a dataset version, preventing file uploads and sample deletions. Automatically applied when a benchmark run starts.",
  })
  @ApiParam({ name: "id", description: "Dataset ID (UUID)" })
  @ApiParam({ name: "versionId", description: "Version ID (UUID)" })
  @ApiOkResponse({
    description: "Version frozen successfully",
  })
  @ApiNotFoundResponse({
    description: "Version not found",
  })
  async freezeVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Req() req: Request,
  ): Promise<{
    id: string;
    datasetId: string;
    version: string;
    name: string | null;
    frozen: boolean;
  }> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.freezeVersion(id, versionId);
  }

  @Post(":id/versions/:versionId/splits/:splitId/freeze")
  @Identity({ allowApiKey: true })
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
    type: FreezeSplitResponseDto,
  })
  @ApiNotFoundResponse({
    description: "Split not found",
  })
  async freezeSplit(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Param("splitId") splitId: string,
    @Req() req: Request,
  ): Promise<FreezeSplitResponseDto> {
    await this.assertDatasetGroupAccess(id, req);
    return this.datasetService.freezeSplit(id, versionId, splitId);
  }
}
