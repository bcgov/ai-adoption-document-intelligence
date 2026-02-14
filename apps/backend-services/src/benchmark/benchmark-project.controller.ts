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
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
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
  async createProject(
    @Body() createProjectDto: CreateProjectDto,
  ): Promise<ProjectDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects - name: ${createProjectDto.name}`,
    );

    try {
      return await this.benchmarkProjectService.createProject(createProjectDto);
    } catch (error) {
      if (error.message?.includes("Failed to create MLflow experiment")) {
        throw new ServiceUnavailableException(
          "MLflow service is unavailable. Please try again later.",
        );
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
  async getProjectById(@Param("id") id: string): Promise<ProjectDetailsDto> {
    this.logger.log(`GET /api/benchmark/projects/${id}`);
    return this.benchmarkProjectService.getProjectById(id);
  }
}
