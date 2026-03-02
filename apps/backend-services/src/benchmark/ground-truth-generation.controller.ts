import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import {
  GroundTruthJobsListResponseDto,
  GroundTruthReviewQueueResponseDto,
  GroundTruthReviewStatsResponseDto,
  StartGroundTruthGenerationDto,
  StartGroundTruthGenerationResponseDto,
} from "./dto";
import { GroundTruthGenerationService } from "./ground-truth-generation.service";

interface AuthenticatedRequest {
  user?: {
    sub?: string;
    id?: string;
  };
}

@ApiTags("benchmark-datasets")
@Controller("api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation")
export class GroundTruthGenerationController {
  constructor(
    private readonly groundTruthGenerationService: GroundTruthGenerationService,
  ) {}

  @Post()
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user?.sub || req.user?.id || "anonymous";
    return this.groundTruthGenerationService.startGeneration(
      datasetId,
      versionId,
      dto.workflowConfigId,
      userId,
    );
  }

  @Get("jobs")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "List ground truth generation jobs",
    description: "Returns paginated list of ground truth generation jobs for a dataset version.",
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
    @Query("page") page?: number,
    @Query("limit") limit?: number,
  ) {
    return this.groundTruthGenerationService.getJobs(
      datasetId,
      versionId,
      page ? Number(page) : 1,
      limit ? Number(limit) : 50,
    );
  }

  @Get("review/queue")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
  @ApiQuery({ name: "reviewStatus", required: false, enum: ["pending", "reviewed", "all"] })
  @ApiOkResponse({
    description: "Dataset-scoped review queue",
    type: GroundTruthReviewQueueResponseDto,
  })
  async getReviewQueue(
    @Param("id") datasetId: string,
    @Param("versionId") versionId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("reviewStatus") reviewStatus?: "pending" | "reviewed" | "all",
  ) {
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
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
  ) {
    return this.groundTruthGenerationService.getReviewStats(
      datasetId,
      versionId,
    );
  }
}
