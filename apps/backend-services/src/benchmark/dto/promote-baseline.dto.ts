import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

/**
 * Promote Baseline DTOs
 *
 * Request and response objects for baseline promotion.
 * See feature-docs/003-benchmarking-system/user-stories/US-034-baseline-management.md
 */

/**
 * Threshold type for baseline comparison
 */
export type ThresholdType = "absolute" | "relative";

/**
 * Per-metric threshold configuration
 */
export class MetricThreshold {
  /**
   * Metric name
   */
  @ApiProperty({ description: 'Metric name' })
  @IsString()
  metricName: string;

  /**
   * Threshold type (absolute or relative/percentage)
   */
  @ApiProperty({ description: 'Threshold type (absolute or relative/percentage)', enum: ['absolute', 'relative'] })
  @IsIn(["absolute", "relative"])
  type: ThresholdType;

  /**
   * Threshold value
   * - For absolute: minimum acceptable value (e.g., 0.90 for 90% minimum)
   * - For relative: minimum acceptable ratio relative to baseline (e.g., 0.95 for 95% of baseline)
   */
  @ApiProperty({ description: 'Threshold value (absolute min or relative ratio)' })
  @IsNumber()
  value: number;
}

/**
 * Request to promote a run to baseline
 */
export class PromoteBaselineDto {
  /**
   * Per-metric thresholds for regression detection
   */
  @ApiPropertyOptional({ description: 'Per-metric thresholds for regression detection', type: () => MetricThreshold, isArray: true })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetricThreshold)
  thresholds?: MetricThreshold[];
}

/**
 * Per-metric comparison result
 */
export interface MetricComparison {
  /**
   * Metric name
   */
  metricName: string;

  /**
   * Current run metric value
   */
  currentValue: number;

  /**
   * Baseline metric value
   */
  baselineValue: number;

  /**
   * Delta (current - baseline)
   */
  delta: number;

  /**
   * Delta percentage ((current - baseline) / baseline * 100)
   */
  deltaPercent: number;

  /**
   * Pass/fail status
   */
  passed: boolean;

  /**
   * Threshold that was applied (if any)
   */
  threshold?: MetricThreshold;
}

/**
 * Baseline comparison result
 */
export interface BaselineComparison {
  /**
   * Baseline run ID
   */
  baselineRunId: string;

  /**
   * Overall pass/fail status
   */
  overallPassed: boolean;

  /**
   * Per-metric comparison results
   */
  metricComparisons: MetricComparison[];

  /**
   * Regressed metric names (failed thresholds)
   */
  regressedMetrics: string[];
}

/**
 * Baseline promotion response
 */
export class PromoteBaselineResponseDto {
  /**
   * Run ID that was promoted
   */
  @ApiProperty({ description: 'Run ID that was promoted to baseline' })
  runId: string;

  /**
   * Whether this run is now the baseline
   */
  @ApiProperty({ description: 'Whether this run is now the baseline' })
  isBaseline: boolean;

  /**
   * Previous baseline run ID (if any)
   */
  @ApiProperty({ description: 'Previous baseline run ID', nullable: true })
  previousBaselineId: string | null;

  /**
   * Configured thresholds
   */
  @ApiProperty({ description: 'Configured thresholds', nullable: true, type: () => MetricThreshold, isArray: true })
  thresholds: MetricThreshold[] | null;
}
