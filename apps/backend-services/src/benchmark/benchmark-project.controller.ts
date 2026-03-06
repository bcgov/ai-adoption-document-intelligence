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
  Query,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { DatabaseService } from "@/database/database.service";
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
    private readonly databaseService: DatabaseService,
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
    @Req() req: Request,
  ): Promise<ProjectDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects - name: ${createProjectDto.name}`,
    );

    const userId =
      req.user?.sub || req.resolvedIdentity?.userId || "anonymous";

    await identityCanAccessGroup(
      req.resolvedIdentity,
      createProjectDto.groupId,
      this.databaseService,
    );

    try {
      return await this.benchmarkProjectService.createProject(createProjectDto, userId);
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
  async listProjects(
    @Query("groupId") groupId: string | undefined,
    @Req() req: Request,
  ): Promise<ProjectSummaryDto[]> {
    this.logger.log("GET /api/benchmark/projects");

    if (groupId) {
      await identityCanAccessGroup(
        req.resolvedIdentity,
        groupId,
        this.databaseService,
      );
      return this.benchmarkProjectService.listProjects([groupId]);
    }

    const groupIds = await getIdentityGroupIds(
      req.resolvedIdentity,
      this.databaseService,
    );

    if (groupIds.length === 0) {
      return [];
    }

    return this.benchmarkProjectService.listProjects(groupIds);
  }

  /**
   * Get project details by ID
   *
   * GET /api/benchmark/projects/:id
   */
  @Get(":id")
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  async getProjectById(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<ProjectDetailsDto> {
    this.logger.log(`GET /api/benchmark/projects/${id}`);

    const project = await this.benchmarkProjectService.getProjectById(id);

    await identityCanAccessGroup(
      req.resolvedIdentity,
      project.groupId,
      this.databaseService,
    );

    return project;
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
  async deleteProject(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<void> {
    this.logger.log(`DELETE /api/benchmark/projects/${id}`);

    const project = await this.benchmarkProjectService.getProjectById(id);

    await identityCanAccessGroup(
      req.resolvedIdentity,
      project.groupId,
      this.databaseService,
    );

    return this.benchmarkProjectService.deleteProject(id);
  }
}
