import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { DatasetService } from "./dataset.service";
import {
  GroundTruthJobsListResponseDto,
  GroundTruthReviewQueueResponseDto,
  GroundTruthReviewStatsResponseDto,
  StartGroundTruthGenerationDto,
  StartGroundTruthGenerationResponseDto,
} from "./dto";
import { GroundTruthGenerationService } from "./ground-truth-generation.service";

@ApiTags("benchmark-datasets")
@Controller(
  "api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation",
)
export class GroundTruthGenerationController {
  constructor(
    private readonly groundTruthGenerationService: GroundTruthGenerationService,
    private readonly datasetService: DatasetService,
  ) {}

  private async assertDatasetGroupAccess(
    datasetId: string,
    req: Request,
  ): Promise<void> {
    const dataset = await this.datasetService.getDatasetById(datasetId);
    await identityCanAccessGroup(req.resolvedIdentity, dataset.groupId);
  }

  @Post()
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Start ground truth generation via OCR workflow + HITL",
    description:
      "Creates ground truth generation jobs for samples without ground truth. " +
      "Runs them through the specified OCR workflow and makes them available for HITL review.",
  })
  @ApiParam({ name: "id", description: "Dataset ID" })
  @ApiParam({ name: "versionId", description: "Dataset version ID" })
  @ApiCreatedResponse({
    description: "Ground truth generation started",
    type: StartGroundTruthGenerationResponseDto,
  })
  async startGeneration(
    @Param("id") datasetId: string,
    @Param("versionId") versionId: string,
    @Body() dto: StartGroundTruthGenerationDto,
    @Req() req: Request,
  ) {
    await this.assertDatasetGroupAccess(datasetId, req);
    const userId = req.user?.sub || "anonymous";
    return this.groundTruthGenerationService.startGeneration(
      datasetId,
      versionId,
      dto.workflowConfigId,
      userId,
    );
  }

  @Get("jobs")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "List ground truth generation jobs",
    description:
      "Returns paginated list of ground truth generation jobs for a dataset version.",
  })
  @ApiParam({ name: "id", description: "Dataset ID" })
  @ApiParam({ name: "versionId", description: "Dataset version ID" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({
    description: "Paginated list of ground truth jobs",
    type: GroundTruthJobsListResponseDto,
  })
  async getJobs(
    @Param("id") datasetId: string,
    @Param("versionId") versionId: string,
    @Req() req: Request,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
  ) {
    await this.assertDatasetGroupAccess(datasetId, req);
    return this.groundTruthGenerationService.getJobs(
      datasetId,
      versionId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
  }

  @Get("review/queue")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Get dataset-scoped HITL review queue",
    description:
      "Returns documents awaiting HITL review for ground truth generation. " +
      "Separate from the production HITL queue.",
  })
  @ApiParam({ name: "id", description: "Dataset ID" })
  @ApiParam({ name: "versionId", description: "Dataset version ID" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiQuery({
    name: "reviewStatus",
    required: false,
    enum: ["pending", "reviewed", "all"],
  })
  @ApiOkResponse({
    description: "Dataset-scoped review queue",
    type: GroundTruthReviewQueueResponseDto,
  })
  async getReviewQueue(
    @Param("id") datasetId: string,
    @Param("versionId") versionId: string,
    @Req() req: Request,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("reviewStatus") reviewStatus?: "pending" | "reviewed" | "all",
  ) {
    await this.assertDatasetGroupAccess(datasetId, req);
    return this.groundTruthGenerationService.getReviewQueue(
      datasetId,
      versionId,
      {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
        reviewStatus,
      },
    );
  }

  @Get("review/stats")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Get ground truth review queue statistics",
  })
  @ApiParam({ name: "id", description: "Dataset ID" })
  @ApiParam({ name: "versionId", description: "Dataset version ID" })
  @ApiOkResponse({
    description: "Review queue statistics",
    type: GroundTruthReviewStatsResponseDto,
  })
  async getReviewStats(
    @Param("id") datasetId: string,
    @Param("versionId") versionId: string,
    @Req() req: Request,
  ) {
    await this.assertDatasetGroupAccess(datasetId, req);
    return this.groundTruthGenerationService.getReviewStats(
      datasetId,
      versionId,
    );
  }
}
