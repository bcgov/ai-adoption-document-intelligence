/**
 * Benchmark Run Controller
 *
 * REST API endpoints for managing benchmark runs.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 11.2
 */

import { BenchmarkArtifactType } from "@generated/client";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { BenchmarkArtifactService } from "./benchmark-artifact.service";
import { BenchmarkRunService } from "./benchmark-run.service";
import {
  ArtifactListResponseDto,
  CreateRunDto,
  DrillDownResponseDto,
  RunDetailsDto,
  RunSummaryDto,
} from "./dto";

@Controller("api/benchmark/projects/:projectId")
export class BenchmarkRunController {
  private readonly logger = new Logger(BenchmarkRunController.name);

  constructor(
    private readonly benchmarkRunService: BenchmarkRunService,
    private readonly benchmarkArtifactService: BenchmarkArtifactService,
  ) {}

  /**
   * Start a benchmark run
   *
   * POST /api/benchmark/projects/:projectId/definitions/:definitionId/runs
   */
  @Post("definitions/:definitionId/runs")
  @HttpCode(HttpStatus.CREATED)
  async startRun(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Body() createRunDto: CreateRunDto,
  ): Promise<RunDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/definitions/${definitionId}/runs`,
    );
    return this.benchmarkRunService.startRun(
      projectId,
      definitionId,
      createRunDto,
    );
  }

  /**
   * List all runs for a project
   *
   * GET /api/benchmark/projects/:projectId/runs
   */
  @Get("runs")
  async listRuns(
    @Param("projectId") projectId: string,
  ): Promise<RunSummaryDto[]> {
    this.logger.log(`GET /api/benchmark/projects/${projectId}/runs`);
    return this.benchmarkRunService.listRuns(projectId);
  }

  /**
   * Get run details by ID
   *
   * GET /api/benchmark/projects/:projectId/runs/:runId
   */
  @Get("runs/:runId")
  async getRunById(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ): Promise<RunDetailsDto> {
    this.logger.log(`GET /api/benchmark/projects/${projectId}/runs/${runId}`);
    return this.benchmarkRunService.getRunById(projectId, runId);
  }

  /**
   * Cancel a running benchmark
   *
   * POST /api/benchmark/projects/:projectId/runs/:runId/cancel
   */
  @Post("runs/:runId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancelRun(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ): Promise<RunDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/runs/${runId}/cancel`,
    );
    return this.benchmarkRunService.cancelRun(projectId, runId);
  }

  /**
   * Get drill-down summary with detailed failure analysis
   *
   * GET /api/benchmark/projects/:projectId/runs/:runId/drill-down
   */
  @Get("runs/:runId/drill-down")
  async getDrillDown(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ): Promise<DrillDownResponseDto> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/runs/${runId}/drill-down`,
    );
    return this.benchmarkRunService.getDrillDown(projectId, runId);
  }

  /**
   * List artifacts for a benchmark run with optional type filter
   *
   * GET /api/benchmark/projects/:projectId/runs/:runId/artifacts
   * Query params: type (optional) - filter by BenchmarkArtifactType
   */
  @Get("runs/:runId/artifacts")
  async listArtifacts(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Query("type") type?: BenchmarkArtifactType,
  ): Promise<ArtifactListResponseDto> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/runs/${runId}/artifacts${type ? `?type=${type}` : ""}`,
    );
    return this.benchmarkArtifactService.listArtifacts(projectId, runId, type);
  }
}
