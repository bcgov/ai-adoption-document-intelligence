import { getErrorStack } from "@ai-di/shared-logging";
/**
 * Benchmark Project Service
 *
 * Manages benchmark projects - logical groups of benchmark experiments.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-010-benchmark-project-service-controller.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 2.4, 6.2, 11.2
 */

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  BenchmarkProjectDbService,
  BenchmarkProjectWithDetails,
} from "./benchmark-project-db.service";
import {
  CreateProjectDto,
  DefinitionSummary,
  ProjectDetailsDto,
  ProjectSummaryDto,
  RecentRunSummary,
} from "./dto";

@Injectable()
export class BenchmarkProjectService {
  private readonly logger = new Logger(BenchmarkProjectService.name);

  constructor(private readonly projectDbService: BenchmarkProjectDbService) {}

  /**
   * Create a benchmark project
   */
  async createProject(
    dto: CreateProjectDto,
    actorId: string,
  ): Promise<ProjectDetailsDto> {
    this.logger.log(`Creating benchmark project: ${dto.name}`);

    try {
      const project = await this.projectDbService.createBenchmarkProject({
        name: dto.name,
        description: dto.description || null,
        createdBy: actorId,
        group_id: dto.groupId,
      });

      this.logger.log(`Created benchmark project: ${project.id}`);

      return this.mapToProjectDetails(project);
    } catch (error) {
      if ((error as { code?: string })?.code === "P2002") {
        throw new ConflictException(
          `A project with the name "${dto.name}" already exists. Please choose a different name.`,
        );
      }
      this.logger.error(
        `Failed to create project in database: ${dto.name}`,
        (getErrorStack(error)),
      );
      throw error;
    }
  }

  /**
   * List all benchmark projects
   */
  async listProjects(groupIds: string[]): Promise<ProjectSummaryDto[]> {
    const projects =
      await this.projectDbService.findAllBenchmarkProjects(groupIds);

    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      createdBy: project.createdBy,
      groupId: project.group_id,
      definitionCount: project._count.benchmarkDefinitions,
      runCount: project._count.benchmarkRuns,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));
  }

  /**
   * Get project details by ID
   */
  async getProjectById(id: string): Promise<ProjectDetailsDto> {
    const project = await this.projectDbService.findBenchmarkProject(id);

    if (!project) {
      throw new NotFoundException(
        `Benchmark project with ID "${id}" not found`,
      );
    }

    return this.mapToProjectDetails(project);
  }

  /**
   * Delete a benchmark project.
   *
   * Checks for active/running benchmark runs before allowing deletion.
   * Cascade-deletes all definitions and runs in Postgres.
   */
  async deleteProject(id: string): Promise<void> {
    const project =
      await this.projectDbService.findBenchmarkProjectForDeletion(id);

    if (!project) {
      throw new NotFoundException(
        `Benchmark project with ID "${id}" not found`,
      );
    }

    if (project.benchmarkRuns.length > 0) {
      throw new ConflictException(
        `Cannot delete project "${project.name}": it has ${project.benchmarkRuns.length} active run(s). Cancel them first.`,
      );
    }

    // Cascade-delete project (definitions + runs are cascade-deleted by Prisma)
    await this.projectDbService.deleteBenchmarkProject(id);

    this.logger.log(`Deleted benchmark project: ${id} (${project.name})`);
  }

  /**
   * Map Prisma result to ProjectDetailsDto
   */
  private mapToProjectDetails(
    project: BenchmarkProjectWithDetails,
  ): ProjectDetailsDto {
    const definitions: DefinitionSummary[] = project.benchmarkDefinitions.map(
      (def) => ({
        id: def.id,
        name: def.name,
        datasetVersionId: def.datasetVersionId,
        evaluatorType: def.evaluatorType,
        immutable: def.immutable,
        createdAt: def.createdAt,
      }),
    );

    const recentRuns: RecentRunSummary[] = project.benchmarkRuns.map((run) => ({
      id: run.id,
      definitionName: run.definition.name,
      status: run.status,
      temporalWorkflowId: run.temporalWorkflowId,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    }));

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      createdBy: project.createdBy,
      groupId: project.group_id,
      definitions,
      recentRuns,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
}
