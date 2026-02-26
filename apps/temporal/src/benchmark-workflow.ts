/**
 * Benchmark Run Workflow Orchestrator
 *
 * Temporal workflow that orchestrates the full benchmark run lifecycle:
 * 1. Materialize dataset
 * 2. Fan out per document execution
 * 3. Evaluate each sample
 * 4. Aggregate metrics
 * 5. Log to MLflow
 * 6. Update BenchmarkRun status
 * 7. Cleanup temporary files
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-022-benchmark-run-workflow.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 4.2, 4.4
 */

import {
  defineQuery,
  defineSignal,
  setHandler,
  proxyActivities,
  CancellationScope,
  isCancellation,
  ApplicationFailure,
} from '@temporalio/workflow';
import type { GraphWorkflowConfig } from './graph-workflow-types';
import type { EvaluationResult } from './benchmark-types';
import {
  benchmarkExecuteWorkflow,
  type BenchmarkExecuteInput,
  type BenchmarkExecuteOutput,
} from './activities/benchmark-execute';

// ---------------------------------------------------------------------------
// Activity Types
// ---------------------------------------------------------------------------

type BenchmarkActivities = {
  'benchmark.materializeDataset': (params: {
    datasetVersionId: string;
  }) => Promise<{ materializedPath: string }>;

  'benchmark.loadDatasetManifest': (params: {
    materializedPath: string;
    datasetVersionId: string;
  }) => Promise<{ manifest: DatasetManifest }>;

  'benchmark.evaluate': (input: {
    sampleId: string;
    inputPaths: string[];
    predictionPaths: string[];
    groundTruthPaths: string[];
    metadata: Record<string, unknown>;
    evaluatorType: string;
    evaluatorConfig: Record<string, unknown>;
  }) => Promise<EvaluationResult>;

  'benchmark.aggregate': (input: {
    results: EvaluationResult[];
    metadata?: Record<string, unknown>;
  }) => Promise<{
    overall: {
      totalSamples: number;
      passingsSamples: number;
      failingSamples: number;
      passRate: number;
      metrics: Record<string, {
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
      }>;
    };
    failureAnalysis?: {
      totalSamples: number;
      failingSamples: number;
      passRate: number;
      worstSamples: Array<{ sampleId: string; metric: string; value: number }>;
      errorClusters: Array<{ pattern: string; count: number; sampleIds: string[] }>;
    };
  }>;

  'benchmark.logToMlflow': (input: {
    mlflowRunId: string;
    params: Record<string, string>;
    metrics: Record<string, number>;
    tags: Record<string, string>;
    artifactPaths?: string[];
    status: 'FINISHED' | 'FAILED';
  }) => Promise<void>;

  'benchmark.cleanup': (input: {
    materializedDatasetPaths?: string[];
    temporaryOutputPaths?: string[];
    preserveCachedDatasets?: boolean;
  }) => Promise<void>;

  'benchmark.updateRunStatus': (params: {
    runId: string;
    status: string;
    metrics?: Record<string, unknown>;
    error?: string;
    completedAt?: Date;
  }) => Promise<void>;

  'benchmark.compareAgainstBaseline': (params: {
    runId: string;
  }) => Promise<unknown>;
};

// Default activity options for benchmark activities
const DEFAULT_ACTIVITY_OPTIONS = {
  startToCloseTimeout: '30 minutes',
  retry: {
    initialInterval: '1s',
    maximumInterval: '30s',
    maximumAttempts: 3,
  },
};

const activities = proxyActivities<BenchmarkActivities>(DEFAULT_ACTIVITY_OPTIONS);

// ---------------------------------------------------------------------------
// Workflow Types
// ---------------------------------------------------------------------------

export interface DatasetManifest {
  schemaVersion: string;
  samples: Array<{
    id: string;
    inputs: Array<{ path: string; mimeType: string }>;
    groundTruth: Array<{ path: string; format: string }>;
    metadata: Record<string, unknown>;
  }>;
  splits?: {
    train?: string[];
    validation?: string[];
    test?: string[];
    [splitName: string]: string[] | undefined;
  };
}

export interface BenchmarkRunWorkflowInput {
  /** Benchmark run ID */
  runId: string;

  /** Benchmark definition ID */
  definitionId: string;

  /** Benchmark project ID */
  projectId: string;

  /** Dataset version ID to materialize */
  datasetVersionId: string;

  /** Git revision for dataset versioning */
  gitRevision: string;

  /** Split to run (e.g., 'test', 'validation') */
  splitId?: string;

  /** Workflow ID to execute per document */
  workflowId: string;

  /** Workflow configuration */
  workflowConfig: GraphWorkflowConfig;

  /** SHA-256 hash of workflow config */
  workflowConfigHash: string;

  /** Evaluator type (e.g., 'schema-aware', 'black-box') */
  evaluatorType: string;

  /** Evaluator configuration */
  evaluatorConfig: Record<string, unknown>;

  /** Hash of evaluator config */
  evaluatorConfigHash: string;

  /** MLflow run ID for logging */
  mlflowRunId: string;

  /** Worker image digest */
  workerImageDigest?: string;

  /** Worker git SHA */
  workerGitSha: string;

  /** Runtime settings */
  runtimeSettings: {
    maxParallelDocuments?: number;
    timeoutPerDocumentMs?: number;
    useProductionQueue?: boolean;
    activityTimeout?: {
      startToCloseTimeout?: string;
    };
    activityRetry?: {
      initialInterval?: string;
      maximumInterval?: string;
      maximumAttempts?: number;
    };
  };

  /** Artifact policy ('full', 'failures_only', 'sampled') */
  artifactPolicy: string;
}

export interface BenchmarkRunWorkflowResult {
  /** Final status */
  status: 'completed' | 'failed' | 'cancelled';

  /** Flat metrics for MLflow (metric_name.mean, metric_name.median, etc.) */
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
    | 'materializing'
    | 'executing'
    | 'evaluating'
    | 'aggregating'
    | 'logging'
    | 'cleanup'
    | 'completed';

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
export const getProgress = defineQuery<BenchmarkRunProgress>('getProgress');
export const cancelBenchmarkSignal = defineSignal('cancel');

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Join path segments (deterministic helper for workflow)
 */
function joinPath(...segments: string[]): string {
  return segments.join('/').replace(/\/+/g, '/');
}

/**
 * Flatten AggregatedMetrics into a flat Record<string, number> for MLflow.
 * Produces keys like: pass_rate, total_samples, metric_name.mean, metric_name.median, etc.
 */
function flattenMetrics(overall: {
  totalSamples: number;
  passingsSamples: number;
  failingSamples: number;
  passRate: number;
  metrics: Record<string, { name: string; mean: number; median: number; stdDev: number; p5: number; p25: number; p75: number; p95: number; min: number; max: number }>;
}): Record<string, number> {
  const flat: Record<string, number> = {
    total_samples: overall.totalSamples,
    passing_samples: overall.passingsSamples,
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
 * evaluation, aggregation, MLflow logging, and cleanup.
 */
export async function benchmarkRunWorkflow(
  input: BenchmarkRunWorkflowInput,
): Promise<BenchmarkRunWorkflowResult> {
  // Progress tracking state
  let currentPhase: BenchmarkRunProgress['phase'] = 'materializing';
  let totalSamples = 0;
  let completedSamples = 0;
  let failedSamples = 0;
  let cancelled = false;

  // Set up query handlers
  setHandler(getProgress, (): BenchmarkRunProgress => ({
    phase: currentPhase,
    totalSamples,
    completedSamples,
    failedSamples,
    percentComplete:
      totalSamples > 0 ? Math.round((completedSamples / totalSamples) * 100) : 0,
  }));

  // Set up cancel signal handler
  setHandler(cancelBenchmarkSignal, () => {
    cancelled = true;
  });

  const {
    runId,
    definitionId,
    projectId,
    datasetVersionId,
    gitRevision,
    splitId,
    workflowConfig,
    workflowConfigHash,
    evaluatorType,
    evaluatorConfig,
    evaluatorConfigHash,
    mlflowRunId,
    workerImageDigest,
    workerGitSha,
    runtimeSettings,
    artifactPolicy,
  } = input;

  // Create activity proxy with configurable timeouts and retries (US-023 Scenario 4 & 5)
  const customActivityOptions = {
    startToCloseTimeout: runtimeSettings.activityTimeout?.startToCloseTimeout || DEFAULT_ACTIVITY_OPTIONS.startToCloseTimeout,
    retry: {
      initialInterval: runtimeSettings.activityRetry?.initialInterval || DEFAULT_ACTIVITY_OPTIONS.retry.initialInterval,
      maximumInterval: runtimeSettings.activityRetry?.maximumInterval || DEFAULT_ACTIVITY_OPTIONS.retry.maximumInterval,
      maximumAttempts: runtimeSettings.activityRetry?.maximumAttempts ?? DEFAULT_ACTIVITY_OPTIONS.retry.maximumAttempts,
    },
  };

  const customActivities = proxyActivities<BenchmarkActivities>(customActivityOptions);

  let materializedPath: string | undefined;
  const outputPaths: string[] = [];
  let flatMetrics: Record<string, number> = {};
  let aggregateResultForStorage: Record<string, unknown> = {};
  let failureAnalysis: Record<string, unknown> | undefined;

  try {
    // Update run status to running
    await customActivities['benchmark.updateRunStatus']({
      runId,
      status: 'running',
    });

    // ---------------------------------------------------------------------------
    // Phase 1: Materialize Dataset
    // ---------------------------------------------------------------------------
    currentPhase = 'materializing';

    const { materializedPath: matPath } =
      await customActivities['benchmark.materializeDataset']({
        datasetVersionId,
      });
    materializedPath = matPath;

    // Load manifest via activity
    const { manifest } = await customActivities['benchmark.loadDatasetManifest']({
      materializedPath,
      datasetVersionId,
    });

    // Determine which samples to process (based on split)
    let samplesToProcess = manifest.samples;
    if (splitId && manifest.splits && manifest.splits[splitId]) {
      const splitSampleIds = manifest.splits[splitId];
      samplesToProcess = manifest.samples.filter((s) =>
        splitSampleIds?.includes(s.id),
      );
    }

    totalSamples = samplesToProcess.length;

    if (totalSamples === 0) {
      throw ApplicationFailure.create({
        message: `No samples found in dataset for split: ${splitId || 'default'}`,
        nonRetryable: true,
      });
    }

    // ---------------------------------------------------------------------------
    // Phase 2 & 3: Fan-out execution and evaluation
    // ---------------------------------------------------------------------------
    currentPhase = 'executing';

    const maxParallel = runtimeSettings.maxParallelDocuments || 10;
    const timeoutMs = runtimeSettings.timeoutPerDocumentMs || 300000; // 5 min default

    // Determine task queue routing (US-023 Scenario 6 & 7)
    const useProductionQueue = runtimeSettings.useProductionQueue === true;
    const childTaskQueue = useProductionQueue ? 'ocr-processing' : 'benchmark-processing';

    const evaluationResults: EvaluationResult[] = [];
    const executionOutputs: BenchmarkExecuteOutput[] = [];

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
                '.benchmark-outputs',
                sample.id,
              );

              // Execute workflow for this sample
              const executeInput: BenchmarkExecuteInput = {
                sampleId: sample.id,
                workflowConfig,
                configHash: workflowConfigHash,
                inputPaths,
                outputBaseDir,
                sampleMetadata: sample.metadata,
                timeoutMs,
                taskQueue: childTaskQueue,
              };

              const executeOutput = await benchmarkExecuteWorkflow(executeInput);

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
                    type: 'EXECUTION_ERROR',
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
      currentPhase = 'evaluating';

      for (const result of batchResults) {
        if (cancelled) {
          break;
        }

        const { sample, executeOutput, inputPaths, groundTruthPaths } = result;

        executionOutputs.push(executeOutput);

        // Only evaluate if execution succeeded
        if (executeOutput.success) {
          try {
            const evaluationResult = await customActivities['benchmark.evaluate']({
              sampleId: sample.id,
              inputPaths,
              predictionPaths: executeOutput.outputPaths,
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
                error:
                  error instanceof Error ? error.message : String(error),
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
              executionError: executeOutput.error?.message || 'Unknown error',
            },
            pass: false,
          });
        }

        completedSamples++;

        // Collect output paths for cleanup
        outputPaths.push(...executeOutput.outputPaths);
      }

      currentPhase = 'executing'; // Back to executing for next batch
    }

    // Check if cancelled
    if (cancelled) {
      currentPhase = 'cleanup';

      // Clean up temporary files
      if (materializedPath) {
        await customActivities['benchmark.cleanup']({
          materializedDatasetPaths: [materializedPath],
          temporaryOutputPaths: outputPaths,
          preserveCachedDatasets: true,
        });
      }

      // Update run status
      await customActivities['benchmark.updateRunStatus']({
        runId,
        status: 'cancelled',
        completedAt: new Date(),
      });

      return {
        status: 'cancelled',
        metrics: {},
        totalSamples,
        successfulSamples: completedSamples - failedSamples,
        failedSamples,
      };
    }

    // ---------------------------------------------------------------------------
    // Phase 4: Aggregate Metrics
    // ---------------------------------------------------------------------------
    currentPhase = 'aggregating';

    const aggregateResult = await customActivities['benchmark.aggregate']({
      results: evaluationResults,
      metadata: { splitId },
    });

    flatMetrics = flattenMetrics(aggregateResult.overall);
    aggregateResultForStorage = aggregateResult as unknown as Record<string, unknown>;
    failureAnalysis = aggregateResult.failureAnalysis as unknown as Record<string, unknown>;

    // ---------------------------------------------------------------------------
    // Phase 5: Log to MLflow
    // ---------------------------------------------------------------------------
    currentPhase = 'logging';

    // Build params (Section 6.3 required params)
    const params: Record<string, string> = {
      dataset_version_id: datasetVersionId,
      dataset_git_revision: gitRevision,
      workflow_config_hash: workflowConfigHash,
      evaluator_type: evaluatorType,
      evaluator_config_hash: evaluatorConfigHash,
    };

    // Build tags (Section 6.3 required tags)
    const tags: Record<string, string> = {
      worker_git_sha: workerGitSha,
      benchmark_run_id: runId,
      benchmark_definition_id: definitionId,
      benchmark_project_id: projectId,
    };

    if (workerImageDigest) {
      tags.worker_image_digest = workerImageDigest;
    }

    // Collect artifacts based on policy
    const artifactPaths: string[] = [];
    if (artifactPolicy === 'full') {
      // Upload all outputs
      artifactPaths.push(...outputPaths);
    } else if (artifactPolicy === 'failures_only') {
      // Upload only failed sample outputs
      const failedSampleIds = evaluationResults
        .filter((r) => !r.pass)
        .map((r) => r.sampleId);
      const failedOutputs = executionOutputs.filter((o) =>
        failedSampleIds.includes(o.sampleId),
      );
      for (const output of failedOutputs) {
        artifactPaths.push(...output.outputPaths);
      }
    }
    // For 'sampled', we could implement sampling logic here

    await customActivities['benchmark.logToMlflow']({
      mlflowRunId,
      params,
      metrics: flatMetrics,
      tags,
      artifactPaths,
      status: 'FINISHED',
    });

    // ---------------------------------------------------------------------------
    // Phase 6: Update BenchmarkRun Status
    // ---------------------------------------------------------------------------
    await customActivities['benchmark.updateRunStatus']({
      runId,
      status: 'completed',
      metrics: aggregateResultForStorage,
      completedAt: new Date(),
    });

    // ---------------------------------------------------------------------------
    // Phase 6a: Compare Against Baseline
    // ---------------------------------------------------------------------------
    try {
      await customActivities['benchmark.compareAgainstBaseline']({
        runId,
      });
    } catch (error) {
      // Don't fail the run if baseline comparison fails
      console.error(
        JSON.stringify({
          workflow: 'benchmarkRunWorkflow',
          event: 'baseline_comparison_failed',
          runId,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    }

    // ---------------------------------------------------------------------------
    // Phase 7: Cleanup
    // ---------------------------------------------------------------------------
    currentPhase = 'cleanup';

    await customActivities['benchmark.cleanup']({
      materializedDatasetPaths: [], // Keep cached datasets
      temporaryOutputPaths: outputPaths,
      preserveCachedDatasets: true,
    });

    currentPhase = 'completed';

    return {
      status: 'completed',
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
      currentPhase = 'cleanup';

      // Clean up temporary files
      if (materializedPath) {
        await customActivities['benchmark.cleanup']({
          materializedDatasetPaths: [],
          temporaryOutputPaths: outputPaths,
          preserveCachedDatasets: true,
        });
      }

      // Update run status
      await customActivities['benchmark.updateRunStatus']({
        runId,
        status: 'cancelled',
        completedAt: new Date(),
      });

      return {
        status: 'cancelled',
        metrics: flatMetrics,
        totalSamples,
        successfulSamples: completedSamples - failedSamples,
        failedSamples,
      };
    }

    // Handle failure
    const errorMessage = error instanceof Error ? error.message : String(error);

    currentPhase = 'cleanup';

    // Clean up temporary files
    if (materializedPath) {
      await customActivities['benchmark.cleanup']({
        materializedDatasetPaths: [],
        temporaryOutputPaths: outputPaths,
        preserveCachedDatasets: true,
      });
    }

    // Log failure to MLflow
    try {
      const params: Record<string, string> = {
        dataset_version_id: datasetVersionId,
        dataset_git_revision: gitRevision,
        workflow_config_hash: workflowConfigHash,
        evaluator_type: evaluatorType,
        evaluator_config_hash: evaluatorConfigHash,
      };

      const tags: Record<string, string> = {
        worker_git_sha: workerGitSha,
        benchmark_run_id: runId,
        benchmark_definition_id: definitionId,
        benchmark_project_id: projectId,
      };

      if (workerImageDigest) {
        tags.worker_image_digest = workerImageDigest;
      }

      await customActivities['benchmark.logToMlflow']({
        mlflowRunId,
        params,
        metrics: flatMetrics,
        tags,
        status: 'FAILED',
      });
    } catch (mlflowError) {
      // Log MLflow error but don't fail the workflow further
      console.error('Failed to log failure to MLflow:', mlflowError);
    }

    // Update run status
    await customActivities['benchmark.updateRunStatus']({
      runId,
      status: 'failed',
      error: errorMessage,
      metrics: aggregateResultForStorage,
      completedAt: new Date(),
    });

    return {
      status: 'failed',
      error: errorMessage,
      metrics: flatMetrics,
      failureAnalysis,
      totalSamples,
      successfulSamples: completedSamples - failedSamples,
      failedSamples,
    };
  }
}
