/**
 * Benchmark Run Service
 *
 * Manages benchmark run lifecycle: creation, execution, cancellation, and results retrieval.
 * Orchestrates interactions between Prisma and Temporal.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 2.6, 4.2, 4.5, 11.2
 */

import { Prisma } from "@generated/client";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "crypto";
import { execSync } from "child_process";
import { PrismaService } from "@/database/prisma.service";
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
import { DatasetService } from "./dataset.service";

@Injectable()
export class BenchmarkRunService {
  private readonly logger = new Logger(BenchmarkRunService.name);
  private readonly prisma;

  constructor(
    private readonly prismaService: PrismaService,
    private benchmarkTemporal: BenchmarkTemporalService,
    private datasetService: DatasetService,
  ) {
    this.prisma = this.prismaService.prisma;
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
          metadata: metadata as Prisma.InputJsonValue,
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
   * and marks the definition as immutable.
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

    // Verify the dataset version has files uploaded (storage prefix)
    if (!definition.datasetVersion.storagePrefix) {
      throw new BadRequestException(
        `Cannot start a run: dataset version "${definition.datasetVersionId}" has no files uploaded`,
      );
    }

    // Validate the dataset version before starting the run
    const validation = await this.datasetService.validateDatasetVersion(
      definition.datasetVersion.datasetId,
      definition.datasetVersionId,
      {},
    );

    if (!validation.valid) {
      const errorCount = validation.issueCount.schemaViolations +
        validation.issueCount.missingGroundTruth +
        validation.issueCount.corruption;
      const errorIssues = validation.issues.filter(
        (issue) => issue.severity === "error",
      );
      throw new BadRequestException(
        `Cannot start a run: dataset validation failed with ${errorCount} error(s). ` +
        `Issues: ${errorIssues.slice(0, 5).map((i) => i.message).join("; ")}` +
        (errorIssues.length > 5 ? ` ... and ${errorIssues.length - 5} more` : ""),
      );
    }

    // Get worker git SHA and image digest
    const workerGitSha = this.getWorkerGitSha();
    const workerImageDigest = this.getWorkerImageDigest();

    const runTags = dto.tags || {};

    // Create BenchmarkRun record with status 'pending'
    const run = await this.prisma.benchmarkRun.create({
      data: {
        definitionId,
        projectId,
        status: "pending",
        temporalWorkflowId: "", // Will be updated after starting workflow
        workerGitSha,
        workerImageDigest,
        params: {
          runtimeSettings: {
            ...(definition.runtimeSettings as Record<string, unknown>),
            ...(dto.runtimeSettingsOverride || {}),
          },
        } as Prisma.InputJsonValue,
        tags: runTags as Prisma.InputJsonValue,
      },
      include: {
        definition: true,
      },
    });

    this.logger.log(`Created benchmark run record: ${run.id}`);

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
          splitId: definition.splitId ?? undefined,
          sampleIds: definition.split
            ? (definition.split.sampleIds as string[])
            : undefined,
          workflowId: definition.workflowId,
          workflowConfig: definition.workflow.config as Record<string, unknown>,
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

    // Mark definition as immutable and freeze the dataset version
    await this.prisma.benchmarkDefinition.update({
      where: { id: definitionId },
      data: { immutable: true },
    });

    await this.prisma.datasetVersion.update({
      where: { id: definition.datasetVersionId },
      data: { frozen: true },
    });

    // Freeze the referenced split if one is set
    if (definition.splitId) {
      await this.prisma.split.update({
        where: { id: definition.splitId },
        data: { frozen: true },
      });
    }

    // Create audit log
    await this.createAuditLog(run.id, "run_started", {
      definitionId,
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
   * Delete a benchmark run.
   *
   * Only completed, failed or cancelled runs can be deleted.
   * Running/pending runs must be cancelled first.
   * @param projectId - The project this run belongs to
   * @param runId - The run ID to delete
   * @throws NotFoundException if the run does not exist
   * @throws BadRequestException if the run is still active
   */
  async deleteRun(projectId: string, runId: string): Promise<void> {
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

    if (run.status === "running" || run.status === "pending") {
      throw new BadRequestException(
        `Cannot delete run in status "${run.status}". Cancel the run first.`,
      );
    }

    await this.prisma.benchmarkRun.delete({
      where: { id: runId },
    });

    this.logger.log(
      `Deleted benchmark run ${runId} from project ${projectId}`,
    );
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

    // Extract only flat numeric metrics for the summary response.
    // Structured data (_aggregate, perSampleResults) is accessible via
    // dedicated getDrillDown and getPerSampleResults endpoints.
    const rawMetrics = (run.metrics || {}) as Record<string, unknown>;
    const flatMetrics: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawMetrics)) {
      if (key !== "_aggregate" && key !== "perSampleResults" && typeof value === "number") {
        flatMetrics[key] = value;
      }
    }

    return {
      id: run.id,
      definitionId: run.definitionId,
      definitionName: run.definition.name,
      projectId: run.projectId,
      status: run.status,
      temporalWorkflowId: run.temporalWorkflowId,
      workerImageDigest: run.workerImageDigest,
      workerGitSha: run.workerGitSha,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      metrics: flatMetrics,
      params: run.params as Record<string, unknown>,
      tags: run.tags as Record<string, unknown>,
      error: run.error,
      isBaseline: run.isBaseline,
      baselineThresholds: run.baselineThresholds as MetricThreshold[] | null,
      baselineComparison: run.baselineComparison as BaselineComparison | null,
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

      const rawMetrics = run.metrics as Record<string, unknown>;
      const flatOnlyMetrics: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(rawMetrics || {})) {
        if (key !== "_aggregate" && key !== "perSampleResults" && typeof value === "number") {
          flatOnlyMetrics[key] = value;
        }
      }
      const headlineMetrics = run.status === "completed" ? flatOnlyMetrics : null;

      // Check for regression status
      const baselineComparison = run.baselineComparison as BaselineComparison | null;
      const hasRegression = baselineComparison ? !baselineComparison.overallPassed : undefined;
      const regressedMetricCount = baselineComparison ? baselineComparison.regressedMetrics.length : undefined;

      return {
        id: run.id,
        definitionId: run.definitionId,
        definitionName: run.definition.name,
        status: run.status,
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

    // Extract per-sample results from stored metrics
    const perSampleResults = (metrics.perSampleResults || []) as Array<{
      sampleId: string;
      metrics?: Record<string, number>;
      diagnostics?: Record<string, unknown>;
      pass: boolean;
    }>;

    // Extract the aggregate failure analysis (populated by workflow with options.failureAnalysis)
    const aggregate = (metrics._aggregate || {}) as Record<string, unknown>;
    const storedFailureAnalysis = (aggregate.failureAnalysis || {}) as {
      worstSamples?: Array<{
        sampleId: string;
        metricValue: number;
        metrics: Record<string, number>;
        diagnostics: Record<string, unknown>;
      }>;
      perFieldErrors?: Array<{
        field: string;
        totalOccurrences: number;
        matchCount: number;
        missingCount: number;
        mismatchCount: number;
        errorRate: number;
      }>;
    };

    // Build worst-performing samples from failure analysis or from per-sample results
    let worstSamples: SampleFailureDto[] = [];
    if (
      storedFailureAnalysis.worstSamples &&
      storedFailureAnalysis.worstSamples.length > 0
    ) {
      worstSamples = storedFailureAnalysis.worstSamples.map((ws) => {
        const metricEntries = Object.entries(ws.metrics || {});
        const firstMetric = metricEntries[0];
        return {
          sampleId: ws.sampleId,
          metricValue: firstMetric ? firstMetric[1] : ws.metricValue,
          metricName: firstMetric ? firstMetric[0] : "unknown",
          metadata: ws.diagnostics,
        };
      });
    } else {
      // Fallback: derive from per-sample results (failing samples sorted by first metric)
      worstSamples = perSampleResults
        .filter((r) => !r.pass)
        .map((r) => {
          const metricEntries = Object.entries(r.metrics || {});
          const firstMetric = metricEntries[0];
          return {
            sampleId: r.sampleId,
            metricValue: firstMetric ? firstMetric[1] : 0,
            metricName: firstMetric ? firstMetric[0] : "unknown",
            metadata: r.diagnostics,
          };
        })
        .sort((a, b) => a.metricValue - b.metricValue)
        .slice(0, 10);
    }

    // Extract per-field error breakdown from failure analysis
    const fieldErrorBreakdown: FieldErrorBreakdownDto[] | null =
      storedFailureAnalysis.perFieldErrors
        ? storedFailureAnalysis.perFieldErrors.map((fe) => ({
            fieldName: fe.field,
            errorCount: fe.missingCount + fe.mismatchCount,
            errorRate: fe.errorRate,
          }))
        : null;

    // Build aggregated metrics (only the flat numeric values)
    const aggregatedMetrics: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metrics)) {
      if (key !== "_aggregate" && key !== "perSampleResults" && typeof value === "number") {
        aggregatedMetrics[key] = value;
      }
    }

    return {
      runId: run.id,
      aggregatedMetrics,
      worstSamples,
      fieldErrorBreakdown,
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
        baselineThresholds: dto.thresholds ? (dto.thresholds as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    // Create audit log
    await this.createAuditLog(runId, "baseline_promoted", {
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
      (baseline.baselineThresholds as MetricThreshold[]) || [];

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
        baselineComparison: comparison as unknown as Prisma.InputJsonValue,
        tags: {
          ...(run.tags as Record<string, unknown>),
          ...(regressedMetrics.length > 0 ? { regression: "true" } : {}),
        } as Prisma.InputJsonValue,
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
      pass?: boolean;
      groundTruth?: unknown;
      prediction?: unknown;
      evaluationDetails?: unknown;
    }>;

    // Collect available dimensions: metadata keys plus "pass" as a synthetic dimension
    const dimensionValuesMap = new Map<string, Set<string | number>>();
    dimensionValuesMap.set("pass", new Set(["true", "false"]));

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

    // Apply filters (supports metadata keys and the synthetic "pass" dimension)
    let filteredResults = allResults;
    if (Object.keys(filters).length > 0) {
      filteredResults = allResults.filter((result) => {
        for (const [key, value] of Object.entries(filters)) {
          if (key === "pass") {
            const passBool = value === "true";
            if (result.pass !== passBool) return false;
          } else {
            if (!result.metadata || result.metadata[key] !== value) return false;
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
      pass: result.pass ?? false,
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
