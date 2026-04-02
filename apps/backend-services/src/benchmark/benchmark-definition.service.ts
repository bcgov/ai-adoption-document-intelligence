/**
 * Benchmark Definition Service
 *
 * Manages benchmark definitions - specifications for reproducible benchmark experiments.
 * Each definition pins a dataset version, split, workflow config hash, and evaluator config.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 2.5, 7.4, 11.2
 */

import { Prisma } from "@generated/client";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/database/prisma.service";
import { computeConfigHash } from "@/workflow/config-hash";
import { validateGraphConfig } from "@/workflow/graph-schema-validator";
import type { GraphWorkflowConfig } from "@/workflow/graph-workflow-types";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import {
  BaselineRunSummary,
  CreateDefinitionDto,
  DatasetVersionInfo,
  DefinitionDetailsDto,
  DefinitionSummaryDto,
  MetricThreshold,
  RunHistorySummary,
  ScheduleConfigDto,
  ScheduleInfoDto,
  SplitInfo,
  UpdateDefinitionDto,
  WorkflowInfo,
} from "./dto";
import { EvaluatorRegistryService } from "./evaluator-registry.service";

@Injectable()
export class BenchmarkDefinitionService {
  private readonly logger = new Logger(BenchmarkDefinitionService.name);
  private readonly prisma;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly evaluatorRegistry: EvaluatorRegistryService,
    private readonly temporalService: BenchmarkTemporalService,
  ) {
    this.prisma = this.prismaService.prisma;
  }

  /**
   * Create a benchmark definition
   *
   * Validates all referenced entities (dataset version, split, workflow, evaluator type)
   * and captures the current workflow config hash at creation time.
   */
  async createDefinition(
    projectId: string,
    dto: CreateDefinitionDto,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `Creating benchmark definition: ${dto.name} for project ${projectId}`,
    );

    // Validate that the project exists
    const project = await this.prisma.benchmarkProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException(
        `Benchmark project with ID "${projectId}" not found`,
      );
    }

    // Validate that the dataset version exists
    const datasetVersion = await this.prisma.datasetVersion.findUnique({
      where: { id: dto.datasetVersionId },
      include: {
        dataset: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!datasetVersion) {
      throw new BadRequestException(
        `Dataset version with ID "${dto.datasetVersionId}" does not exist`,
      );
    }

    // Validate that the split exists and belongs to the dataset version (when provided)
    if (dto.splitId) {
      const split = await this.prisma.split.findUnique({
        where: { id: dto.splitId },
      });

      if (!split) {
        throw new BadRequestException(
          `Split with ID "${dto.splitId}" does not exist`,
        );
      }

      if (split.datasetVersionId !== dto.datasetVersionId) {
        throw new BadRequestException(
          `Split "${dto.splitId}" does not belong to dataset version "${dto.datasetVersionId}"`,
        );
      }
    }

    // Validate that the workflow version exists
    const workflowVersion = await this.prisma.workflowVersion.findUnique({
      where: { id: dto.workflowVersionId },
      include: { lineage: true },
    });

    if (!workflowVersion) {
      throw new BadRequestException(
        `Workflow version with ID "${dto.workflowVersionId}" does not exist`,
      );
    }

    // Validate that the evaluator type is registered
    if (!this.evaluatorRegistry.hasEvaluator(dto.evaluatorType)) {
      throw new BadRequestException(
        `Evaluator type "${dto.evaluatorType}" is not registered. Available types: ${this.evaluatorRegistry.getAvailableTypes().join(", ")}`,
      );
    }

    // Compute workflow config hash
    const workflowConfigHash = computeConfigHash(
      workflowVersion.config as GraphWorkflowConfig,
    );

    // Create the definition
    const definition = await this.prisma.benchmarkDefinition.create({
      data: {
        projectId,
        name: dto.name,
        datasetVersionId: dto.datasetVersionId,
        splitId: dto.splitId || null,
        workflowVersionId: dto.workflowVersionId,
        workflowConfigHash,
        evaluatorType: dto.evaluatorType,
        evaluatorConfig: dto.evaluatorConfig as Prisma.InputJsonValue,
        runtimeSettings: dto.runtimeSettings as Prisma.InputJsonValue,
        immutable: false,
        revision: 1,
      },
      include: {
        datasetVersion: {
          include: {
            dataset: {
              select: {
                name: true,
              },
            },
          },
        },
        split: true,
        workflowVersion: { include: { lineage: true } },
        benchmarkRuns: {
          select: {
            id: true,
            status: true,

            startedAt: true,
            completedAt: true,
          },
          orderBy: {
            startedAt: "desc",
          },
        },
      },
    });

    this.logger.log(
      `Created benchmark definition: ${definition.id} (workflowConfigHash: ${workflowConfigHash})`,
    );

    return this.mapToDefinitionDetails(definition);
  }

  /**
   * List all definitions for a project
   */
  async listDefinitions(projectId: string): Promise<DefinitionSummaryDto[]> {
    // Verify project exists
    const project = await this.prisma.benchmarkProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException(
        `Benchmark project with ID "${projectId}" not found`,
      );
    }

    const definitions = await this.prisma.benchmarkDefinition.findMany({
      where: { projectId },
      include: {
        datasetVersion: {
          include: {
            dataset: {
              select: {
                name: true,
              },
            },
          },
        },
        workflowVersion: { include: { lineage: true } },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return definitions.map((def) => this.mapToDefinitionSummary(def));
  }

  /**
   * Get definition details by ID
   */
  async getDefinitionById(
    projectId: string,
    definitionId: string,
  ): Promise<DefinitionDetailsDto> {
    const definition = await this.prisma.benchmarkDefinition.findFirst({
      where: {
        id: definitionId,
        projectId,
      },
      include: {
        datasetVersion: {
          include: {
            dataset: {
              select: {
                name: true,
              },
            },
          },
        },
        split: true,
        workflowVersion: { include: { lineage: true } },
        benchmarkRuns: {
          select: {
            id: true,
            status: true,

            startedAt: true,
            completedAt: true,
          },
          orderBy: {
            startedAt: "desc",
          },
        },
      },
    });

    if (!definition) {
      throw new NotFoundException(
        `Benchmark definition with ID "${definitionId}" not found for project "${projectId}"`,
      );
    }

    // Fetch baseline run separately if it exists
    const baselineRun = await this.prisma.benchmarkRun.findFirst({
      where: {
        definitionId,
        isBaseline: true,
      },
      select: {
        id: true,
        status: true,
        metrics: true,
        baselineThresholds: true,
        completedAt: true,
      },
    });

    return this.mapToDefinitionDetails(definition, baselineRun);
  }

  /**
   * Update a benchmark definition
   *
   * If the definition has runs (immutable=true), creates a new revision.
   * If the definition has no runs (immutable=false), updates in place.
   */
  async updateDefinition(
    projectId: string,
    definitionId: string,
    dto: UpdateDefinitionDto,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `Updating benchmark definition: ${definitionId} for project ${projectId}`,
    );

    // Get the existing definition
    const existing = await this.prisma.benchmarkDefinition.findFirst({
      where: {
        id: definitionId,
        projectId,
      },
      include: {
        _count: {
          select: {
            benchmarkRuns: true,
          },
        },
        datasetVersion: {
          include: {
            dataset: {
              select: {
                name: true,
              },
            },
          },
        },
        split: true,
        workflowVersion: { include: { lineage: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException(
        `Benchmark definition with ID "${definitionId}" not found for project "${projectId}"`,
      );
    }

    // Validate referenced entities if they are being changed
    if (dto.datasetVersionId) {
      const datasetVersion = await this.prisma.datasetVersion.findUnique({
        where: { id: dto.datasetVersionId },
      });

      if (!datasetVersion) {
        throw new BadRequestException(
          `Dataset version with ID "${dto.datasetVersionId}" does not exist`,
        );
      }
    }

    if (dto.splitId) {
      const split = await this.prisma.split.findUnique({
        where: { id: dto.splitId },
      });

      if (!split) {
        throw new BadRequestException(
          `Split with ID "${dto.splitId}" does not exist`,
        );
      }

      // Validate split belongs to the dataset version (either new or existing)
      const targetDatasetVersionId =
        dto.datasetVersionId || existing.datasetVersionId;
      if (split.datasetVersionId !== targetDatasetVersionId) {
        throw new BadRequestException(
          `Split "${dto.splitId}" does not belong to dataset version "${targetDatasetVersionId}"`,
        );
      }
    }

    let workflowConfigHash = existing.workflowConfigHash;
    if (dto.workflowVersionId) {
      const workflowVersion = await this.prisma.workflowVersion.findUnique({
        where: { id: dto.workflowVersionId },
      });

      if (!workflowVersion) {
        throw new BadRequestException(
          `Workflow version with ID "${dto.workflowVersionId}" does not exist`,
        );
      }

      // Recompute workflow config hash
      workflowConfigHash = computeConfigHash(
        workflowVersion.config as GraphWorkflowConfig,
      );
    }

    if (dto.evaluatorType) {
      if (!this.evaluatorRegistry.hasEvaluator(dto.evaluatorType)) {
        throw new BadRequestException(
          `Evaluator type "${dto.evaluatorType}" is not registered. Available types: ${this.evaluatorRegistry.getAvailableTypes().join(", ")}`,
        );
      }
    }

    // Determine if we need to create a new revision
    const hasRuns = existing._count.benchmarkRuns > 0;

    if (hasRuns) {
      // Mark the existing definition as immutable
      await this.prisma.benchmarkDefinition.update({
        where: { id: definitionId },
        data: { immutable: true },
      });

      // Create a new revision
      const newDefinition = await this.prisma.benchmarkDefinition.create({
        data: {
          projectId,
          name: dto.name ?? existing.name,
          datasetVersionId: dto.datasetVersionId ?? existing.datasetVersionId,
          splitId: dto.splitId ?? existing.splitId,
          workflowVersionId:
            dto.workflowVersionId ?? existing.workflowVersionId,
          workflowConfigHash,
          evaluatorType: dto.evaluatorType ?? existing.evaluatorType,
          evaluatorConfig: (dto.evaluatorConfig ??
            existing.evaluatorConfig) as Prisma.InputJsonValue,
          runtimeSettings: (dto.runtimeSettings ??
            existing.runtimeSettings) as Prisma.InputJsonValue,
          immutable: false,
          revision: existing.revision + 1,
        },
        include: {
          datasetVersion: {
            include: {
              dataset: {
                select: {
                  name: true,
                },
              },
            },
          },
          split: true,
          workflowVersion: { include: { lineage: true } },
          benchmarkRuns: {
            select: {
              id: true,
              status: true,

              startedAt: true,
              completedAt: true,
            },
            orderBy: {
              startedAt: "desc",
            },
          },
        },
      });

      this.logger.log(
        `Created new revision ${newDefinition.revision} for definition ${definitionId}`,
      );

      return this.mapToDefinitionDetails(newDefinition);
    } else {
      // Update in place
      const updateData: Prisma.BenchmarkDefinitionUpdateInput = {};
      if (dto.name) updateData.name = dto.name;
      if (dto.datasetVersionId)
        updateData.datasetVersion = { connect: { id: dto.datasetVersionId } };
      if (dto.splitId) updateData.split = { connect: { id: dto.splitId } };
      if (dto.workflowVersionId) {
        updateData.workflowVersion = {
          connect: { id: dto.workflowVersionId },
        };
        updateData.workflowConfigHash = workflowConfigHash;
      }
      if (dto.evaluatorType) updateData.evaluatorType = dto.evaluatorType;
      if (dto.evaluatorConfig)
        updateData.evaluatorConfig =
          dto.evaluatorConfig as Prisma.InputJsonValue;
      if (dto.runtimeSettings)
        updateData.runtimeSettings =
          dto.runtimeSettings as Prisma.InputJsonValue;

      const updated = await this.prisma.benchmarkDefinition.update({
        where: { id: definitionId },
        data: updateData,
        include: {
          datasetVersion: {
            include: {
              dataset: {
                select: {
                  name: true,
                },
              },
            },
          },
          split: true,
          workflowVersion: { include: { lineage: true } },
          benchmarkRuns: {
            select: {
              id: true,
              status: true,

              startedAt: true,
              completedAt: true,
            },
            orderBy: {
              startedAt: "desc",
            },
          },
        },
      });

      this.logger.log(`Updated definition ${definitionId} in place`);

      return this.mapToDefinitionDetails(updated);
    }
  }

  /**
   * Delete a benchmark definition.
   *
   * Checks for active/running benchmark runs before allowing deletion.
   * Completed/failed runs are cascade-deleted along with the definition.
   * @param projectId - The parent project ID
   * @param definitionId - The definition ID to delete
   * @throws NotFoundException if the definition does not exist in the project
   * @throws ConflictException-like BadRequestException if there are active runs
   */
  async deleteDefinition(
    projectId: string,
    definitionId: string,
  ): Promise<void> {
    const definition = await this.prisma.benchmarkDefinition.findFirst({
      where: {
        id: definitionId,
        projectId,
      },
      include: {
        benchmarkRuns: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!definition) {
      throw new NotFoundException(
        `Benchmark definition "${definitionId}" not found in project "${projectId}"`,
      );
    }

    // Check for active (pending/running) runs
    const activeRuns = definition.benchmarkRuns.filter(
      (run) => run.status === "pending" || run.status === "running",
    );

    if (activeRuns.length > 0) {
      throw new BadRequestException(
        `Cannot delete definition "${definition.name}" because it has ${activeRuns.length} active run(s). Cancel or wait for them to complete first.`,
      );
    }

    await this.prisma.benchmarkDefinition.delete({
      where: { id: definitionId },
    });

    this.logger.log(
      `Deleted benchmark definition "${definition.name}" (${definitionId}) from project ${projectId}`,
    );
  }

  /**
   * Map Prisma result to DefinitionSummaryDto
   */
  private mapToDefinitionSummary(definition: {
    id: string;
    name: string;
    evaluatorType: string;
    immutable: boolean;
    revision: number;
    createdAt: Date;
    updatedAt: Date;
    datasetVersion: {
      id: string;
      version: string;
      dataset: {
        name: string;
      };
    };
    workflowVersion: {
      id: string;
      version_number: number;
      lineage: { id: string; name: string };
    };
  }): DefinitionSummaryDto {
    return {
      id: definition.id,
      name: definition.name,
      datasetVersion: {
        id: definition.datasetVersion.id,
        datasetName: definition.datasetVersion.dataset.name,
        version: definition.datasetVersion.version,
      },
      workflow: {
        id: definition.workflowVersion.lineage.id,
        workflowVersionId: definition.workflowVersion.id,
        name: definition.workflowVersion.lineage.name,
        version: definition.workflowVersion.version_number,
      },
      evaluatorType: definition.evaluatorType,
      immutable: definition.immutable,
      revision: definition.revision,
      createdAt: definition.createdAt,
      updatedAt: definition.updatedAt,
    };
  }

  /**
   * Map Prisma result to DefinitionDetailsDto
   */
  private mapToDefinitionDetails(
    definition: {
      id: string;
      projectId: string;
      name: string;
      workflowConfigHash: string;
      evaluatorType: string;
      evaluatorConfig: unknown;
      runtimeSettings: unknown;
      immutable: boolean;
      revision: number;
      scheduleEnabled: boolean;
      scheduleCron: string | null;
      scheduleId: string | null;
      createdAt: Date;
      updatedAt: Date;
      datasetVersion: {
        id: string;
        version: string;
        dataset: {
          name: string;
        };
      };
      split: {
        id: string;
        name: string;
        type: string;
      } | null;
      workflowVersion: {
        id: string;
        version_number: number;
        lineage: { id: string; name: string };
      };
      benchmarkRuns: Array<{
        id: string;
        status: string;
        startedAt: Date | null;
        completedAt: Date | null;
      }>;
    },
    baselineRun?: {
      id: string;
      status: string;
      metrics: unknown;
      baselineThresholds: unknown;
      completedAt: Date | null;
    } | null,
  ): DefinitionDetailsDto {
    const datasetVersion: DatasetVersionInfo = {
      id: definition.datasetVersion.id,
      datasetName: definition.datasetVersion.dataset.name,
      version: definition.datasetVersion.version,
    };

    const workflow: WorkflowInfo = {
      id: definition.workflowVersion.lineage.id,
      workflowVersionId: definition.workflowVersion.id,
      name: definition.workflowVersion.lineage.name,
      version: definition.workflowVersion.version_number,
    };

    const split: SplitInfo | undefined = definition.split
      ? {
          id: definition.split.id,
          name: definition.split.name,
          type: definition.split.type,
        }
      : undefined;

    const runHistory: RunHistorySummary[] = definition.benchmarkRuns.map(
      (run) => ({
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      }),
    );

    // Map baseline run if it exists
    let baselineRunSummary: BaselineRunSummary | undefined;
    if (baselineRun) {
      const metrics = baselineRun.metrics as Record<string, number>;
      const thresholds = baselineRun.baselineThresholds as Array<{
        metricName: string;
        type: "relative" | "absolute";
        value: number;
      }>;

      baselineRunSummary = {
        id: baselineRun.id,
        status: baselineRun.status,
        metrics,
        baselineThresholds: thresholds,
        completedAt: baselineRun.completedAt,
      };
    }

    return {
      id: definition.id,
      projectId: definition.projectId,
      name: definition.name,
      datasetVersion,
      split,
      workflow,
      workflowConfigHash: definition.workflowConfigHash,
      evaluatorType: definition.evaluatorType,
      evaluatorConfig: definition.evaluatorConfig as Record<string, unknown>,
      runtimeSettings: definition.runtimeSettings as Record<string, unknown>,
      immutable: definition.immutable,
      revision: definition.revision,
      scheduleEnabled: definition.scheduleEnabled,
      scheduleCron: definition.scheduleCron ?? undefined,
      scheduleId: definition.scheduleId ?? undefined,
      runHistory,
      baselineRun: baselineRunSummary,
      createdAt: definition.createdAt,
      updatedAt: definition.updatedAt,
    };
  }

  async promoteCandidateWorkflow(
    projectId: string,
    definitionId: string,
    candidateWorkflowVersionId: string,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `Promoting candidate workflow ${candidateWorkflowVersionId} into definition ${definitionId} (project ${projectId})`,
    );

    const definition = await this.prisma.benchmarkDefinition.findFirst({
      where: { id: definitionId, projectId },
      include: {
        workflowVersion: { include: { lineage: true } },
      },
    });

    if (!definition?.workflowVersion?.lineage) {
      throw new NotFoundException(
        `Benchmark definition with ID "${definitionId}" not found for project "${projectId}"`,
      );
    }

    const baseLineageId = definition.workflowVersion.lineage.id;
    const baseLineageGroupId = definition.workflowVersion.lineage.group_id;

    const baseLineage = await this.prisma.workflowLineage.findUnique({
      where: { id: baseLineageId },
      select: { id: true, group_id: true, head_version_id: true },
    });

    if (!baseLineage?.head_version_id) {
      throw new BadRequestException(
        `Base workflow lineage ${baseLineageId} has no head version to promote into`,
      );
    }

    const oldBaseHeadVersionId = baseLineage.head_version_id;

    const candidateVersion = await this.prisma.workflowVersion.findUnique({
      where: { id: candidateWorkflowVersionId },
      include: { lineage: true },
    });

    if (!candidateVersion?.lineage) {
      throw new NotFoundException(
        `Candidate workflow version not found: ${candidateWorkflowVersionId}`,
      );
    }

    const candidateLineage = candidateVersion.lineage;

    if (candidateLineage.workflow_kind !== "benchmark_candidate") {
      throw new BadRequestException(
        `Candidate lineage ${candidateLineage.id} is not a benchmark candidate`,
      );
    }

    if (candidateLineage.source_workflow_id !== baseLineageId) {
      throw new BadRequestException(
        `Candidate is not derived from the definition's base workflow lineage`,
      );
    }

    if (candidateLineage.group_id !== baseLineageGroupId) {
      throw new BadRequestException(
        `Candidate lineage group does not match the definition's base lineage`,
      );
    }

    const candidateConfig = candidateVersion.config as GraphWorkflowConfig;
    const validation = validateGraphConfig(candidateConfig);
    if (!validation.valid) {
      throw new BadRequestException({
        message: "Invalid candidate workflow configuration",
        errors: validation.errors,
      });
    }

    const latest = await this.prisma.workflowVersion.findFirst({
      where: { lineage_id: baseLineageId },
      orderBy: { version_number: "desc" },
      select: { version_number: true },
    });

    const nextVersionNumber = (latest?.version_number ?? 0) + 1;

    const newVersion = await this.prisma.workflowVersion.create({
      data: {
        lineage_id: baseLineageId,
        version_number: nextVersionNumber,
        config: candidateConfig as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.workflowLineage.update({
      where: { id: baseLineageId },
      data: { head_version_id: newVersion.id },
    });

    const newHash = computeConfigHash(candidateConfig);

    // Repin only definitions that were pinned to the old base head
    await this.prisma.benchmarkDefinition.updateMany({
      where: {
        projectId,
        workflowVersionId: oldBaseHeadVersionId,
      },
      data: {
        workflowVersionId: newVersion.id,
        workflowConfigHash: newHash,
      },
    });

    return this.getDefinitionById(projectId, definitionId);
  }

  /**
   * Configure schedule for a benchmark definition
   *
   * Creates or updates a Temporal schedule for automatic benchmark runs.
   * If a schedule already exists and is being disabled, it will be deleted.
   */
  async configureSchedule(
    projectId: string,
    definitionId: string,
    dto: ScheduleConfigDto,
  ): Promise<DefinitionDetailsDto> {
    this.logger.log(
      `Configuring schedule for definition ${definitionId}: enabled=${dto.enabled}, cron=${dto.cron}`,
    );

    // Get the definition
    const definition = await this.prisma.benchmarkDefinition.findFirst({
      where: {
        id: definitionId,
        projectId,
      },
      include: {
        datasetVersion: {
          include: {
            dataset: {
              select: {
                name: true,
              },
            },
          },
        },
        split: true,
        workflowVersion: { include: { lineage: true } },
      },
    });

    if (!definition) {
      throw new NotFoundException(
        `Benchmark definition with ID "${definitionId}" not found for project "${projectId}"`,
      );
    }

    // If enabling schedule, validate cron expression is provided
    if (dto.enabled && !dto.cron) {
      throw new BadRequestException(
        "Cron expression is required when enabling schedule",
      );
    }

    // Delete existing schedule if any
    if (definition.scheduleId) {
      try {
        await this.temporalService.deleteSchedule(definition.scheduleId);
      } catch (error) {
        this.logger.warn(
          `Failed to delete existing schedule ${definition.scheduleId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    let scheduleId: string | null = null;

    // Create new schedule if enabled
    if (dto.enabled && dto.cron) {
      scheduleId = await this.temporalService.createSchedule(
        definitionId,
        dto.cron,
        {
          definitionId: definition.id,
          datasetVersionId: definition.datasetVersionId,
          splitId: definition.splitId,
          workflowVersionId: definition.workflowVersionId,
          workflowConfigHash: definition.workflowConfigHash,
          evaluatorType: definition.evaluatorType,
          evaluatorConfig: definition.evaluatorConfig as Record<
            string,
            unknown
          >,
          runtimeSettings: definition.runtimeSettings as Record<
            string,
            unknown
          >,
        },
      );
    }

    // Update definition with schedule info
    const updated = await this.prisma.benchmarkDefinition.update({
      where: { id: definitionId },
      data: {
        scheduleEnabled: dto.enabled,
        scheduleCron: dto.cron ?? null,
        scheduleId: scheduleId,
      },
      include: {
        datasetVersion: {
          include: {
            dataset: {
              select: {
                name: true,
              },
            },
          },
        },
        split: true,
        workflowVersion: { include: { lineage: true } },
        benchmarkRuns: {
          orderBy: {
            createdAt: "desc",
          },
          take: 10,
        },
      },
    });

    return this.mapToDefinitionDetails(updated);
  }

  /**
   * Get schedule information for a definition
   *
   * Returns current schedule configuration and timing info from Temporal.
   */
  async getScheduleInfo(
    projectId: string,
    definitionId: string,
  ): Promise<ScheduleInfoDto | null> {
    this.logger.log(`Getting schedule info for definition ${definitionId}`);

    const definition = await this.prisma.benchmarkDefinition.findFirst({
      where: {
        id: definitionId,
        projectId,
      },
    });

    if (!definition) {
      throw new NotFoundException(
        `Benchmark definition with ID "${definitionId}" not found for project "${projectId}"`,
      );
    }

    if (!definition.scheduleId) {
      return null;
    }

    try {
      return await this.temporalService.getScheduleInfo(definition.scheduleId);
    } catch (error) {
      this.logger.error(
        `Failed to get schedule info for ${definition.scheduleId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
