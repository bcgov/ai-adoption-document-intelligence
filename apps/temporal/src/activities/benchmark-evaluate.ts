/**
 * Benchmark Evaluation Activities
 *
 * Temporal activities for per-sample evaluation and cross-sample aggregation.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-020-evaluation-aggregation-activities.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 11.4
 */

import * as fs from "fs/promises";
import {
  EvaluationInput,
  EvaluationResult,
} from "../benchmark-types";
import { getEvaluator } from "../evaluator-registry";
import {
  aggregateResults,
  BenchmarkAggregationResult,
  AggregationOptions,
} from "../benchmark-aggregation";

/**
 * Input for benchmark.evaluate activity
 */
export interface BenchmarkEvaluateInput {
  /**
   * Sample identifier
   */
  sampleId: string;

  /**
   * Paths to input files (materialized on disk)
   */
  inputPaths: string[];

  /**
   * Paths to workflow output files (predictions)
   */
  predictionPaths: string[];

  /**
   * Paths to ground truth files
   */
  groundTruthPaths: string[];

  /**
   * Sample metadata from the dataset manifest
   */
  metadata: Record<string, unknown>;

  /**
   * Evaluator type (e.g., 'schema-aware', 'black-box')
   */
  evaluatorType: string;

  /**
   * Evaluator-specific configuration
   */
  evaluatorConfig: Record<string, unknown>;
}

/**
 * Input for benchmark.aggregate activity
 */
export interface BenchmarkAggregateInput {
  /**
   * Array of evaluation results from all samples
   */
  results: EvaluationResult[];

  /**
   * Aggregation options
   */
  options?: AggregationOptions;
}

/**
 * Evaluate a single sample
 *
 * Activity type: benchmark.evaluate
 */
export async function benchmarkEvaluate(
  input: BenchmarkEvaluateInput,
): Promise<EvaluationResult> {
  const {
    sampleId,
    inputPaths,
    predictionPaths,
    groundTruthPaths,
    metadata,
    evaluatorType,
    evaluatorConfig,
  } = input;

  try {
    // Check if prediction files exist (workflow may have failed to produce output)
    const predictionFilesExist = await checkFilesExist(predictionPaths);

    if (!predictionFilesExist) {
      // Return failure result with diagnostic
      return {
        sampleId,
        metrics: {},
        diagnostics: {
          error: "no_prediction_output",
          message: "Workflow failed to produce output for this sample",
        },
        pass: false,
      };
    }

    // Get evaluator from registry
    const evaluator = getEvaluator(evaluatorType);

    // Construct evaluation input
    const evaluationInput: EvaluationInput = {
      sampleId,
      inputPaths,
      predictionPaths,
      groundTruthPaths,
      metadata,
      evaluatorConfig,
    };

    // Run evaluation
    const result = await evaluator.evaluate(evaluationInput);

    return result;
  } catch (error) {
    // Handle evaluation errors
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    return {
      sampleId,
      metrics: {},
      diagnostics: {
        error: "evaluation_failed",
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      pass: false,
    };
  }
}

/**
 * Aggregate metrics across all samples
 *
 * Activity type: benchmark.aggregate
 */
export async function benchmarkAggregate(
  input: BenchmarkAggregateInput,
): Promise<BenchmarkAggregationResult> {
  const { results, options } = input;

  // Use the aggregation module from US-017
  const aggregationResult = aggregateResults(results, options);

  return aggregationResult;
}

/**
 * Check if all files in the list exist
 */
async function checkFilesExist(filePaths: string[]): Promise<boolean> {
  if (filePaths.length === 0) {
    return false;
  }

  try {
    const checks = await Promise.all(
      filePaths.map(async (path) => {
        try {
          await fs.access(path);
          return true;
        } catch {
          return false;
        }
      }),
    );

    // All files must exist
    return checks.every((exists) => exists);
  } catch {
    return false;
  }
}
