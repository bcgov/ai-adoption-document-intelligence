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
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConflictResponse,
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
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { CreateProjectDto, ProjectDetailsDto, ProjectSummaryDto } from "./dto";

@ApiTags("Benchmark - Projects")
@Controller("api/benchmark/projects")
export class BenchmarkProjectController {
  private readonly logger = new Logger(BenchmarkProjectController.name);

  constructor(
    private readonly benchmarkProjectService: BenchmarkProjectService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Create a benchmark project" })
  @ApiBody({ type: CreateProjectDto })
  @ApiCreatedResponse({
    description: "Project created successfully",
    type: ProjectDetailsDto,
  })
  @ApiConflictResponse({
    description: "A project with this name already exists",
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async createProject(
    @Body() createProjectDto: CreateProjectDto,
    @Req() req: Request,
  ): Promise<ProjectDetailsDto> {
    this.logger.log(
      `POST /api/benchmark/projects - name: ${createProjectDto.name}`,
    );

    const actorId = req.resolvedIdentity.actorId;

    identityCanAccessGroup(req.resolvedIdentity, createProjectDto.groupId);

    return this.benchmarkProjectService.createProject(
      createProjectDto,
      actorId,
    );
  }

  @Get()
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "List benchmark projects" })
  @ApiQuery({
    name: "groupId",
    required: false,
    description: "Optional group ID to filter projects",
  })
  @ApiOkResponse({
    description: "List of benchmark projects",
    type: [ProjectSummaryDto],
  })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async listProjects(
    @Query("groupId") groupId: string | undefined,
    @Req() req: Request,
  ): Promise<ProjectSummaryDto[]> {
    this.logger.log("GET /api/benchmark/projects");

    if (groupId) {
      identityCanAccessGroup(req.resolvedIdentity, groupId);
      return this.benchmarkProjectService.listProjects([groupId]);
    }

    const groupIds = getIdentityGroupIds(req.resolvedIdentity);

    if (groupIds.length === 0) {
      return [];
    }

    return this.benchmarkProjectService.listProjects(groupIds);
  }

  @Get(":id")
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get project details by ID" })
  @ApiParam({ name: "id", description: "Project ID (UUID)" })
  @ApiOkResponse({
    description: "Project details",
    type: ProjectDetailsDto,
  })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getProjectById(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<ProjectDetailsDto> {
    this.logger.log(`GET /api/benchmark/projects/${id}`);

    const project = await this.benchmarkProjectService.getProjectById(id);

    identityCanAccessGroup(req.resolvedIdentity, project.groupId);

    return project;
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete a benchmark project" })
  @ApiParam({ name: "id", description: "Project ID (UUID)" })
  @ApiNoContentResponse({ description: "Project deleted successfully" })
  @ApiNotFoundResponse({ description: "Project not found" })
  @ApiConflictResponse({ description: "Project has active runs" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteProject(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<void> {
    this.logger.log(`DELETE /api/benchmark/projects/${id}`);

    const project = await this.benchmarkProjectService.getProjectById(id);

    identityCanAccessGroup(req.resolvedIdentity, project.groupId);

    return this.benchmarkProjectService.deleteProject(id);
  }
}
