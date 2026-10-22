import { ApiProperty } from "@nestjs/swagger";

/**
 * 200-response body for `DELETE /api/dynamic-nodes/:slug`. Idempotent —
 * delete on an already-deleted lineage returns the existing `deletedAt`.
 *
 * `usedInWorkflowCount` is returned so the frontend's confirm-delete modal
 * (US-180) can render "Used in N workflows" before the user confirms the
 * action.
 */
export class DynamicNodeDeletedResponseDto {
  @ApiProperty({
    description: "Lineage slug that was soft-deleted.",
    example: "uppercase-document-url",
  })
  slug!: string;

  @ApiProperty({
    description: "ISO 8601 timestamp at which the lineage was soft-deleted.",
    example: "2026-05-25T22:45:12.345Z",
  })
  deletedAt!: string;

  @ApiProperty({
    description:
      'Workflows in this group whose config references `"dyn.<slug>"` at the time of deletion. Surfaced for the frontend confirm-modal.',
    example: 1,
  })
  usedInWorkflowCount!: number;
}
