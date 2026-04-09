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
import { computeConfigHash } from "@/workflow/config-hash";
import type { GraphWorkflowConfig } from "@/workflow/graph-workflow-types";
import { BenchmarkDefinitionDbService } from "./benchmark-definition-db.service";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import {
  BaselineRunSummary,
  CreateDefinitionDto,
  DatasetVersionInfo,
  DefinitionDetailsDto,
  DefinitionSummaryDto,
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

  constructor(
    private readonly definitionDbService: BenchmarkDefinitionDbService,
    private readonly evaluatorRegistry: EvaluatorRegistryService,
    private readonly temporalService: BenchmarkTemporalService,
  ) {}

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
    const project =
      await this.definitionDbService.findBenchmarkProject(projectId);

    if (!project) {
      throw new NotFoundException(
        `Benchmark project with ID "${projectId}" not found`,
      );
    }

    // Validate that the dataset version exists
    const datasetVersion = await this.definitionDbService.findDatasetVersion(
      dto.datasetVersionId,
    );

    if (!datasetVersion) {
      throw new BadRequestException(
        `Dataset version with ID "${dto.datasetVersionId}" does not exist`,
      );
    }

    // Validate that the split exists and belongs to the dataset version (when provided)
    if (dto.splitId) {
      const split = await this.definitionDbService.findSplit(dto.splitId);

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

    // Validate that the workflow exists
    const workflow = await this.definitionDbService.findWorkflow(
      dto.workflowId,
    );

    if (!workflow) {
      throw new BadRequestException(
        `Workflow with ID "${dto.workflowId}" does not exist`,
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
      workflow.config as GraphWorkflowConfig,
    );

    // Create the definition
    const definition = await this.definitionDbService.createBenchmarkDefinition(
      {
        projectId,
        name: dto.name,
        datasetVersionId: dto.datasetVersionId,
        splitId: dto.splitId || null,
        workflowId: dto.workflowId,
        workflowConfigHash,
        evaluatorType: dto.evaluatorType,
        evaluatorConfig: dto.evaluatorConfig as Prisma.InputJsonValue,
        runtimeSettings: dto.runtimeSettings as Prisma.InputJsonValue,
        immutable: false,
        revision: 1,
      },
    );

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
    const project =
      await this.definitionDbService.findBenchmarkProject(projectId);

    if (!project) {
      throw new NotFoundException(
        `Benchmark project with ID "${projectId}" not found`,
      );
    }

    const definitions =
      await this.definitionDbService.findAllBenchmarkDefinitions(projectId);

    return definitions.map((def) => this.mapToDefinitionSummary(def));
  }

  /**
   * Get definition details by ID
   */
  async getDefinitionById(
    projectId: string,
    definitionId: string,
  ): Promise<DefinitionDetailsDto> {
    const definition = await this.definitionDbService.findBenchmarkDefinition(
      definitionId,
      projectId,
    );

    if (!definition) {
      throw new NotFoundException(
        `Benchmark definition with ID "${definitionId}" not found for project "${projectId}"`,
      );
    }

    // Fetch baseline run separately if it exists
    const baselineRun =
      await this.definitionDbService.findBaselineBenchmarkRun(definitionId);

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
    const existing =
      await this.definitionDbService.findBenchmarkDefinitionForUpdate(
        definitionId,
        projectId,
      );

    if (!existing) {
      throw new NotFoundException(
        `Benchmark definition with ID "${definitionId}" not found for project "${projectId}"`,
      );
    }

    // Validate referenced entities if they are being changed
    if (dto.datasetVersionId) {
      const datasetVersion = await this.definitionDbService.findDatasetVersion(
        dto.datasetVersionId,
      );

      if (!datasetVersion) {
        throw new BadRequestException(
          `Dataset version with ID "${dto.datasetVersionId}" does not exist`,
        );
      }
    }

    if (dto.splitId) {
      const split = await this.definitionDbService.findSplit(dto.splitId);

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
    if (dto.workflowId) {
      const workflow = await this.definitionDbService.findWorkflow(
        dto.workflowId,
      );

      if (!workflow) {
        throw new BadRequestException(
          `Workflow with ID "${dto.workflowId}" does not exist`,
        );
      }

      // Recompute workflow config hash
      workflowConfigHash = computeConfigHash(
        workflow.config as GraphWorkflowConfig,
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
      await this.definitionDbService.updateBenchmarkDefinition(definitionId, {
        immutable: true,
      });

      // Create a new revision
      const newDefinition =
        await this.definitionDbService.createBenchmarkDefinition({
          projectId,
          name: dto.name ?? existing.name,
          datasetVersionId: dto.datasetVersionId ?? existing.datasetVersionId,
          splitId: dto.splitId ?? existing.splitId,
          workflowId: dto.workflowId ?? existing.workflowId,
          workflowConfigHash,
          evaluatorType: dto.evaluatorType ?? existing.evaluatorType,
          evaluatorConfig: (dto.evaluatorConfig ??
            existing.evaluatorConfig) as Prisma.InputJsonValue,
          runtimeSettings: (dto.runtimeSettings ??
            existing.runtimeSettings) as Prisma.InputJsonValue,
          immutable: false,
          revision: existing.revision + 1,
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
      if (dto.workflowId) {
        updateData.workflow = { connect: { id: dto.workflowId } };
        updateData.workflowConfigHash = workflowConfigHash;
      }
      if (dto.evaluatorType) updateData.evaluatorType = dto.evaluatorType;
      if (dto.evaluatorConfig)
        updateData.evaluatorConfig =
          dto.evaluatorConfig as Prisma.InputJsonValue;
      if (dto.runtimeSettings)
        updateData.runtimeSettings =
          dto.runtimeSettings as Prisma.InputJsonValue;

      const updated = await this.definitionDbService.updateBenchmarkDefinition(
        definitionId,
        updateData,
      );

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
    const definition =
      await this.definitionDbService.findBenchmarkDefinitionForDeletion(
        definitionId,
        projectId,
      );

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

    await this.definitionDbService.deleteBenchmarkDefinition(definitionId);

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
    workflow: {
      id: string;
      name: string;
      version: number;
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
        id: definition.workflow.id,
        name: definition.workflow.name,
        version: definition.workflow.version,
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
      workflow: {
        id: string;
        name: string;
        version: number;
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
      id: definition.workflow.id,
      name: definition.workflow.name,
      version: definition.workflow.version,
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
    const definition = await this.definitionDbService.findBenchmarkDefinition(
      definitionId,
      projectId,
    );

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
          workflowId: definition.workflowId,
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
    const updated = await this.definitionDbService.updateBenchmarkDefinition(
      definitionId,
      {
        scheduleEnabled: dto.enabled,
        scheduleCron: dto.cron ?? null,
        scheduleId: scheduleId,
      },
    );

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

    const definition = await this.definitionDbService.findBenchmarkDefinition(
      definitionId,
      projectId,
    );

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
