/**
 * Benchmark Run Controller
 *
 * REST API endpoints for managing benchmark runs.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 11.2
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import type { HitlAggregationFilters } from "@/hitl/hitl-aggregation.service";
import { WorkflowService } from "@/workflow/workflow.service";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { BenchmarkRunService } from "./benchmark-run.service";
import {
  CreateRunDto,
  DrillDownResponseDto,
  OcrImprovementRunDto,
  OcrImprovementRunResponseDto,
  PerSampleResultsResponseDto,
  PromoteBaselineDto,
  PromoteBaselineResponseDto,
  RunDetailsDto,
  RunSummaryDto,
} from "./dto";
import { OcrImprovementPipelineService } from "./ocr-improvement-pipeline.service";

function mapHitlFilters(
  raw?: Record<string, unknown>,
): HitlAggregationFilters | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const filters: HitlAggregationFilters = {};
  if (raw.startDate != null) {
    filters.startDate =
      raw.startDate instanceof Date
        ? raw.startDate
        : new Date(String(raw.startDate));
  }
  if (raw.endDate != null) {
    filters.endDate =
      raw.endDate instanceof Date ? raw.endDate : new Date(String(raw.endDate));
  }
  if (Array.isArray(raw.groupIds)) filters.groupIds = raw.groupIds as string[];
  if (Array.isArray(raw.fieldKeys))
    filters.fieldKeys = raw.fieldKeys as string[];
  if (Array.isArray(raw.actions)) filters.actions = raw.actions as string[];
  if (typeof raw.limit === "number") filters.limit = raw.limit;
  return Object.keys(filters).length > 0 ? filters : undefined;
}

@ApiTags("Benchmark - Runs")
@Controller("api/benchmark/projects/:projectId")
export class BenchmarkRunController {
  private readonly logger = new Logger(BenchmarkRunController.name);

  constructor(
    private readonly benchmarkRunService: BenchmarkRunService,
    private readonly benchmarkProjectService: BenchmarkProjectService,
    private readonly benchmarkDefinitionService: BenchmarkDefinitionService,
    private readonly ocrImprovementPipeline: OcrImprovementPipelineService,
    private readonly workflowService: WorkflowService,
  ) {}

  private async assertProjectGroupAccess(
    projectId: string,
    req: Request,
  ): Promise<void> {
    const project =
      await this.benchmarkProjectService.getProjectById(projectId);
    identityCanAccessGroup(req.resolvedIdentity, project.groupId);
  }

  @Post("definitions/:definitionId/ocr-improvement/run")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Run OCR improvement pipeline",
    description:
      "Aggregates HITL corrections, runs AI recommendation, creates candidate workflow, and starts a benchmark run with the candidate. " +
      "Set waitForPipelineRunCompletion to poll until the run finishes and return baseline comparison (optional).",
  })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "definitionId", description: "Benchmark definition ID" })
  @ApiBody({ type: OcrImprovementRunDto })
  @ApiOkResponse({
    description:
      'HTTP 200 with a structured body for all outcomes (including `status: "error"`). ' +
      "Clients should inspect `status` and optional `error` rather than inferring success from the status code alone.",
    type: OcrImprovementRunResponseDto,
  })
  @ApiNotFoundResponse({ description: "Definition not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async runOcrImprovement(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Body() dto: OcrImprovementRunDto,
    @Req() req: Request,
  ): Promise<OcrImprovementRunResponseDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/definitions/${definitionId}/ocr-improvement/run`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    const project =
      await this.benchmarkProjectService.getProjectById(projectId);
    const definition = await this.benchmarkDefinitionService.getDefinitionById(
      projectId,
      definitionId,
    );
    // Must be DB Actor.id (see User.actor_id), not JWT sub / User.id — WorkflowService.createCandidateVersion resolves the user via actor_id.
    let actorId = req.resolvedIdentity?.actorId;
    if (!actorId) {
      const sourceWorkflow = await this.workflowService.getWorkflowVersionById(
        definition.workflow.workflowVersionId,
      );
      if (!sourceWorkflow) {
        throw new NotFoundException(
          `Workflow not found: ${definition.workflow.workflowVersionId}`,
        );
      }
      actorId = sourceWorkflow.actorId;
    }
    let hitlFilters = mapHitlFilters(dto.hitlFilters);
    if (!hitlFilters?.groupIds?.length) {
      hitlFilters = { ...hitlFilters, groupIds: [project.groupId] };
    }
    const result = await this.ocrImprovementPipeline.run({
      workflowVersionId: definition.workflow.workflowVersionId,
      benchmarkDefinitionId: definitionId,
      benchmarkProjectId: projectId,
      actorId,
      hitlFilters,
      waitForPipelineRunCompletion: dto.waitForPipelineRunCompletion === true,
      pipelineRunPollIntervalMs: dto.pipelineRunPollIntervalMs,
      pipelineRunWaitTimeoutMs: dto.pipelineRunWaitTimeoutMs,
      normalizeFieldsEmptyValueCoercion: dto.normalizeFieldsEmptyValueCoercion,
    });
    return {
      candidateWorkflowVersionId: result.candidateWorkflowVersionId,
      benchmarkRunId: result.benchmarkRunId,
      recommendationsSummary: result.recommendationsSummary,
      analysis: result.analysis,
      pipelineMessage: result.pipelineMessage,
      rejectionDetails: result.rejectionDetails,
      status: result.status,
      error: result.error,
      benchmarkRunStatus: result.benchmarkRunStatus,
      baselineComparison: result.baselineComparison,
    };
  }

  @Post("definitions/:definitionId/runs")
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Start a benchmark run",
    description:
      "Creates a BenchmarkRun record, starts the Temporal workflow, and marks the definition as immutable.",
  })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "definitionId", description: "Benchmark definition ID" })
  @ApiBody({ type: CreateRunDto })
  @ApiCreatedResponse({
    description: "Run started successfully",
    type: RunDetailsDto,
  })
  @ApiBadRequestResponse({
    description: "Dataset version has no files or failed validation",
  })
  @ApiNotFoundResponse({ description: "Definition not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async startRun(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Body() createRunDto: CreateRunDto,
    @Req() req: Request,
  ): Promise<RunDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/definitions/${definitionId}/runs`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    const actorId = req.resolvedIdentity!.actorId;
    return this.benchmarkRunService.startRun(
      projectId,
      definitionId,
      createRunDto,
      actorId,
    );
  }

  @Get("runs")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "List all runs for a project" })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiOkResponse({
    description: "List of benchmark runs",
    type: [RunSummaryDto],
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async listRuns(
    @Param("projectId") projectId: string,
    @Req() req: Request,
  ): Promise<RunSummaryDto[]> {
    this.logger.log(`GET /api/benchmark/projects/${projectId}/runs`);
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkRunService.listRuns(projectId);
  }

  @Get("runs/:runId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get run details by ID" })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "runId", description: "Benchmark run ID" })
  @ApiOkResponse({
    description: "Run details with metrics and baseline comparison",
    type: RunDetailsDto,
  })
  @ApiNotFoundResponse({ description: "Run not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getRunById(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Req() req: Request,
  ): Promise<RunDetailsDto> {
    this.logger.log(`GET /api/benchmark/projects/${projectId}/runs/${runId}`);
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkRunService.getRunById(projectId, runId);
  }

  @Post("runs/:runId/cancel")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Cancel a running benchmark" })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "runId", description: "Benchmark run ID" })
  @ApiOkResponse({
    description: "Run cancelled successfully",
    type: RunDetailsDto,
  })
  @ApiBadRequestResponse({ description: "Run is not in a cancellable state" })
  @ApiNotFoundResponse({ description: "Run not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async cancelRun(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Req() req: Request,
  ): Promise<RunDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/runs/${runId}/cancel`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkRunService.cancelRun(projectId, runId);
  }

  @Get("runs/:runId/drill-down")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Get drill-down summary with detailed failure analysis",
    description:
      "Returns aggregated metrics, worst-performing samples, and per-field error breakdown for a completed run.",
  })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "runId", description: "Benchmark run ID" })
  @ApiOkResponse({
    description: "Drill-down analysis",
    type: DrillDownResponseDto,
  })
  @ApiBadRequestResponse({ description: "Run is not completed" })
  @ApiNotFoundResponse({ description: "Run not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getDrillDown(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Req() req: Request,
  ): Promise<DrillDownResponseDto> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/runs/${runId}/drill-down`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkRunService.getDrillDown(projectId, runId);
  }

  @Get("runs/:runId/samples")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Get per-sample results with filtering and pagination",
    description:
      "Supports filtering by metadata dimensions (e.g., docType=invoice) and the synthetic 'pass' dimension.",
  })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "runId", description: "Benchmark run ID" })
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
    description: "Items per page (default: 20)",
  })
  @ApiOkResponse({
    description: "Paginated per-sample results",
    type: PerSampleResultsResponseDto,
  })
  @ApiBadRequestResponse({ description: "Run is not completed" })
  @ApiNotFoundResponse({ description: "Run not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getPerSampleResults(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Query() query: Record<string, string>,
    @Req() req: Request,
  ): Promise<PerSampleResultsResponseDto> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/runs/${runId}/samples`,
    );
    await this.assertProjectGroupAccess(projectId, req);

    // Extract pagination params
    const page = query.page ? parseInt(query.page, 10) : 1;
    const limit = query.limit ? parseInt(query.limit, 10) : 20;

    // Extract filter params (everything except page and limit)
    const filters: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(query)) {
      if (key !== "page" && key !== "limit") {
        // Try to parse as number, otherwise keep as string
        const numValue = Number(value);
        filters[key] = isNaN(numValue) ? value : numValue;
      }
    }

    return this.benchmarkRunService.getPerSampleResults(
      projectId,
      runId,
      filters,
      page,
      limit,
    );
  }

  @Post("runs/:runId/baseline")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Promote a run to baseline",
    description:
      "Sets the run as the baseline for its definition. Clears any previous baseline. Optionally configures regression thresholds.",
  })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "runId", description: "Benchmark run ID" })
  @ApiBody({ type: PromoteBaselineDto })
  @ApiOkResponse({
    description: "Run promoted to baseline",
    type: PromoteBaselineResponseDto,
  })
  @ApiBadRequestResponse({ description: "Run is not completed" })
  @ApiNotFoundResponse({ description: "Run not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async promoteToBaseline(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Body() promoteBaselineDto: PromoteBaselineDto,
    @Req() req: Request,
  ): Promise<PromoteBaselineResponseDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/runs/${runId}/baseline`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    const actorId = req.resolvedIdentity!.actorId;
    return this.benchmarkRunService.promoteToBaseline(
      projectId,
      runId,
      promoteBaselineDto,
      actorId,
    );
  }

  @Delete("runs/:runId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Delete a benchmark run",
    description: "Only completed, failed, or cancelled runs can be deleted.",
  })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "runId", description: "Benchmark run ID" })
  @ApiNoContentResponse({ description: "Run deleted successfully" })
  @ApiBadRequestResponse({ description: "Run is still active" })
  @ApiNotFoundResponse({ description: "Run not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteRun(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Req() req: Request,
  ): Promise<void> {
    this.logger.log(
      `DELETE /api/benchmark/projects/${projectId}/runs/${runId}`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkRunService.deleteRun(projectId, runId);
  }
}
