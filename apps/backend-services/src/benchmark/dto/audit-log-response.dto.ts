/**
 * Audit Log Response DTOs
 *
 * Response objects for benchmark audit log queries.
 */

import { AuditAction } from "@generated/client";

/**
 * Audit log entry
 */
export class AuditLogEntryDto {
  /**
   * Audit log entry ID
   */
  id: string;

  /**
   * Timestamp of the event
   */
  timestamp: Date;

  /**
   * User ID who performed the action
   */
  userId: string;

  /**
   * Action type
   */
  action: AuditAction;

  /**
   * Entity type (e.g., "BenchmarkRun", "Dataset")
   */
  entityType: string;

  /**
   * Entity ID
   */
  entityId: string;

  /**
   * Additional metadata about the event
   */
  metadata: Record<string, unknown> | null;
}

/**
 * Baseline promotion history entry (simplified from audit log)
 */
export class BaselinePromotionHistoryDto {
  /**
   * Timestamp when baseline was promoted
   */
  promotedAt: Date;

  /**
   * Run ID that was promoted to baseline
   */
  runId: string;

  /**
   * User who promoted the baseline
   */
  userId: string;

  /**
   * Definition ID this baseline belongs to
   */
  definitionId?: string;

  /**
   * Project ID this baseline belongs to
   */
  projectId?: string;
}
