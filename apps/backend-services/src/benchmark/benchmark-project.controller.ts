/**
 * Benchmark Project Controller
 *
 * REST API endpoints for managing benchmark projects.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-010-benchmark-project-service-controller.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 11.2
 */

import {
  Body,
  Controller,
  ConflictException,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { CreateProjectDto, ProjectDetailsDto, ProjectSummaryDto } from "./dto";

@Controller("api/benchmark/projects")
export class BenchmarkProjectController {
  private readonly logger = new Logger(BenchmarkProjectController.name);

  constructor(
    private readonly benchmarkProjectService: BenchmarkProjectService,
  ) {}

  /**
   * Create a benchmark project
   *
   * POST /api/benchmark/projects
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async createProject(
    @Body() createProjectDto: CreateProjectDto,
  ): Promise<ProjectDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects - name: ${createProjectDto.name}`,
    );

    try {
      return await this.benchmarkProjectService.createProject(createProjectDto);
    } catch (error) {
      // Let NestJS HttpExceptions (ConflictException, etc.) pass through as-is
      if (error instanceof HttpException) {
        throw error;
      }
      throw error;
    }
  }

  /**
   * List all benchmark projects
   *
   * GET /api/benchmark/projects
   */
  @Get()
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async listProjects(): Promise<ProjectSummaryDto[]> {
    this.logger.log("GET /api/benchmark/projects");
    return this.benchmarkProjectService.listProjects();
  }

  /**
   * Get project details by ID
   *
   * GET /api/benchmark/projects/:id
   */
  @Get(":id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async getProjectById(@Param("id") id: string): Promise<ProjectDetailsDto> {
    this.logger.log(`GET /api/benchmark/projects/${id}`);
    return this.benchmarkProjectService.getProjectById(id);
  }

  /**
   * Delete a benchmark project
   *
   * DELETE /api/benchmark/projects/:id
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async deleteProject(@Param("id") id: string): Promise<void> {
    this.logger.log(`DELETE /api/benchmark/projects/${id}`);
    return this.benchmarkProjectService.deleteProject(id);
  }
}
