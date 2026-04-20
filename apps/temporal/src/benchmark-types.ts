/**
 * Benchmark Evaluator Types
 *
 * Defines the pluggable evaluator interface for benchmarking workflows.
 * Evaluators compare workflow predictions against ground truth and emit metrics.
 *
 * NOTE: These types are duplicated from apps/backend-services/src/benchmark/evaluator.interface.ts
 * because the monorepo has no shared import path between backend and temporal.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-014-evaluator-interface-registry.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 5.1
 */

/**
 * Evaluation artifact (output file)
 */
export interface EvaluationArtifact {
  /**
   * Artifact type (e.g., 'diff', 'visualization', 'error_log')
   */
  type: string;

  /**
   * Path to the artifact file
   */
  path: string;

  /**
   * MIME type of the artifact
   */
  mimeType: string;
}

/**
 * Input to an evaluator for a single sample
 */
export interface EvaluationInput {
  /**
   * Unique sample identifier from the dataset manifest
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
   * Evaluator-specific configuration
   */
  evaluatorConfig: Record<string, unknown>;

  /**
   * Optional per-field confidence map keyed by field name.
   * Carried in-memory from the workflow alongside the prediction; not loaded from disk.
   * `null` indicates Azure DI did not return a confidence score for that field.
   */
  predictionConfidences?: Record<string, number | null>;
}

/**
 * Result of evaluating a single sample
 */
export interface EvaluationResult {
  /**
   * Sample identifier (matches EvaluationInput.sampleId)
   */
  sampleId: string;

  /**
   * Per-sample metrics (numeric values for aggregation)
   */
  metrics: Record<string, number>;

  /**
   * Per-sample diagnostics (arbitrary structured data for debugging)
   */
  diagnostics: Record<string, unknown>;

  /**
   * Optional output files (diffs, visualizations, etc.)
   */
  artifacts?: EvaluationArtifact[];

  /**
   * Pass/fail based on evaluator thresholds
   */
  pass: boolean;

  /**
   * Ground truth data used for comparison (if available)
   */
  groundTruth?: unknown;

  /**
   * Prediction/output data produced by the workflow (if available)
   */
  prediction?: unknown;

  /**
   * Evaluation details (e.g., field-by-field comparison)
   */
  evaluationDetails?: unknown;
}

/**
 * Dataset manifest describing samples and their files
 */
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

/**
 * Benchmark evaluator interface
 *
 * Evaluators are pluggable components that compare workflow predictions
 * against ground truth and emit metrics.
 */
export interface BenchmarkEvaluator {
  /**
   * Evaluator type identifier (e.g., 'schema-aware', 'black-box')
   */
  type: string;

  /**
   * Evaluate a single sample
   */
  evaluate(input: EvaluationInput): Promise<EvaluationResult>;
}
