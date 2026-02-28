/**
 * Benchmark Project Service
 *
 * Manages benchmark projects - logical groups of benchmark experiments.
 * Each project is mapped to an MLflow experiment for tracking.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-010-benchmark-project-service-controller.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 2.4, 6.2, 11.2
 */

import { PrismaClient } from "@generated/client";
import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaPgOptions } from "@/utils/database-url";
import {
  CreateProjectDto,
  DefinitionSummary,
  ProjectDetailsDto,
  ProjectSummaryDto,
  RecentRunSummary,
} from "./dto";
import { MLflowClientService } from "./mlflow-client.service";

@Injectable()
export class BenchmarkProjectService {
  private readonly logger = new Logger(BenchmarkProjectService.name);
  private prisma: PrismaClient;

  constructor(
    private configService: ConfigService,
    private readonly mlflowClient: MLflowClientService,
  ) {
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );
    this.prisma = new PrismaClient({
      adapter: new PrismaPg(dbOptions),
    });
  }

  /**
   * Create a benchmark project
   *
   * Creates a project record in Postgres and a corresponding MLflow experiment.
   * If MLflow experiment creation fails, the transaction is rolled back.
   */
  async createProject(dto: CreateProjectDto): Promise<ProjectDetailsDto> {
    this.logger.log(`Creating benchmark project: ${dto.name}`);

    // Create MLflow experiment first
    let mlflowExperimentId: string;
    try {
      mlflowExperimentId = await this.mlflowClient.createExperiment(dto.name);
    } catch (error) {
      this.logger.error(
        `Failed to create MLflow experiment for project: ${dto.name}`,
        error.stack,
      );
      if (error.message?.includes("RESOURCE_ALREADY_EXISTS") || error.message?.includes("already exists")) {
        throw new ConflictException(
          `A project with the name "${dto.name}" already exists in MLflow. Please choose a different name.`,
        );
      }
      throw new Error(`Failed to create MLflow experiment: ${error.message}`);
    }

    // Create project in Postgres
    try {
      const project = await this.prisma.benchmarkProject.create({
        data: {
          name: dto.name,
          description: dto.description || null,
          mlflowExperimentId,
          createdBy: dto.createdBy,
        },
        include: {
          benchmarkDefinitions: {
            select: {
              id: true,
              name: true,
              datasetVersionId: true,
              evaluatorType: true,
              immutable: true,
              createdAt: true,
            },
          },
          benchmarkRuns: {
            select: {
              id: true,
              status: true,
              mlflowRunId: true,
              temporalWorkflowId: true,
              startedAt: true,
              completedAt: true,
              definition: {
                select: {
                  name: true,
                },
              },
            },
            orderBy: {
              startedAt: "desc",
            },
            take: 10,
          },
        },
      });

      this.logger.log(
        `Created benchmark project: ${project.id} (MLflow experiment: ${mlflowExperimentId})`,
      );

      return this.mapToProjectDetails(project);
    } catch (error) {
      this.logger.error(
        `Failed to create project in database: ${dto.name}`,
        error.stack,
      );
      // TODO: Consider cleaning up orphaned MLflow experiment
      throw error;
    }
  }

  /**
   * List all benchmark projects
   */
  async listProjects(): Promise<ProjectSummaryDto[]> {
    const projects = await this.prisma.benchmarkProject.findMany({
      include: {
        _count: {
          select: {
            benchmarkDefinitions: true,
            benchmarkRuns: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      mlflowExperimentId: project.mlflowExperimentId,
      createdBy: project.createdBy,
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
    const project = await this.prisma.benchmarkProject.findUnique({
      where: { id },
      include: {
        benchmarkDefinitions: {
          select: {
            id: true,
            name: true,
            datasetVersionId: true,
            evaluatorType: true,
            immutable: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        },
        benchmarkRuns: {
          select: {
            id: true,
            status: true,
            mlflowRunId: true,
            temporalWorkflowId: true,
            startedAt: true,
            completedAt: true,
            definition: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            startedAt: "desc",
          },
          take: 10,
        },
      },
    });

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
   * Deletes the corresponding MLflow experiment and cascade-deletes
   * all definitions and runs in Postgres.
   */
  async deleteProject(id: string): Promise<void> {
    const project = await this.prisma.benchmarkProject.findUnique({
      where: { id },
      include: {
        benchmarkRuns: {
          where: {
            status: { in: ["pending", "running"] },
          },
          select: { id: true, status: true },
        },
      },
    });

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

    // Delete MLflow experiment (best-effort; don't block DB deletion)
    try {
      await this.mlflowClient.deleteExperiment(project.mlflowExperimentId);
    } catch (error) {
      this.logger.warn(
        `Failed to delete MLflow experiment ${project.mlflowExperimentId} for project ${id}: ${error.message}`,
      );
    }

    // Cascade-delete project (definitions + runs are cascade-deleted by Prisma)
    await this.prisma.benchmarkProject.delete({
      where: { id },
    });

    this.logger.log(`Deleted benchmark project: ${id} (${project.name})`);
  }

  /**
   * Map Prisma result to ProjectDetailsDto
   */
  private mapToProjectDetails(project: {
    id: string;
    name: string;
    description: string | null;
    mlflowExperimentId: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    benchmarkDefinitions: Array<{
      id: string;
      name: string;
      datasetVersionId: string;
      evaluatorType: string;
      immutable: boolean;
      createdAt: Date;
    }>;
    benchmarkRuns: Array<{
      id: string;
      status: string;
      mlflowRunId: string | null;
      temporalWorkflowId: string | null;
      startedAt: Date | null;
      completedAt: Date | null;
      definition: {
        name: string;
      };
    }>;
  }): ProjectDetailsDto {
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
      mlflowRunId: run.mlflowRunId,
      temporalWorkflowId: run.temporalWorkflowId,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    }));

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      mlflowExperimentId: project.mlflowExperimentId,
      createdBy: project.createdBy,
      definitions,
      recentRuns,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }
}
