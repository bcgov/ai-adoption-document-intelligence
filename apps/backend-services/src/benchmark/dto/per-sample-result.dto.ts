import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Individual sample result with metadata and metrics
 */
export class PerSampleResultDto {
  /**
   * Sample ID
   */
  @ApiProperty({ description: 'Sample ID' })
  sampleId: string;

  /**
   * Sample metadata from manifest
   */
  @ApiProperty({ description: 'Sample metadata from manifest', type: 'object', additionalProperties: true })
  metadata: Record<string, unknown>;

  /**
   * Per-sample metrics
   */
  @ApiProperty({ description: 'Per-sample metrics', type: 'object', additionalProperties: { type: 'number' } })
  metrics: Record<string, number>;

  /**
   * Whether this sample passed the evaluator thresholds
   */
  @ApiProperty({ description: 'Whether this sample passed the evaluator thresholds' })
  pass: boolean;

  /**
   * Per-sample diagnostics (arbitrary structured data for debugging)
   */
  @ApiPropertyOptional({ description: 'Per-sample diagnostics for debugging', type: 'object', additionalProperties: true })
  diagnostics?: Record<string, unknown>;

  /**
   * Ground truth data (if available)
   */
  @ApiPropertyOptional({ description: 'Ground truth data' })
  groundTruth?: unknown;

  /**
   * Prediction/output data (if available)
   */
  @ApiPropertyOptional({ description: 'Prediction/output data' })
  prediction?: unknown;

  /**
   * Evaluation result details (field-by-field comparison for schema-aware)
   */
  @ApiPropertyOptional({ description: 'Evaluation result details (field-by-field comparison for schema-aware evaluators)' })
  evaluationDetails?: unknown;
}

/**
 * Response for per-sample results with filtering
 */
export class PerSampleResultsResponseDto {
  /**
   * Run ID
   */
  @ApiProperty({ description: 'Run ID' })
  runId: string;

  /**
   * List of per-sample results
   */
  @ApiProperty({ description: 'List of per-sample results', type: () => PerSampleResultDto, isArray: true })
  results: PerSampleResultDto[];

  /**
   * Total number of results (before pagination)
   */
  @ApiProperty({ description: 'Total number of results before pagination' })
  total: number;

  /**
   * Current page
   */
  @ApiProperty({ description: 'Current page number' })
  page: number;

  /**
   * Items per page
   */
  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  /**
   * Total pages
   */
  @ApiProperty({ description: 'Total number of pages' })
  totalPages: number;

  /**
   * Available filter dimensions (metadata keys)
   */
  @ApiProperty({ description: 'Available filter dimensions (metadata keys)', type: [String] })
  availableDimensions: string[];

  /**
   * Per-dimension value options
   */
  @ApiProperty({ description: 'Available values for each filter dimension', type: 'object', additionalProperties: true })
  dimensionValues: Record<string, Array<string | number>>;
}
