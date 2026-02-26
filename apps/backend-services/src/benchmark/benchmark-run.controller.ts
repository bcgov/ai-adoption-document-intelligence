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
  Header,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { Response } from "express";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import { BenchmarkArtifactService } from "./benchmark-artifact.service";
import { BenchmarkRunService } from "./benchmark-run.service";
import {
  ArtifactListResponseDto,
  CreateRunDto,
  DrillDownResponseDto,
  PerSampleResultsResponseDto,
  PromoteBaselineDto,
  PromoteBaselineResponseDto,
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
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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
   * Get per-sample results with filtering and pagination
   *
   * GET /api/benchmark/projects/:projectId/runs/:runId/samples
   * Query params:
   *   - page: Page number (default: 1)
   *   - limit: Items per page (default: 20)
   *   - Any metadata dimension key (e.g., docType=invoice, language=en)
   */
  @Get("runs/:runId/samples")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async getPerSampleResults(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Query() query: Record<string, string>,
  ): Promise<PerSampleResultsResponseDto> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/runs/${runId}/samples`,
    );

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

  /**
   * List artifacts for a benchmark run with optional type filter
   *
   * GET /api/benchmark/projects/:projectId/runs/:runId/artifacts
   * Query params: type (optional) - filter by BenchmarkArtifactType
   */
  @Get("runs/:runId/artifacts")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
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

  /**
   * Get artifact content for viewing/downloading
   *
   * GET /api/benchmark/projects/:projectId/runs/:runId/artifacts/:artifactId/content
   */
  @Get("runs/:runId/artifacts/:artifactId/content")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async getArtifactContent(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Param("artifactId") artifactId: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/runs/${runId}/artifacts/${artifactId}/content`,
    );

    const content = await this.benchmarkArtifactService.getArtifactContent(
      projectId,
      runId,
      artifactId,
    );

    // Get artifact metadata to set proper content type
    const artifacts = await this.benchmarkArtifactService.listArtifacts(
      projectId,
      runId,
    );
    const artifact = artifacts.artifacts.find((a) => a.id === artifactId);

    if (artifact) {
      res.setHeader("Content-Type", artifact.mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${artifact.path.split("/").pop()}"`,
      );
    }

    res.send(content);
  }

  /**
   * Promote a run to baseline
   *
   * POST /api/benchmark/projects/:projectId/runs/:runId/baseline
   */
  @Post("runs/:runId/baseline")
  @HttpCode(HttpStatus.OK)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async promoteToBaseline(
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Body() promoteBaselineDto: PromoteBaselineDto,
  ): Promise<PromoteBaselineResponseDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/runs/${runId}/baseline`,
    );
    return this.benchmarkRunService.promoteToBaseline(
      projectId,
      runId,
      promoteBaselineDto,
    );
  }
}
