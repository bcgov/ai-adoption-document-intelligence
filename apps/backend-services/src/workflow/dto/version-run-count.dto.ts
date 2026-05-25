/**
 * US-152 — Response DTO for
 * `GET /api/workflows/:id/versions/:versionId/run-count`.
 *
 * Surfaces the number of Temporal runs that have executed against a given
 * `(workflowLineageId, workflowVersionId)` pair to the
 * `VersionHistoryDrawer` row's run-count badge.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L24 + L43
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-152-version-run-count-endpoint-and-badge.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.5
 */

import { ApiProperty } from "@nestjs/swagger";

export class VersionRunCountDto {
  @ApiProperty({
    description:
      "Approximate count of Temporal workflow executions matching " +
      "`WorkflowLineageId = <lineage>` AND `WorkflowVersionId = <versionId>`. " +
      "Sourced from Temporal's visibility store via `countWorkflowExecutions`. " +
      "Cached server-side for 60s per `(workflowId, versionId)` pair.",
    example: 12,
    minimum: 0,
  })
  runCount!: number;
}
