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
import { createHash } from "crypto";
import { execSync } from "child_process";
import { getPrismaPgOptions } from "@/utils/database-url";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import {
  BaselineComparison,
  CreateRunDto,
  DrillDownResponseDto,
  FieldErrorBreakdownDto,
  MetricComparison,
  MetricThreshold,
  PerSampleResultDto,
  PerSampleResultsResponseDto,
  PromoteBaselineDto,
  PromoteBaselineResponseDto,
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
    action: "run_started" | "run_completed" | "baseline_promoted",
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
      const evaluatorConfigHash = createHash("sha256")
        .update(JSON.stringify(definition.evaluatorConfig))
        .digest("hex");

      temporalWorkflowId =
        await this.benchmarkTemporal.startBenchmarkRunWorkflow(run.id, {
          definitionId: definition.id,
          projectId,
          datasetVersionId: definition.datasetVersionId,
          gitRevision: definition.datasetVersion.gitRevision,
          splitId: definition.splitId,
          workflowId: definition.workflowId,
          workflowConfigHash: definition.workflowConfigHash,
          evaluatorType: definition.evaluatorType,
          evaluatorConfig: definition.evaluatorConfig as Record<
            string,
            unknown
          >,
          evaluatorConfigHash,
          runtimeSettings: {
            ...(definition.runtimeSettings as Record<string, unknown>),
            ...(dto.runtimeSettingsOverride || {}),
          } as Record<string, unknown>,
          artifactPolicy: definition.artifactPolicy as Record<string, unknown>,
          mlflowRunId,
          workerGitSha,
          workerImageDigest: workerImageDigest ?? undefined,
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
      baselineThresholds: run.baselineThresholds as unknown as
        | MetricThreshold[]
        | null,
      baselineComparison:
        run.baselineComparison as unknown as BaselineComparison | null,
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

      // Check for regression status
      const baselineComparison = run.baselineComparison as unknown as BaselineComparison | null;
      const hasRegression = baselineComparison ? !baselineComparison.overallPassed : undefined;
      const regressedMetricCount = baselineComparison ? baselineComparison.regressedMetrics.length : undefined;

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
        hasRegression,
        regressedMetricCount,
        isBaseline: run.isBaseline,
        tags: run.tags as Record<string, unknown>,
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

  /**
   * Promote a run to baseline
   *
   * Sets the run's isBaseline flag to true, clears any previous baseline for the same definition,
   * stores thresholds, and records an audit log.
   */
  async promoteToBaseline(
    projectId: string,
    runId: string,
    dto: PromoteBaselineDto,
  ): Promise<PromoteBaselineResponseDto> {
    this.logger.log(`Promoting run ${runId} to baseline`);

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

    // Only completed runs can be promoted to baseline
    if (run.status !== "completed") {
      throw new BadRequestException(
        `Only completed runs can be promoted to baseline. Run status is "${run.status}".`,
      );
    }

    // Find the previous baseline for this definition
    const previousBaseline = await this.prisma.benchmarkRun.findFirst({
      where: {
        definitionId: run.definitionId,
        isBaseline: true,
      },
    });

    // Update previous baseline to clear its baseline flag
    if (previousBaseline) {
      await this.prisma.benchmarkRun.update({
        where: { id: previousBaseline.id },
        data: { isBaseline: false },
      });
      this.logger.log(
        `Cleared baseline flag from previous baseline run ${previousBaseline.id}`,
      );
    }

    // Promote the run to baseline
    await this.prisma.benchmarkRun.update({
      where: { id: runId },
      data: {
        isBaseline: true,
        baselineThresholds: dto.thresholds ? (dto.thresholds as never) : null,
      },
    });

    // Create audit log
    await this.createAuditLog(runId, "baseline_promoted" as never, {
      definitionId: run.definitionId,
      projectId: run.projectId,
      previousBaselineId: previousBaseline?.id || null,
      thresholds: dto.thresholds || null,
    });

    this.logger.log(`Run ${runId} promoted to baseline`);

    return {
      runId,
      isBaseline: true,
      previousBaselineId: previousBaseline?.id || null,
      thresholds: dto.thresholds || null,
    };
  }

  /**
   * Compare a run against the baseline for its definition
   *
   * This is called when a run completes to check if it regresses below baseline thresholds.
   */
  async compareAgainstBaseline(
    runId: string,
  ): Promise<BaselineComparison | null> {
    this.logger.log(`Comparing run ${runId} against baseline`);

    // Get the run
    const run = await this.prisma.benchmarkRun.findUnique({
      where: { id: runId },
    });

    if (!run) {
      throw new NotFoundException(`Run with ID "${runId}" not found`);
    }

    // Find the baseline run for this definition
    const baseline = await this.prisma.benchmarkRun.findFirst({
      where: {
        definitionId: run.definitionId,
        isBaseline: true,
      },
    });

    // No baseline exists yet
    if (!baseline) {
      this.logger.debug(`No baseline found for definition ${run.definitionId}`);
      return null;
    }

    // Don't compare baseline against itself
    if (baseline.id === runId) {
      this.logger.debug("Run is the baseline itself, skipping comparison");
      return null;
    }

    const currentMetrics = run.metrics as Record<string, unknown>;
    const baselineMetrics = baseline.metrics as Record<string, unknown>;
    const thresholds =
      (baseline.baselineThresholds as unknown as MetricThreshold[]) || [];

    const metricComparisons: MetricComparison[] = [];
    const regressedMetrics: string[] = [];

    // Compare each metric that exists in both runs
    for (const metricName of Object.keys(currentMetrics)) {
      const currentValue = currentMetrics[metricName];
      const baselineValue = baselineMetrics[metricName];

      // Skip non-numeric metrics
      if (
        typeof currentValue !== "number" ||
        typeof baselineValue !== "number"
      ) {
        continue;
      }

      const delta = currentValue - baselineValue;
      const deltaPercent =
        baselineValue !== 0 ? (delta / baselineValue) * 100 : 0;

      // Find threshold for this metric
      const threshold = thresholds.find((t) => t.metricName === metricName);

      let passed = true;

      if (threshold) {
        if (threshold.type === "absolute") {
          // Absolute threshold: current value must be >= threshold value
          passed = currentValue >= threshold.value;
        } else if (threshold.type === "relative") {
          // Relative threshold: current value must be >= (baseline * threshold value)
          passed = currentValue >= baselineValue * threshold.value;
        }

        if (!passed) {
          regressedMetrics.push(metricName);
        }
      }

      metricComparisons.push({
        metricName,
        currentValue,
        baselineValue,
        delta,
        deltaPercent,
        passed,
        threshold,
      });
    }

    const comparison: BaselineComparison = {
      baselineRunId: baseline.id,
      overallPassed: regressedMetrics.length === 0,
      metricComparisons,
      regressedMetrics,
    };

    // Update the run with comparison results
    await this.prisma.benchmarkRun.update({
      where: { id: runId },
      data: {
        baselineComparison: comparison as never,
        tags: {
          ...(run.tags as Record<string, unknown>),
          ...(regressedMetrics.length > 0 ? { regression: "true" } : {}),
        } as never,
      },
    });

    this.logger.log(
      `Baseline comparison complete: ${regressedMetrics.length > 0 ? `FAILED (${regressedMetrics.join(", ")})` : "PASSED"}`,
    );

    return comparison;
  }

  /**
   * Get per-sample results with filtering and pagination
   *
   * Allows filtering by metadata dimensions and fetching individual sample results.
   * Used for slicing, filtering, and drill-down UI.
   */
  async getPerSampleResults(
    projectId: string,
    runId: string,
    filters: Record<string, string | number> = {},
    page = 1,
    limit = 20,
  ): Promise<PerSampleResultsResponseDto> {
    this.logger.log(`Getting per-sample results for run ${runId}`);

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
        `Per-sample results are only available for completed runs. Run status is "${run.status}".`,
      );
    }

    const metrics = run.metrics as Record<string, unknown>;

    // Extract per-sample results from metrics
    const allResults = (metrics.perSampleResults || []) as Array<{
      sampleId: string;
      metadata?: Record<string, unknown>;
      metrics?: Record<string, number>;
      diagnostics?: Record<string, unknown>;
      groundTruth?: unknown;
      prediction?: unknown;
      evaluationDetails?: unknown;
    }>;

    // Collect available dimensions and their values
    const dimensionValuesMap = new Map<string, Set<string | number>>();

    for (const result of allResults) {
      if (result.metadata) {
        for (const [key, value] of Object.entries(result.metadata)) {
          if (!dimensionValuesMap.has(key)) {
            dimensionValuesMap.set(key, new Set());
          }
          if (typeof value === "string" || typeof value === "number") {
            dimensionValuesMap.get(key)!.add(value);
          } else if (typeof value === "boolean") {
            // Convert boolean to string for filtering
            dimensionValuesMap.get(key)!.add(String(value));
          }
        }
      }
    }

    const availableDimensions = Array.from(dimensionValuesMap.keys()).sort();
    const dimensionValues: Record<string, Array<string | number>> = {};
    for (const [key, values] of dimensionValuesMap.entries()) {
      dimensionValues[key] = Array.from(values).sort();
    }

    // Apply filters
    let filteredResults = allResults;
    if (Object.keys(filters).length > 0) {
      filteredResults = allResults.filter((result) => {
        if (!result.metadata) return false;
        for (const [key, value] of Object.entries(filters)) {
          if (result.metadata[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    // Pagination
    const total = filteredResults.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedResults = filteredResults.slice(offset, offset + limit);

    // Map to DTO
    const results: PerSampleResultDto[] = paginatedResults.map((result) => ({
      sampleId: result.sampleId,
      metadata: result.metadata || {},
      metrics: result.metrics || {},
      diagnostics: result.diagnostics,
      groundTruth: result.groundTruth,
      prediction: result.prediction,
      evaluationDetails: result.evaluationDetails,
    }));

    return {
      runId: run.id,
      results,
      total,
      page,
      limit,
      totalPages,
      availableDimensions,
      dimensionValues,
    };
  }
}
