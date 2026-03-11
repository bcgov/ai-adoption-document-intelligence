/**
 * Benchmark Definition Response DTOs
 *
 * Response objects for benchmark definition operations.
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { MetricThreshold } from './promote-baseline.dto';

/**
 * Dataset version info embedded in definition response
 */
export class DatasetVersionInfo {
  @ApiProperty({ description: 'Dataset version ID' })
  id: string;

  @ApiProperty({ description: 'Dataset name' })
  datasetName: string;

  @ApiProperty({ description: 'Version number' })
  version: string;
}

/**
 * Workflow info embedded in definition response
 */
export class WorkflowInfo {
  @ApiProperty({ description: 'Workflow ID' })
  id: string;

  @ApiProperty({ description: 'Workflow name' })
  name: string;

  @ApiProperty({ description: 'Workflow version' })
  version: number;
}

/**
 * Split info embedded in definition response
 */
export class SplitInfo {
  @ApiProperty({ description: 'Split ID' })
  id: string;

  @ApiProperty({ description: 'Split name' })
  name: string;

  @ApiProperty({ description: 'Split type (train, val, test, golden)' })
  type: string;
}

/**
 * Run history summary
 */
export class RunHistorySummary {
  @ApiProperty({ description: 'Run ID' })
  id: string;

  @ApiProperty({ description: 'Run status' })
  status: string;

  @ApiProperty({ description: 'Start timestamp', nullable: true, type: Date })
  startedAt: Date | null;

  @ApiProperty({ description: 'Completion timestamp', nullable: true, type: Date })
  completedAt: Date | null;
}

/**
 * Baseline run summary for definition detail
 */
export class BaselineRunSummary {
  @ApiProperty({ description: 'Baseline run ID' })
  id: string;

  @ApiProperty({ description: 'Run status' })
  status: string;

  @ApiProperty({
    description: 'Aggregated metrics from the baseline run',
    type: 'object',
    additionalProperties: { type: 'number' },
  })
  metrics: Record<string, number>;

  @ApiProperty({
    description: 'Baseline thresholds for regression detection',
    isArray: true,
  })
  baselineThresholds: MetricThreshold[];

  @ApiProperty({ description: 'Completion timestamp', nullable: true, type: Date })
  completedAt: Date | null;
}

/**
 * Benchmark definition response (list view)
 */
export class DefinitionSummaryDto {
  @ApiProperty({ description: 'Definition ID' })
  id: string;

  @ApiProperty({ description: 'Definition name' })
  name: string;

  @ApiProperty({ description: 'Dataset version info', type: () => DatasetVersionInfo })
  datasetVersion: DatasetVersionInfo;

  @ApiProperty({ description: 'Workflow info', type: () => WorkflowInfo })
  workflow: WorkflowInfo;

  @ApiProperty({ description: 'Evaluator type' })
  evaluatorType: string;

  @ApiProperty({ description: 'Whether the definition is immutable (has runs)' })
  immutable: boolean;

  @ApiProperty({ description: 'Definition revision number' })
  revision: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

/**
 * Full benchmark definition details
 */
export class DefinitionDetailsDto {
  @ApiProperty({ description: 'Definition ID' })
  id: string;

  @ApiProperty({ description: 'Project ID' })
  projectId: string;

  @ApiProperty({ description: 'Definition name' })
  name: string;

  @ApiProperty({ description: 'Dataset version info', type: () => DatasetVersionInfo })
  datasetVersion: DatasetVersionInfo;

  @ApiPropertyOptional({ description: 'Split info (optional — definition may use full dataset)', type: () => SplitInfo })
  split?: SplitInfo;

  @ApiProperty({ description: 'Workflow info', type: () => WorkflowInfo })
  workflow: WorkflowInfo;

  @ApiProperty({ description: 'Workflow config hash (captured at creation time)' })
  workflowConfigHash: string;

  @ApiProperty({ description: 'Evaluator type' })
  evaluatorType: string;

  @ApiProperty({
    description: 'Evaluator configuration',
    type: 'object',
    additionalProperties: true,
  })
  evaluatorConfig: Record<string, unknown>;

  @ApiProperty({
    description: 'Runtime settings',
    type: 'object',
    additionalProperties: true,
  })
  runtimeSettings: Record<string, unknown>;

  @ApiProperty({ description: 'Whether the definition is immutable (has runs)' })
  immutable: boolean;

  @ApiProperty({ description: 'Definition revision number' })
  revision: number;

  @ApiProperty({ description: 'Whether scheduling is enabled' })
  scheduleEnabled: boolean;

  @ApiPropertyOptional({ description: 'Cron expression for scheduled runs' })
  scheduleCron?: string;

  @ApiPropertyOptional({ description: 'Temporal schedule ID' })
  scheduleId?: string;

  @ApiProperty({ description: 'Run history', type: () => RunHistorySummary, isArray: true })
  runHistory: RunHistorySummary[];

  @ApiPropertyOptional({ description: 'Current baseline run for this definition (if any)', type: () => BaselineRunSummary })
  baselineRun?: BaselineRunSummary;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}