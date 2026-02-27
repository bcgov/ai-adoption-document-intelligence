/**
 * Benchmark Definition Controller
 *
 * REST API endpoints for managing benchmark definitions.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
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
  Param,
  Post,
  Put,
} from "@nestjs/common";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { AuditLogService } from "./audit-log.service";
import {
  BaselinePromotionHistoryDto,
  CreateDefinitionDto,
  DefinitionDetailsDto,
  DefinitionSummaryDto,
  ScheduleConfigDto,
  ScheduleInfoDto,
  UpdateDefinitionDto,
} from "./dto";
import { AuditAction } from "@generated/client";

@Controller("api/benchmark/projects/:projectId/definitions")
export class BenchmarkDefinitionController {
  private readonly logger = new Logger(BenchmarkDefinitionController.name);

  constructor(
    private readonly benchmarkDefinitionService: BenchmarkDefinitionService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Create a benchmark definition
   *
   * POST /api/benchmark/projects/:projectId/definitions
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async createDefinition(
    @Param("projectId") projectId: string,
    @Body() createDefinitionDto: CreateDefinitionDto,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/definitions - name: ${createDefinitionDto.name}`,
    );
    return this.benchmarkDefinitionService.createDefinition(
      projectId,
      createDefinitionDto,
    );
  }

  /**
   * List all definitions for a project
   *
   * GET /api/benchmark/projects/:projectId/definitions
   */
  @Get()
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async listDefinitions(
    @Param("projectId") projectId: string,
  ): Promise<DefinitionSummaryDto[]> {
    this.logger.log(`GET /api/benchmark/projects/${projectId}/definitions`);
    return this.benchmarkDefinitionService.listDefinitions(projectId);
  }

  /**
   * Get definition details by ID
   *
   * GET /api/benchmark/projects/:projectId/definitions/:definitionId
   */
  @Get(":definitionId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async getDefinitionById(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/definitions/${definitionId}`,
    );
    return this.benchmarkDefinitionService.getDefinitionById(
      projectId,
      definitionId,
    );
  }

  /**
   * Update a benchmark definition
   *
   * PUT /api/benchmark/projects/:projectId/definitions/:definitionId
   */
  @Put(":definitionId")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async updateDefinition(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Body() updateDefinitionDto: UpdateDefinitionDto,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `PUT /api/benchmark/projects/${projectId}/definitions/${definitionId}`,
    );
    return this.benchmarkDefinitionService.updateDefinition(
      projectId,
      definitionId,
      updateDefinitionDto,
    );
  }

  /**
   * Configure schedule for a benchmark definition
   *
   * POST /api/benchmark/projects/:projectId/definitions/:definitionId/schedule
   */
  @Post(":definitionId/schedule")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async configureSchedule(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Body() scheduleConfigDto: ScheduleConfigDto,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/definitions/${definitionId}/schedule`,
    );
    return this.benchmarkDefinitionService.configureSchedule(
      projectId,
      definitionId,
      scheduleConfigDto,
    );
  }

  /**
   * Get schedule information for a definition
   *
   * GET /api/benchmark/projects/:projectId/definitions/:definitionId/schedule
   */
  @Get(":definitionId/schedule")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async getScheduleInfo(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
  ): Promise<ScheduleInfoDto | null> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/definitions/${definitionId}/schedule`,
    );
    return this.benchmarkDefinitionService.getScheduleInfo(
      projectId,
      definitionId,
    );
  }

  /**
   * Get baseline promotion history for a definition
   *
   * GET /api/benchmark/projects/:projectId/definitions/:definitionId/baseline-history
   */
  @Get(":definitionId/baseline-history")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async getBaselineHistory(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
  ): Promise<BaselinePromotionHistoryDto[]> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/definitions/${definitionId}/baseline-history`,
    );

    // Query audit logs for baseline_promoted events
    // Note: audit logs track by run ID (entityId), but we need to filter by definition
    // We'll query all baseline_promoted events and filter by metadata
    const auditLogs = await this.auditLogService.queryAuditLogs({
      action: AuditAction.baseline_promoted,
      entityType: "BenchmarkRun",
      limit: 100,
    });

    // Filter by definition ID from metadata and map to response DTO
    const history = auditLogs
      .filter((log) => {
        const metadata = log.metadata as Record<string, unknown> | null;
        return metadata && metadata.definitionId === definitionId;
      })
      .map((log) => {
        const metadata = log.metadata as Record<string, unknown> | null;
        return {
          promotedAt: log.timestamp,
          runId: log.entityId,
          userId: log.userId,
          definitionId: metadata?.definitionId as string | undefined,
          projectId: metadata?.projectId as string | undefined,
        };
      });

    return history;
  }

  /**
   * Delete a benchmark definition
   *
   * Cascade-deletes completed/failed runs. Rejects if there are active runs.
   *
   * DELETE /api/benchmark/projects/:projectId/definitions/:definitionId
   */
  @Delete(":definitionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async deleteDefinition(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
  ): Promise<void> {
    this.logger.log(
      `DELETE /api/benchmark/projects/${projectId}/definitions/${definitionId}`,
    );
    return this.benchmarkDefinitionService.deleteDefinition(
      projectId,
      definitionId,
    );
  }
}
