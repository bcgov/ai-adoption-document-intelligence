/**
 * Benchmark Definition Controller
 *
 * REST API endpoints for managing benchmark definitions.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 11.2
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import {
  CreateDefinitionDto,
  UpdateDefinitionDto,
  DefinitionSummaryDto,
  DefinitionDetailsDto,
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
  async listDefinitions(
    @Param("projectId") projectId: string,
  ): Promise<DefinitionSummaryDto[]> {
    this.logger.log(
      `GET /api/benchmark/projects/${projectId}/definitions`,
    );
    return this.benchmarkDefinitionService.listDefinitions(projectId);
  }

  /**
   * Get definition details by ID
   *
   * GET /api/benchmark/projects/:projectId/definitions/:definitionId
   */
  @Get(":definitionId")
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
}
