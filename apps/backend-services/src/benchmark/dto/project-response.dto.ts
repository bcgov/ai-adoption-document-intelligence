/**
 * Benchmark Project Response DTOs
 *
 * Response objects for benchmark project operations.
 * See feature-docs/003-benchmarking-system/user-stories/US-010-benchmark-project-service-controller.md
 */

/**
 * Benchmark project summary (for list views)
 */
export class ProjectSummaryDto {
  /**
   * Project ID
   */
  id: string;

  /**
   * Project name
   */
  name: string;

  /**
   * Project description
   */
  description: string | null;

  /**
   * User who created the project
   */
  createdBy: string;

  /**
   * Number of benchmark definitions in this project
   */
  definitionCount: number;

  /**
   * Number of benchmark runs in this project
   */
  runCount: number;

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
 * Recent benchmark run summary
 */
export class RecentRunSummary {
  /**
   * Run ID
   */
  id: string;

  /**
   * Definition name
   */
  definitionName: string;

  /**
   * Run status
   */
  status: string;

  /**
   * Temporal workflow ID
   */
  temporalWorkflowId: string | null;

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
 * Benchmark definition summary
 */
export class DefinitionSummary {
  /**
   * Definition ID
   */
  id: string;

  /**
   * Definition name
   */
  name: string;

  /**
   * Dataset version ID
   */
  datasetVersionId: string;

  /**
   * Evaluator type
   */
  evaluatorType: string;

  /**
   * Whether the definition is immutable
   */
  immutable: boolean;

  /**
   * Creation timestamp
   */
  createdAt: Date;
}

/**
 * Full benchmark project details
 */
export class ProjectDetailsDto {
  /**
   * Project ID
   */
  id: string;

  /**
   * Project name
   */
  name: string;

  /**
   * Project description
   */
  description: string | null;

  /**
   * User who created the project
   */
  createdBy: string;

  /**
   * List of benchmark definitions
   */
  definitions: DefinitionSummary[];

  /**
   * Recent benchmark runs
   */
  recentRuns: RecentRunSummary[];

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last update timestamp
   */
  updatedAt: Date;
}
