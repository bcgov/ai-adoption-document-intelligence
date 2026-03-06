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
