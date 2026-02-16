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
import {
  CreateDefinitionDto,
  DefinitionDetailsDto,
  DefinitionSummaryDto,
  ScheduleConfigDto,
  ScheduleInfoDto,
  UpdateDefinitionDto,
} from "./dto";

@Controller("api/benchmark/projects/:projectId/definitions")
export class BenchmarkDefinitionController {
  private readonly logger = new Logger(BenchmarkDefinitionController.name);

  constructor(
    private readonly benchmarkDefinitionService: BenchmarkDefinitionService,
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
}
