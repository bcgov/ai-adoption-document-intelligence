/**
 * Benchmark Project Response DTOs
 *
 * Response objects for benchmark project operations.
 * See feature-docs/003-benchmarking-system/user-stories/US-010-benchmark-project-service-controller.md
 */

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Benchmark project summary (for list views)
 */
export class ProjectSummaryDto {
  /**
   * Project ID
   */
  @ApiProperty({ description: 'Project ID' })
  id: string;

  /**
   * Project name
   */
  @ApiProperty({ description: 'Project name' })
  name: string;

  /**
   * Project description
   */
  @ApiPropertyOptional({ description: 'Project description', nullable: true })
  description: string | null;

  /**
   * User who created the project
   */
  @ApiProperty({ description: 'User who created the project' })
  createdBy: string;

  /**
   * Group ID that owns this project
   */
  @ApiProperty({ description: 'Group ID that owns this project' })
  groupId: string;

  /**
   * Number of benchmark definitions in this project
   */
  @ApiProperty({ description: 'Number of benchmark definitions in this project' })
  definitionCount: number;

  /**
   * Number of benchmark runs in this project
   */
  @ApiProperty({ description: 'Number of benchmark runs in this project' })
  runCount: number;

  /**
   * Creation timestamp
   */
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  /**
   * Last update timestamp
   */
  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

/**
 * Recent benchmark run summary
 */
export class RecentRunSummary {
  /**
   * Run ID
   */
  @ApiProperty({ description: 'Run ID' })
  id: string;

  /**
   * Definition name
   */
  @ApiProperty({ description: 'Definition name' })
  definitionName: string;

  /**
   * Run status
   */
  @ApiProperty({ description: 'Run status' })
  status: string;

  /**
   * Temporal workflow ID
   */
  @ApiProperty({ description: 'Temporal workflow ID', nullable: true })
  temporalWorkflowId: string | null;

  /**
   * Start timestamp
   */
  @ApiProperty({ description: 'Start timestamp', nullable: true, type: Date })
  startedAt: Date | null;

  /**
   * Completion timestamp
   */
  @ApiProperty({ description: 'Completion timestamp', nullable: true, type: Date })
  completedAt: Date | null;
}

/**
 * Benchmark definition summary
 */
export class DefinitionSummary {
  /**
   * Definition ID
   */
  @ApiProperty({ description: 'Definition ID' })
  id: string;

  /**
   * Definition name
   */
  @ApiProperty({ description: 'Definition name' })
  name: string;

  /**
   * Dataset version ID
   */
  @ApiProperty({ description: 'Dataset version ID' })
  datasetVersionId: string;

  /**
   * Evaluator type
   */
  @ApiProperty({ description: 'Evaluator type' })
  evaluatorType: string;

  /**
   * Whether the definition is immutable
   */
  @ApiProperty({ description: 'Whether the definition is immutable' })
  immutable: boolean;

  /**
   * Creation timestamp
   */
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;
}

/**
 * Full benchmark project details
 */
export class ProjectDetailsDto {
  /**
   * Project ID
   */
  @ApiProperty({ description: 'Project ID' })
  id: string;

  /**
   * Project name
   */
  @ApiProperty({ description: 'Project name' })
  name: string;

  /**
   * Project description
   */
  @ApiPropertyOptional({ description: 'Project description', nullable: true })
  description: string | null;

  /**
   * User who created the project
   */
  @ApiProperty({ description: 'User who created the project' })
  createdBy: string;

  /**
   * Group ID that owns this project
   */
  @ApiProperty({ description: 'Group ID that owns this project' })
  groupId: string;

  /**
   * List of benchmark definitions
   */
  @ApiProperty({ description: 'List of benchmark definitions', type: () => DefinitionSummary, isArray: true })
  definitions: DefinitionSummary[];

  /**
   * Recent benchmark runs
   */
  @ApiProperty({ description: 'Recent benchmark runs', type: () => RecentRunSummary, isArray: true })
  recentRuns: RecentRunSummary[];

  /**
   * Creation timestamp
   */
  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  /**
   * Last update timestamp
   */
  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}
