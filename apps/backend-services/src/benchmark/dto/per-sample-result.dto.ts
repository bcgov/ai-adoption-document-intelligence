/**
 * Per-Sample Result DTOs
 *
 * DTOs for fetching and filtering per-sample benchmark results.
 * See feature-docs/003-benchmarking-system/user-stories/US-038-slicing-filtering-drilldown-ui.md
 */

/**
 * Individual sample result with metadata and metrics
 */
export class PerSampleResultDto {
  /**
   * Sample ID
   */
  sampleId: string;

  /**
   * Sample metadata from manifest
   */
  metadata: Record<string, unknown>;

  /**
   * Per-sample metrics
   */
  metrics: Record<string, number>;

  /**
   * Whether this sample passed the evaluator thresholds
   */
  pass: boolean;

  /**
   * Per-sample diagnostics (arbitrary structured data for debugging)
   */
  diagnostics?: Record<string, unknown>;

  /**
   * Ground truth data (if available)
   */
  groundTruth?: unknown;

  /**
   * Prediction/output data (if available)
   */
  prediction?: unknown;

  /**
   * Evaluation result details (field-by-field comparison for schema-aware)
   */
  evaluationDetails?: unknown;
}

/**
 * Response for per-sample results with filtering
 */
export class PerSampleResultsResponseDto {
  /**
   * Run ID
   */
  runId: string;

  /**
   * List of per-sample results
   */
  results: PerSampleResultDto[];

  /**
   * Total number of results (before pagination)
   */
  total: number;

  /**
   * Current page
   */
  page: number;

  /**
   * Items per page
   */
  limit: number;

  /**
   * Total pages
   */
  totalPages: number;

  /**
   * Available filter dimensions (metadata keys)
   */
  availableDimensions: string[];

  /**
   * Per-dimension value options
   */
  dimensionValues: Record<string, Array<string | number>>;
}
