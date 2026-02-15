/**
 * Benchmark Run Service
 *
 * Manages benchmark run lifecycle: creation, execution, cancellation, and results retrieval.
 * Orchestrates interactions between Prisma, MLflow, and Temporal.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 2.6, 4.2, 4.5, 11.2
 */

import { PrismaClient } from "@generated/client";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { execSync } from "child_process";
import { getPrismaPgOptions } from "@/utils/database-url";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import {
  CreateRunDto,
  DrillDownResponseDto,
  FieldErrorBreakdownDto,
  RunDetailsDto,
  RunSummaryDto,
  SampleFailureDto,
} from "./dto";
import { MLflowClientService } from "./mlflow-client.service";

@Injectable()
export class BenchmarkRunService {
  private readonly logger = new Logger(BenchmarkRunService.name);
  private prisma: PrismaClient;

  constructor(
    private configService: ConfigService,
    private mlflowClient: MLflowClientService,
    private benchmarkTemporal: BenchmarkTemporalService,
  ) {
    const dbOptions = getPrismaPgOptions(
      this.configService.get("DATABASE_URL"),
    );
    this.prisma = new PrismaClient({
      adapter: new PrismaPg(dbOptions),
    });
  }

  /**
   * Get the current Git SHA of the worker codebase
   */
  private getWorkerGitSha(): string {
    try {
      return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    } catch (error) {
      this.logger.warn(
        `Failed to get git SHA: ${error instanceof Error ? error.message : String(error)}`,
      );
      return "unknown";
    }
  }

  /**
   * Get the worker image digest from environment variable
   */
  private getWorkerImageDigest(): string | null {
    const digest = process.env.WORKER_IMAGE_DIGEST;
    if (!digest) {
      this.logger.debug("WORKER_IMAGE_DIGEST environment variable not set");
      return null;
    }
    return digest;
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    runId: string,
    action: "run_started" | "run_completed",
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.benchmarkAuditLog.create({
        data: {
          userId: "system", // TODO: Get from auth context when available
          action,
          entityType: "BenchmarkRun",
          entityId: runId,
          metadata: metadata as never,
          timestamp: new Date(),
        },
      });
      this.logger.debug(`Audit log created: ${action} for run ${runId}`);
    } catch (error) {
      this.logger.error(
        `Failed to create audit log: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Don't throw - audit logging failures shouldn't block operations
    }
  }

  /**
   * Start a benchmark run
   *
   * Creates a BenchmarkRun record, starts the Temporal workflow,
   * creates an MLflow run, and marks the definition as immutable.
   */
  async startRun(
    projectId: string,
    definitionId: string,
    dto: CreateRunDto,
  ): Promise<RunDetailsDto> {
    this.logger.log(
      `Starting benchmark run for project ${projectId}, definition ${definitionId}`,
    );

    // Validate that the definition exists and belongs to the project
    const definition = await this.prisma.benchmarkDefinition.findFirst({
      where: {
        id: definitionId,
        projectId,
      },
      include: {
        project: true,
        datasetVersion: {
          include: {
            dataset: true,
          },
        },
        split: true,
        workflow: true,
      },
    });

    if (!definition) {
      throw new NotFoundException(
        `Benchmark definition with ID "${definitionId}" not found for project "${projectId}"`,
      );
    }

    // Get worker git SHA and image digest
    const workerGitSha = this.getWorkerGitSha();
    const workerImageDigest = this.getWorkerImageDigest();

    // Check if dataset version is draft and prepare tags
    const isDraftDataset = definition.datasetVersion.status === "draft";
    if (isDraftDataset) {
      this.logger.warn(
        `Dataset version ${definition.datasetVersionId} has status 'draft'. Run will be tagged with 'draft_dataset'.`,
      );
    }
    const runTags = {
      ...(dto.tags || {}),
      ...(isDraftDataset ? { draft_dataset: "true" } : {}),
    };

    // Create MLflow run
    const mlflowRunId = await this.mlflowClient.createRun(
      definition.project.mlflowExperimentId,
      `${definition.name}-${new Date().toISOString()}`,
    );

    // Create BenchmarkRun record with status 'pending'
    const run = await this.prisma.benchmarkRun.create({
      data: {
        definitionId,
        projectId,
        status: "pending",
        mlflowRunId,
        temporalWorkflowId: "", // Will be updated after starting workflow
        workerGitSha,
        workerImageDigest,
        params: {
          runtimeSettings: {
            ...(definition.runtimeSettings as Record<string, unknown>),
            ...(dto.runtimeSettingsOverride || {}),
          },
        } as never,
        tags: runTags as never,
      },
      include: {
        definition: true,
      },
    });

    this.logger.log(
      `Created benchmark run record: ${run.id} with MLflow run ${mlflowRunId}`,
    );

    // Start Temporal workflow
    let temporalWorkflowId: string;
    try {
      temporalWorkflowId =
        await this.benchmarkTemporal.startBenchmarkRunWorkflow(run.id, {
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
          runtimeSettings: {
            ...(definition.runtimeSettings as Record<string, unknown>),
            ...(dto.runtimeSettingsOverride || {}),
          } as Record<string, unknown>,
          artifactPolicy: definition.artifactPolicy as Record<string, unknown>,
        });

      // Update run with temporal workflow ID and status
      await this.prisma.benchmarkRun.update({
        where: { id: run.id },
        data: {
          temporalWorkflowId,
          status: "running",
          startedAt: new Date(),
        },
      });

      this.logger.log(
        `Started Temporal workflow ${temporalWorkflowId} for run ${run.id}`,
      );
    } catch (error) {
      // If workflow start fails, mark run as failed
      await this.prisma.benchmarkRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          error: `Failed to start Temporal workflow: ${error instanceof Error ? error.message : String(error)}`,
        },
      });

      throw new Error(
        `Failed to start benchmark run workflow: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Mark definition as immutable
    await this.prisma.benchmarkDefinition.update({
      where: { id: definitionId },
      data: { immutable: true },
    });

    // Create audit log
    await this.createAuditLog(run.id, "run_started", {
      definitionId,
      mlflowRunId,
      temporalWorkflowId,
    });

    // Return the updated run
    return this.getRunById(projectId, run.id);
  }

  /**
   * Cancel a running benchmark
   */
  async cancelRun(projectId: string, runId: string): Promise<RunDetailsDto> {
    this.logger.log(`Cancelling benchmark run ${runId}`);

    // Get the run
    const run = await this.prisma.benchmarkRun.findFirst({
      where: {
        id: runId,
        projectId,
      },
    });

    if (!run) {
      throw new NotFoundException(
        `Benchmark run with ID "${runId}" not found for project "${projectId}"`,
      );
    }

    // Check if run is in a cancellable state
    if (run.status !== "running" && run.status !== "pending") {
      throw new BadRequestException(
        `Cannot cancel run in status "${run.status}". Only "running" or "pending" runs can be cancelled.`,
      );
    }

    // Cancel the Temporal workflow
    try {
      await this.benchmarkTemporal.cancelBenchmarkRunWorkflow(
        run.temporalWorkflowId,
      );
    } catch (error) {
      this.logger.error(
        `Failed to cancel Temporal workflow: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Continue anyway to update the database status
    }

    // Update run status to cancelled
    await this.prisma.benchmarkRun.update({
      where: { id: runId },
      data: {
        status: "cancelled",
        completedAt: new Date(),
      },
    });

    this.logger.log(`Benchmark run ${runId} cancelled`);

    return this.getRunById(projectId, runId);
  }

  /**
   * Get run details by ID
   */
  async getRunById(projectId: string, runId: string): Promise<RunDetailsDto> {
    const run = await this.prisma.benchmarkRun.findFirst({
      where: {
        id: runId,
        projectId,
      },
      include: {
        definition: true,
      },
    });

    if (!run) {
      throw new NotFoundException(
        `Benchmark run with ID "${runId}" not found for project "${projectId}"`,
      );
    }

    return {
      id: run.id,
      definitionId: run.definitionId,
      definitionName: run.definition.name,
      projectId: run.projectId,
      status: run.status,
      mlflowRunId: run.mlflowRunId,
      temporalWorkflowId: run.temporalWorkflowId,
      workerImageDigest: run.workerImageDigest,
      workerGitSha: run.workerGitSha,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      metrics: run.metrics as Record<string, unknown>,
      params: run.params as Record<string, unknown>,
      tags: run.tags as Record<string, unknown>,
      error: run.error,
      isBaseline: run.isBaseline,
      createdAt: run.createdAt,
    };
  }

  /**
   * List runs for a project
   */
  async listRuns(projectId: string): Promise<RunSummaryDto[]> {
    // Verify project exists
    const project = await this.prisma.benchmarkProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException(
        `Benchmark project with ID "${projectId}" not found`,
      );
    }

    const runs = await this.prisma.benchmarkRun.findMany({
      where: { projectId },
      include: {
        definition: true,
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    return runs.map((run) => {
      const durationMs =
        run.startedAt && run.completedAt
          ? run.completedAt.getTime() - run.startedAt.getTime()
          : null;

      const metrics = run.metrics as Record<string, unknown>;
      const headlineMetrics = run.status === "completed" ? metrics : null;

      return {
        id: run.id,
        definitionId: run.definitionId,
        definitionName: run.definition.name,
        status: run.status,
        mlflowRunId: run.mlflowRunId,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        durationMs,
        headlineMetrics,
      };
    });
  }

  /**
   * Get drill-down summary with detailed failure analysis
   */
  async getDrillDown(
    projectId: string,
    runId: string,
  ): Promise<DrillDownResponseDto> {
    this.logger.log(`Getting drill-down for run ${runId}`);

    // Get the run
    const run = await this.prisma.benchmarkRun.findFirst({
      where: {
        id: runId,
        projectId,
      },
    });

    if (!run) {
      throw new NotFoundException(
        `Benchmark run with ID "${runId}" not found for project "${projectId}"`,
      );
    }

    if (run.status !== "completed") {
      throw new BadRequestException(
        `Drill-down is only available for completed runs. Run status is "${run.status}".`,
      );
    }

    const metrics = run.metrics as Record<string, unknown>;

    // Extract per-sample results from metrics
    // This is a placeholder structure - actual implementation depends on evaluator output format
    const perSampleResults = (metrics.perSampleResults || []) as Array<{
      sampleId: string;
      metricName: string;
      metricValue: number;
      metadata?: Record<string, unknown>;
    }>;

    // Get worst-performing samples (top 10 by metric value, assuming lower is worse)
    const worstSamples: SampleFailureDto[] = perSampleResults
      .sort((a, b) => a.metricValue - b.metricValue)
      .slice(0, 10)
      .map((sample) => ({
        sampleId: sample.sampleId,
        metricValue: sample.metricValue,
        metricName: sample.metricName,
        metadata: sample.metadata,
      }));

    // Extract field error breakdown if available (schema-aware evaluator)
    const fieldErrorBreakdown: FieldErrorBreakdownDto[] | null =
      (metrics.fieldErrorBreakdown as FieldErrorBreakdownDto[]) || null;

    // Extract error clustering tags
    const errorClusters = (metrics.errorClusters || {}) as Record<
      string,
      number
    >;

    return {
      runId: run.id,
      aggregatedMetrics: metrics,
      worstSamples,
      fieldErrorBreakdown,
      errorClusters,
    };
  }
}
