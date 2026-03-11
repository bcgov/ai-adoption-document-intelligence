import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * Baseline promotion history entry (simplified from audit log)
 */
export class BaselinePromotionHistoryDto {
  /**
   * Timestamp when baseline was promoted
   */
  @ApiProperty({ description: 'Timestamp when baseline was promoted', type: Date })
  promotedAt: Date;

  /**
   * Run ID that was promoted to baseline
   */
  @ApiProperty({ description: 'Run ID that was promoted to baseline' })
  runId: string;

  /**
   * User who promoted the baseline
   */
  @ApiProperty({ description: 'User who promoted the baseline' })
  userId: string;

  /**
   * Definition ID this baseline belongs to
   */
  @ApiPropertyOptional({ description: 'Definition ID this baseline belongs to' })
  definitionId?: string;

  /**
   * Project ID this baseline belongs to
   */
  @ApiPropertyOptional({ description: 'Project ID this baseline belongs to' })
  projectId?: string;
}
