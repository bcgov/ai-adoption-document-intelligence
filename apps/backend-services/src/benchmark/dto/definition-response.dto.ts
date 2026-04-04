/**
 * Benchmark Definition Response DTOs
 *
 * Response objects for benchmark definition operations.
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 */

import { ApiProperty } from "@nestjs/swagger";

/**
 * Dataset version info embedded in definition response
 */
export class DatasetVersionInfo {
  /**
   * Dataset version ID
   */
  id: string;

  /**
   * Dataset name
   */
  datasetName: string;

  /**
   * Version number
   */
  version: string;
}

/**
 * Workflow info embedded in definition response
 */
export class WorkflowInfo {
  /**
   * Stable workflow lineage ID (WorkflowLineage.id)
   */
  id: string;

  /**
   * Pinned graph config version (WorkflowVersion.id)
   */
  workflowVersionId: string;

  /**
   * Workflow name (from lineage)
   */
  name: string;

  /**
   * Immutable config revision number
   */
  version: number;

  /**
   * Workflow lineage kind ("primary" or "benchmark_candidate")
   */
  @ApiProperty({
    description: 'Workflow lineage kind ("primary" or "benchmark_candidate")',
    required: false,
  })
  workflowKind?: string;

  /**
   * Source workflow lineage ID (set when workflowKind is "benchmark_candidate")
   */
  @ApiProperty({
    description: "Source workflow lineage ID for candidate workflows",
    required: false,
  })
  sourceWorkflowId?: string | null;
}

/**
 * Split info embedded in definition response
 */
export class SplitInfo {
  /**
   * Split ID
   */
  id: string;

  /**
   * Split name
   */
  name: string;

  /**
   * Split type (train, val, test, golden)
   */
  type: string;
}

/**
 * Run history summary
 */
export class RunHistorySummary {
  /**
   * Run ID
   */
  id: string;

  /**
   * Run status
   */
  status: string;

  /**
   * Start timestamp
   */
  startedAt: Date | null;

  /**
   * Completion timestamp
   */
  completedAt: Date | null;
}

// Import MetricThreshold from promote-baseline.dto.ts to avoid duplication
import type { MetricThreshold } from "./promote-baseline.dto";

/**
 * Baseline run summary for definition detail
 */
export class BaselineRunSummary {
  /**
   * Baseline run ID
   */
  id: string;

  /**
   * Run status
   */
  status: string;

  /**
   * Aggregated metrics from the baseline run
   */
  metrics: Record<string, number>;

  /**
   * Baseline thresholds for regression detection
   */
  baselineThresholds: MetricThreshold[];

  /**
   * Completion timestamp
   */
  completedAt: Date | null;
}

/**
 * Benchmark definition response (list view)
 */
export class DefinitionSummaryDto {
  /**
   * Definition ID
   */
  id: string;

  /**
   * Definition name
   */
  name: string;

  /**
   * Dataset version info
   */
  datasetVersion: DatasetVersionInfo;

  /**
   * Workflow info
   */
  workflow: WorkflowInfo;

  /**
   * Evaluator type
   */
  evaluatorType: string;

  /**
   * Whether the definition is immutable (has runs)
   */
  immutable: boolean;

  /**
   * Definition revision number
   */
  revision: number;

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last update timestamp
   */
  updatedAt: Date;
}

/**
 * Full benchmark definition details
 */
export class DefinitionDetailsDto {
  /**
   * Definition ID
   */
  id: string;

  /**
   * Project ID
   */
  projectId: string;

  /**
   * Definition name
   */
  name: string;

  /**
   * Dataset version info
   */
  datasetVersion: DatasetVersionInfo;

  /**
   * Split info (optional — definition may use full dataset)
   */
  split?: SplitInfo;

  /**
   * Workflow info
   */
  workflow: WorkflowInfo;

  /**
   * Workflow config hash (captured at creation time)
   */
  workflowConfigHash: string;

  /**
   * Workflow config overrides — map of exposed param paths to values
   */
  workflowConfigOverrides?: Record<string, unknown>;

  /**
   * Evaluator type
   */
  evaluatorType: string;

  /**
   * Evaluator configuration
   */
  evaluatorConfig: Record<string, unknown>;

  /**
   * Runtime settings
   */
  runtimeSettings: Record<string, unknown>;

  /**
   * Whether the definition is immutable (has runs)
   */
  immutable: boolean;

  /**
   * Definition revision number
   */
  revision: number;

  /**
   * Schedule configuration
   */
  scheduleEnabled: boolean;

  /**
   * Cron expression for scheduled runs
   */
  scheduleCron?: string;

  /**
   * Temporal schedule ID
   */
  scheduleId?: string;

  /**
   * Run history
   */
  runHistory: RunHistorySummary[];

  /**
   * Current baseline run for this definition (if any)
   */
  baselineRun?: BaselineRunSummary;

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last update timestamp
   */
  updatedAt: Date;
}
