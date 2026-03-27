/**
 * Benchmark Definition Controller
 *
 * REST API endpoints for managing benchmark definitions.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 11.2
 */

import { AuditAction } from "@generated/client";
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
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { AuditLogService } from "./audit-log.service";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { BenchmarkProjectService } from "./benchmark-project.service";
import {
  BaselinePromotionHistoryDto,
  CreateDefinitionDto,
  DefinitionDetailsDto,
  DefinitionSummaryDto,
  PromoteCandidateWorkflowDto,
  ScheduleConfigDto,
  ScheduleInfoDto,
  UpdateDefinitionDto,
} from "./dto";

@ApiTags("Benchmark - Definitions")
@Controller("api/benchmark/projects/:projectId/definitions")
export class BenchmarkDefinitionController {
  private readonly logger = new Logger(BenchmarkDefinitionController.name);

  constructor(
    private readonly benchmarkDefinitionService: BenchmarkDefinitionService,
    private readonly benchmarkProjectService: BenchmarkProjectService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async assertProjectGroupAccess(
    projectId: string,
    req: Request,
  ): Promise<void> {
    const project =
      await this.benchmarkProjectService.getProjectById(projectId);
    identityCanAccessGroup(req.resolvedIdentity, project.groupId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Create a benchmark definition" })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiBody({ type: CreateDefinitionDto })
  @ApiCreatedResponse({
    description: "Definition created successfully",
    type: DefinitionDetailsDto,
  })
  @ApiBadRequestResponse({
    description: "Invalid referenced entity or evaluator type",
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async createDefinition(
    @Param("projectId") projectId: string,
    @Body() createDefinitionDto: CreateDefinitionDto,
    @Req() req: Request,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/definitions - name: ${createDefinitionDto.name}`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkDefinitionService.createDefinition(
      projectId,
      createDefinitionDto,
    );
  }

  @Get()
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "List all definitions for a project" })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiOkResponse({
    description: "List of benchmark definitions",
    type: [DefinitionSummaryDto],
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async listDefinitions(
    @Param("projectId") projectId: string,
    @Req() req: Request,
  ): Promise<DefinitionSummaryDto[]> {
    this.logger.log(`GET /api/benchmark/projects/${projectId}/definitions`);
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkDefinitionService.listDefinitions(projectId);
  }

  @Get(":definitionId")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get definition details by ID" })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "definitionId", description: "Benchmark definition ID" })
  @ApiOkResponse({
    description: "Definition details with run history and baseline info",
    type: DefinitionDetailsDto,
  })
  @ApiNotFoundResponse({ description: "Definition not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getDefinitionById(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Req() req: Request,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/definitions/${definitionId}`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkDefinitionService.getDefinitionById(
      projectId,
      definitionId,
    );
  }

  @Put(":definitionId")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Update a benchmark definition",
    description:
      "Updates a definition in place if it has no runs. Creates a new revision if it has runs (immutable).",
  })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "definitionId", description: "Benchmark definition ID" })
  @ApiBody({ type: UpdateDefinitionDto })
  @ApiOkResponse({
    description: "Definition updated (or new revision created)",
    type: DefinitionDetailsDto,
  })
  @ApiBadRequestResponse({ description: "Invalid referenced entity" })
  @ApiNotFoundResponse({ description: "Definition not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async updateDefinition(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Body() updateDefinitionDto: UpdateDefinitionDto,
    @Req() req: Request,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `PUT /api/benchmark/projects/${projectId}/definitions/${definitionId}`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkDefinitionService.updateDefinition(
      projectId,
      definitionId,
      updateDefinitionDto,
    );
  }

  @Post(":definitionId/schedule")
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Configure schedule for a benchmark definition",
    description:
      "Creates or updates a Temporal schedule for automatic benchmark runs. Disabling deletes the existing schedule.",
  })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "definitionId", description: "Benchmark definition ID" })
  @ApiBody({ type: ScheduleConfigDto })
  @ApiOkResponse({
    description: "Schedule configured, returns updated definition",
    type: DefinitionDetailsDto,
  })
  @ApiBadRequestResponse({
    description: "Cron expression required when enabling",
  })
  @ApiNotFoundResponse({ description: "Definition not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async configureSchedule(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Body() scheduleConfigDto: ScheduleConfigDto,
    @Req() req: Request,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/definitions/${definitionId}/schedule`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkDefinitionService.configureSchedule(
      projectId,
      definitionId,
      scheduleConfigDto,
    );
  }

  @Get(":definitionId/schedule")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get schedule information for a definition" })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "definitionId", description: "Benchmark definition ID" })
  @ApiOkResponse({
    description: "Schedule info or null if no schedule configured",
    type: ScheduleInfoDto,
  })
  @ApiNotFoundResponse({ description: "Definition not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getScheduleInfo(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Req() req: Request,
  ): Promise<ScheduleInfoDto | null> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/definitions/${definitionId}/schedule`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkDefinitionService.getScheduleInfo(
      projectId,
      definitionId,
    );
  }

  @Post(":definitionId/promote-candidate-workflow")
  @HttpCode(HttpStatus.OK)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Apply a benchmark candidate workflow graph to the base workflow",
  })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "definitionId", description: "Benchmark definition ID" })
  @ApiBody({ type: PromoteCandidateWorkflowDto })
  @ApiOkResponse({
    description: "Definition updated and pinned workflow hash resynced",
    type: DefinitionDetailsDto,
  })
  @ApiBadRequestResponse({ description: "Invalid candidate workflow" })
  @ApiNotFoundResponse({ description: "Definition not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async promoteCandidateWorkflow(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Body() body: PromoteCandidateWorkflowDto,
    @Req() req: Request,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects/${projectId}/definitions/${definitionId}/promote-candidate-workflow`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkDefinitionService.promoteCandidateWorkflow(
      projectId,
      definitionId,
      body.candidateWorkflowVersionId,
    );
  }

  @Get(":definitionId/baseline-history")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get baseline promotion history for a definition" })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "definitionId", description: "Benchmark definition ID" })
  @ApiOkResponse({
    description: "Baseline promotion history",
    type: [BaselinePromotionHistoryDto],
  })
  @ApiNotFoundResponse({ description: "Definition not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getBaselineHistory(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Req() req: Request,
  ): Promise<BaselinePromotionHistoryDto[]> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/definitions/${definitionId}/baseline-history`,
    );
    await this.assertProjectGroupAccess(projectId, req);

    // Query audit logs for baseline_promoted events
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
          actorId: log.actor_id,
          definitionId: metadata?.definitionId as string | undefined,
          projectId: metadata?.projectId as string | undefined,
        };
      });

    return history;
  }

  @Delete(":definitionId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Delete a benchmark definition",
    description:
      "Cascade-deletes completed/failed runs. Rejects if there are active runs.",
  })
  @ApiParam({ name: "projectId", description: "Benchmark project ID" })
  @ApiParam({ name: "definitionId", description: "Benchmark definition ID" })
  @ApiNoContentResponse({ description: "Definition deleted successfully" })
  @ApiBadRequestResponse({ description: "Definition has active runs" })
  @ApiNotFoundResponse({ description: "Definition not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteDefinition(
    @Param("projectId") projectId: string,
    @Param("definitionId") definitionId: string,
    @Req() req: Request,
  ): Promise<void> {
    this.logger.log(
      `DELETE /api/benchmark/projects/${projectId}/definitions/${definitionId}`,
    );
    await this.assertProjectGroupAccess(projectId, req);
    return this.benchmarkDefinitionService.deleteDefinition(
      projectId,
      definitionId,
    );
  }
}
