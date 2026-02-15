/**
 * Benchmark Definition Response DTOs
 *
 * Response objects for benchmark definition operations.
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 */

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
   * Workflow ID
   */
  id: string;

  /**
   * Workflow name
   */
  name: string;

  /**
   * Workflow version
   */
  version: number;
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
   * MLflow run ID
   */
  mlflowRunId: string;

  /**
   * Start timestamp
   */
  startedAt: Date | null;

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
   * Split info
   */
  split: SplitInfo;

  /**
   * Workflow info
   */
  workflow: WorkflowInfo;

  /**
   * Workflow config hash (captured at creation time)
   */
  workflowConfigHash: string;

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
   * Artifact policy
   */
  artifactPolicy: Record<string, unknown>;

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
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last update timestamp
   */
  updatedAt: Date;
}
