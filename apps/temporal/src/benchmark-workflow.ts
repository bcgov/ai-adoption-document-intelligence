/**
 * Benchmark Run Workflow Orchestrator
 *
 * Temporal workflow that orchestrates the full benchmark run lifecycle:
 * 1. Materialize dataset
 * 2. Fan out per document execution
 * 3. Evaluate each sample
 * 4. Aggregate metrics
 * 5. Update BenchmarkRun status
 * 6. Cleanup temporary files
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-022-benchmark-run-workflow.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 4.2, 4.4
 */

import {
  type ActivityOptions,
  ApplicationFailure,
  CancellationScope,
  defineQuery,
  defineSignal,
  isCancellation,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";
import {
  type BenchmarkExecuteInput,
  type BenchmarkExecuteOutput,
  benchmarkExecuteWorkflow,
} from "./activities/benchmark-execute";
import { buildFlatPredictionMapFromCtx } from "./azure-ocr-field-display-value";
import type { DatasetManifest, EvaluationResult } from "./benchmark-types";
import type { GraphWorkflowConfig } from "./graph-workflow-types";

// ---------------------------------------------------------------------------
// Activity Types
// ---------------------------------------------------------------------------

type BenchmarkActivities = {
  "benchmark.materializeDataset": (params: {
    datasetVersionId: string;
  }) => Promise<{ materializedPath: string }>;

  "benchmark.loadDatasetManifest": (params: {
    materializedPath: string;
    datasetVersionId: string;
  }) => Promise<{ manifest: DatasetManifest }>;

  "benchmark.evaluate": (input: {
    sampleId: string;
    inputPaths: string[];
    predictionPaths: string[];
    groundTruthPaths: string[];
    metadata: Record<string, unknown>;
    evaluatorType: string;
    evaluatorConfig: Record<string, unknown>;
  }) => Promise<EvaluationResult>;

  "benchmark.aggregate": (input: {
    results: EvaluationResult[];
    options?: {
      sliceDimensions?: string[];
      failureAnalysis?: {
        topN?: number;
        metricName?: string;
      };
    };
  }) => Promise<{
    overall: {
      totalSamples: number;
      passingSamples: number;
      failingSamples: number;
      passRate: number;
      metrics: Record<
        string,
        {
          name: string;
          mean: number;
          median: number;
          stdDev: number;
          p5: number;
          p25: number;
          p75: number;
          p95: number;
          min: number;
          max: number;
        }
      >;
    };
    failureAnalysis?: {
      totalSamples: number;
      failingSamples: number;
      passRate: number;
      worstSamples: Array<{ sampleId: string; metric: string; value: number }>;
    };
  }>;

  "benchmark.cleanup": (input: {
    materializedDatasetPaths?: string[];
    temporaryOutputPaths?: string[];
    preserveCachedDatasets?: boolean;
  }) => Promise<void>;

  "benchmark.updateRunStatus": (params: {
    runId: string;
    status: string;
    metrics?: Record<string, unknown>;
    error?: string;
    completedAt?: Date;
  }) => Promise<void>;

  "benchmark.writePrediction": (input: {
    predictionData: Record<string, unknown>;
    outputDir: string;
    sampleId: string;
  }) => Promise<{ predictionPath: string }>;

  "benchmark.compareAgainstBaseline": (params: {
    runId: string;
  }) => Promise<unknown>;

  "benchmark.loadOcrCache": (params: {
    sourceRunId: string;
    sampleId: string;
  }) => Promise<{ ocrResponse: unknown | null }>;

  "benchmark.persistOcrCache": (params: {
    sourceRunId: string;
    sampleId: string;
    ocrResponse: unknown;
  }) => Promise<void>;
};

// Default activity options for benchmark activities
const DEFAULT_ACTIVITY_OPTIONS = {
  startToCloseTimeout: "30 minutes",
  retry: {
    initialInterval: "1s",
    maximumInterval: "30s",
    maximumAttempts: 3,
  },
} as const;

// ---------------------------------------------------------------------------
// Workflow Types
// ---------------------------------------------------------------------------

export interface BenchmarkRunWorkflowInput {
  /** Benchmark run ID */
  runId: string;

  /** Dataset version ID to materialize */
  datasetVersionId: string;

  /** Split to run (e.g., 'test', 'validation') */
  splitId?: string;

  /** Sample IDs from the DB split record (used for filtering) */
  sampleIds?: string[];

  /** Pinned workflow version (WorkflowVersion.id) for this run */
  workflowVersionId: string;

  /** Workflow configuration */
  workflowConfig: GraphWorkflowConfig;

  /** SHA-256 hash of workflow config */
  workflowConfigHash: string;

  /** Evaluator type (e.g., 'schema-aware', 'black-box') */
  evaluatorType: string;

  /** Evaluator configuration */
  evaluatorConfig: Record<string, unknown>;

  /** Runtime settings */
  runtimeSettings: {
    maxParallelDocuments?: number;
    timeoutPerDocumentMs?: number;
    activityTimeout?: {
      startToCloseTimeout?: string;
    };
    activityRetry?: {
      initialInterval?: string;
      maximumInterval?: string;
      maximumAttempts?: number;
    };
  };

  /** Persist Azure OCR poll JSON per sample (for later replay). */
  persistOcrCache?: boolean;

  /** Replay OCR from a prior completed run's cache rows (skips Azure submit/poll). */
  ocrCacheBaselineRunId?: string;
}

export interface BenchmarkRunWorkflowResult {
  /** Final status */
  status: "completed" | "failed" | "cancelled";

  /** Flat metrics (metric_name.mean, metric_name.median, etc.) */
  metrics: Record<string, number>;

  /** Full aggregation result for storage */
  aggregateResult?: Record<string, unknown>;

  /** Failure analysis summary */
  failureAnalysis?: Record<string, unknown>;

  /** Error message if failed */
  error?: string;

  /** Total samples processed */
  totalSamples: number;

  /** Successfully executed samples */
  successfulSamples: number;

  /** Failed samples */
  failedSamples: number;
}

export interface BenchmarkRunProgress {
  /** Current phase */
  phase:
    | "materializing"
    | "executing"
    | "evaluating"
    | "aggregating"
    | "cleanup"
    | "completed";

  /** Total samples to process */
  totalSamples: number;

  /** Completed samples */
  completedSamples: number;

  /** Failed samples */
  failedSamples: number;

  /** Percent complete (0-100) */
  percentComplete: number;
}

// Query and Signal definitions
export const getProgress = defineQuery<BenchmarkRunProgress>("getProgress");
export const cancelBenchmarkSignal = defineSignal("cancel");

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Join path segments (deterministic helper for workflow)
 */
function joinPath(...segments: string[]): string {
  return segments.join("/").replace(/\/+/g, "/");
}

/**
 * Flatten AggregatedMetrics into a flat Record<string, number>.
 * Produces keys like: pass_rate, total_samples, metric_name.mean, metric_name.median, etc.
 */
function flattenMetrics(overall: {
  totalSamples: number;
  passingSamples: number;
  failingSamples: number;
  passRate: number;
  metrics: Record<
    string,
    {
      name: string;
      mean: number;
      median: number;
      stdDev: number;
      p5: number;
      p25: number;
      p75: number;
      p95: number;
      min: number;
      max: number;
    }
  >;
}): Record<string, number> {
  const flat: Record<string, number> = {
    total_samples: overall.totalSamples,
    passing_samples: overall.passingSamples,
    failing_samples: overall.failingSamples,
    pass_rate: overall.passRate,
  };

  for (const [key, stats] of Object.entries(overall.metrics)) {
    flat[`${key}.mean`] = stats.mean;
    flat[`${key}.median`] = stats.median;
    flat[`${key}.stdDev`] = stats.stdDev;
    flat[`${key}.p5`] = stats.p5;
    flat[`${key}.p25`] = stats.p25;
    flat[`${key}.p75`] = stats.p75;
    flat[`${key}.p95`] = stats.p95;
    flat[`${key}.min`] = stats.min;
    flat[`${key}.max`] = stats.max;
  }

  return flat;
}

// ---------------------------------------------------------------------------
// Workflow Function
// ---------------------------------------------------------------------------

/**
 * Benchmark Run Workflow
 *
 * Orchestrates dataset materialization, per-document execution,
 * evaluation, aggregation, and cleanup.
 */
export async function benchmarkRunWorkflow(
  input: BenchmarkRunWorkflowInput,
): Promise<BenchmarkRunWorkflowResult> {
  // Progress tracking state
  let currentPhase: BenchmarkRunProgress["phase"] = "materializing";
  let totalSamples = 0;
  let completedSamples = 0;
  let failedSamples = 0;
  let cancelled = false;

  // Set up query handlers
  setHandler(
    getProgress,
    (): BenchmarkRunProgress => ({
      phase: currentPhase,
      totalSamples,
      completedSamples,
      failedSamples,
      percentComplete:
        totalSamples > 0
          ? Math.round((completedSamples / totalSamples) * 100)
          : 0,
    }),
  );

  // Set up cancel signal handler
  setHandler(cancelBenchmarkSignal, () => {
    cancelled = true;
  });

  const {
    runId,
    datasetVersionId,
    splitId,
    sampleIds,
    workflowConfig,
    workflowConfigHash,
    evaluatorType,
    evaluatorConfig,
    runtimeSettings,
    persistOcrCache = false,
    ocrCacheBaselineRunId,
  } = input;

  // Create activity proxy with configurable timeouts and retries (US-023 Scenario 4 & 5)
  const customActivityOptions = {
    startToCloseTimeout:
      runtimeSettings.activityTimeout?.startToCloseTimeout ||
      DEFAULT_ACTIVITY_OPTIONS.startToCloseTimeout,
    retry: {
      initialInterval:
        runtimeSettings.activityRetry?.initialInterval ||
        DEFAULT_ACTIVITY_OPTIONS.retry.initialInterval,
      maximumInterval:
        runtimeSettings.activityRetry?.maximumInterval ||
        DEFAULT_ACTIVITY_OPTIONS.retry.maximumInterval,
      maximumAttempts:
        runtimeSettings.activityRetry?.maximumAttempts ??
        DEFAULT_ACTIVITY_OPTIONS.retry.maximumAttempts,
    },
  };

  const customActivities = proxyActivities<BenchmarkActivities>(
    customActivityOptions as ActivityOptions,
  );

  let materializedPath: string | undefined;
  const outputPaths: string[] = [];
  let flatMetrics: Record<string, number> = {};
  let aggregateResultForStorage: Record<string, unknown> = {};
  let failureAnalysis: Record<string, unknown> | undefined;

  try {
    // Update run status to running
    await customActivities["benchmark.updateRunStatus"]({
      runId,
      status: "running",
    });

    // ---------------------------------------------------------------------------
    // Phase 1: Materialize Dataset
    // ---------------------------------------------------------------------------
    currentPhase = "materializing";

    const { materializedPath: matPath } = await customActivities[
      "benchmark.materializeDataset"
    ]({
      datasetVersionId,
    });
    materializedPath = matPath;

    // Load manifest via activity
    const { manifest } = await customActivities[
      "benchmark.loadDatasetManifest"
    ]({
      materializedPath,
      datasetVersionId,
    });

    // Determine which samples to process (based on sampleIds from DB split)
    let samplesToProcess = manifest.samples;
    if (sampleIds && sampleIds.length > 0) {
      samplesToProcess = manifest.samples.filter((s) =>
        sampleIds.includes(s.id),
      );
    }

    totalSamples = samplesToProcess.length;

    if (totalSamples === 0) {
      throw ApplicationFailure.create({
        message: `No samples found in dataset for split: ${splitId || "default"}`,
        nonRetryable: true,
      });
    }

    // ---------------------------------------------------------------------------
    // Phase 2 & 3: Fan-out execution and evaluation
    // ---------------------------------------------------------------------------
    currentPhase = "executing";

    const maxParallel = runtimeSettings.maxParallelDocuments || 10;
    const timeoutMs = runtimeSettings.timeoutPerDocumentMs || 300000; // 5 min default

    const childTaskQueue = "benchmark-processing";

    const evaluationResults: EvaluationResult[] = [];

    // Process samples in batches with concurrency control
    for (let i = 0; i < samplesToProcess.length; i += maxParallel) {
      if (cancelled) {
        break;
      }

      const batch = samplesToProcess.slice(i, i + maxParallel);

      // Execute batch in parallel (within cancellation scope for graceful shutdown)
      const batchResults = await CancellationScope.cancellable(async () => {
        return await Promise.all(
          batch.map(async (sample) => {
            try {
              // Build input paths
              const inputPaths = sample.inputs.map((input) =>
                joinPath(materializedPath!, input.path),
              );

              // Build ground truth paths
              const groundTruthPaths = sample.groundTruth.map((gt) =>
                joinPath(materializedPath!, gt.path),
              );

              // Output directory for this sample
              const outputBaseDir = joinPath(
                materializedPath!,
                ".benchmark-outputs",
                sample.id,
              );

              let ocrCachePayload: { ocrResponse: unknown } | undefined;
              if (ocrCacheBaselineRunId) {
                const loaded = await customActivities["benchmark.loadOcrCache"](
                  {
                    sourceRunId: ocrCacheBaselineRunId,
                    sampleId: sample.id,
                  },
                );
                if (
                  loaded.ocrResponse === null ||
                  loaded.ocrResponse === undefined
                ) {
                  throw ApplicationFailure.create({
                    message:
                      `OCR cache miss for sample ${sample.id} (baseline run ${ocrCacheBaselineRunId}). ` +
                      `Run a completed benchmark on this definition with persistOcrCache: true first.`,
                    nonRetryable: true,
                  });
                }
                ocrCachePayload = { ocrResponse: loaded.ocrResponse };
              }

              // Execute workflow for this sample
              const executeInput: BenchmarkExecuteInput = {
                sampleId: sample.id,
                workflowConfig,
                configHash: workflowConfigHash,
                inputPaths,
                outputBaseDir,
                sampleMetadata: {
                  ...sample.metadata,
                  ...(ocrCachePayload
                    ? { __benchmarkOcrCache: ocrCachePayload }
                    : {}),
                },
                timeoutMs,
                taskQueue: childTaskQueue,
              };

              const executeOutput =
                await benchmarkExecuteWorkflow(executeInput);

              if (
                executeOutput.success &&
                persistOcrCache &&
                executeOutput.workflowResult?.ctx?.ocrResponse != null
              ) {
                await customActivities["benchmark.persistOcrCache"]({
                  sourceRunId: runId,
                  sampleId: sample.id,
                  ocrResponse: executeOutput.workflowResult.ctx.ocrResponse,
                });
              }

              return {
                sample,
                executeOutput,
                inputPaths,
                groundTruthPaths,
              };
            } catch (error) {
              // Record execution failure
              return {
                sample,
                executeOutput: {
                  sampleId: sample.id,
                  success: false,
                  outputPaths: [],
                  error: {
                    message:
                      error instanceof Error ? error.message : String(error),
                    type: "EXECUTION_ERROR",
                  },
                  durationMs: 0,
                } as BenchmarkExecuteOutput,
                inputPaths: [],
                groundTruthPaths: [],
              };
            }
          }),
        );
      });

      // Evaluate batch results
      currentPhase = "evaluating";

      for (const result of batchResults) {
        if (cancelled) {
          break;
        }

        const { sample, executeOutput, inputPaths, groundTruthPaths } = result;

        // Only evaluate if execution succeeded
        if (executeOutput.success) {
          try {
            // Extract prediction fields from the workflow ctx and write to disk
            // so the evaluator can compare against ground truth files.
            const predictionData = buildFlatPredictionMapFromCtx(
              executeOutput.workflowResult?.ctx ?? {},
            );

            const { predictionPath } = await customActivities[
              "benchmark.writePrediction"
            ]({
              predictionData,
              outputDir: joinPath(
                materializedPath!,
                ".benchmark-outputs",
                sample.id,
              ),
              sampleId: sample.id,
            });

            const evaluationResult = await customActivities[
              "benchmark.evaluate"
            ]({
              sampleId: sample.id,
              inputPaths,
              predictionPaths: [predictionPath],
              groundTruthPaths,
              metadata: sample.metadata,
              evaluatorType,
              evaluatorConfig,
            });

            evaluationResults.push(evaluationResult);

            if (!evaluationResult.pass) {
              failedSamples++;
            }
          } catch (error) {
            // Evaluation failed - record as failed sample
            failedSamples++;
            evaluationResults.push({
              sampleId: sample.id,
              metrics: {},
              diagnostics: {
                error: error instanceof Error ? error.message : String(error),
              },
              pass: false,
            });
          }
        } else {
          // Execution failed - record as failed sample
          failedSamples++;
          evaluationResults.push({
            sampleId: sample.id,
            metrics: {},
            diagnostics: {
              executionError: executeOutput.error?.message || "Unknown error",
            },
            pass: false,
          });
        }

        completedSamples++;

        // Collect output paths for cleanup
        outputPaths.push(...executeOutput.outputPaths);
      }

      currentPhase = "executing"; // Back to executing for next batch
    }

    // Check if cancelled
    if (cancelled) {
      currentPhase = "cleanup";

      // Clean up temporary files
      if (materializedPath) {
        await customActivities["benchmark.cleanup"]({
          materializedDatasetPaths: [materializedPath],
          temporaryOutputPaths: outputPaths,
          preserveCachedDatasets: true,
        });
      }

      // Update run status
      await customActivities["benchmark.updateRunStatus"]({
        runId,
        status: "cancelled",
        completedAt: new Date(),
      });

      return {
        status: "cancelled",
        metrics: {},
        totalSamples,
        successfulSamples: completedSamples - failedSamples,
        failedSamples,
      };
    }

    // ---------------------------------------------------------------------------
    // Phase 4: Aggregate Metrics
    // ---------------------------------------------------------------------------
    currentPhase = "aggregating";

    const aggregateResult = await customActivities["benchmark.aggregate"]({
      results: evaluationResults,
      options: {
        failureAnalysis: { topN: 10 },
      },
    });

    flatMetrics = flattenMetrics(aggregateResult.overall);
    failureAnalysis = aggregateResult.failureAnalysis as unknown as Record<
      string,
      unknown
    >;

    // Build the stored metrics object: flat metrics at the top level for baseline
    // comparison, plus structured data for drill-down and per-sample browsing.
    aggregateResultForStorage = {
      ...flatMetrics,
      _aggregate: aggregateResult as unknown as Record<string, unknown>,
      perSampleResults: evaluationResults.map((er) => ({
        sampleId: er.sampleId,
        metrics: er.metrics,
        diagnostics: er.diagnostics,
        pass: er.pass,
        artifacts: er.artifacts,
        groundTruth: er.groundTruth,
        prediction: er.prediction,
        evaluationDetails: er.evaluationDetails,
      })),
    };

    // ---------------------------------------------------------------------------
    // Phase 5: Update BenchmarkRun Status
    // ---------------------------------------------------------------------------
    await customActivities["benchmark.updateRunStatus"]({
      runId,
      status: "completed",
      metrics: aggregateResultForStorage,
      completedAt: new Date(),
    });

    // ---------------------------------------------------------------------------
    // Phase 5a: Compare Against Baseline
    // ---------------------------------------------------------------------------
    try {
      await customActivities["benchmark.compareAgainstBaseline"]({
        runId,
      });
    } catch (error) {
      // Don't fail the run if baseline comparison fails
      console.error(
        JSON.stringify({
          workflow: "benchmarkRunWorkflow",
          event: "baseline_comparison_failed",
          runId,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    }

    // ---------------------------------------------------------------------------
    // Phase 6: Cleanup
    // ---------------------------------------------------------------------------
    currentPhase = "cleanup";

    await customActivities["benchmark.cleanup"]({
      materializedDatasetPaths: [], // Keep cached datasets
      temporaryOutputPaths: outputPaths,
      preserveCachedDatasets: true,
    });

    currentPhase = "completed";

    return {
      status: "completed",
      metrics: flatMetrics,
      aggregateResult: aggregateResultForStorage,
      failureAnalysis,
      totalSamples,
      successfulSamples: completedSamples - failedSamples,
      failedSamples,
    };
  } catch (error) {
    if (isCancellation(error)) {
      // Handle cancellation
      currentPhase = "cleanup";

      // Clean up temporary files
      if (materializedPath) {
        await customActivities["benchmark.cleanup"]({
          materializedDatasetPaths: [],
          temporaryOutputPaths: outputPaths,
          preserveCachedDatasets: true,
        });
      }

      // Update run status
      await customActivities["benchmark.updateRunStatus"]({
        runId,
        status: "cancelled",
        completedAt: new Date(),
      });

      return {
        status: "cancelled",
        metrics: flatMetrics,
        totalSamples,
        successfulSamples: completedSamples - failedSamples,
        failedSamples,
      };
    }

    // Handle failure
    const errorMessage = error instanceof Error ? error.message : String(error);

    currentPhase = "cleanup";

    // Clean up temporary files
    if (materializedPath) {
      await customActivities["benchmark.cleanup"]({
        materializedDatasetPaths: [],
        temporaryOutputPaths: outputPaths,
        preserveCachedDatasets: true,
      });
    }

    // Update run status
    await customActivities["benchmark.updateRunStatus"]({
      runId,
      status: "failed",
      error: errorMessage,
      metrics: aggregateResultForStorage,
      completedAt: new Date(),
    });

    return {
      status: "failed",
      error: errorMessage,
      metrics: flatMetrics,
      failureAnalysis,
      totalSamples,
      successfulSamples: completedSamples - failedSamples,
      failedSamples,
    };
  }
}
