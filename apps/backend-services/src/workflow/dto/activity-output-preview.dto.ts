/**
 * US-140 — Response DTO for `GET /api/workflows/:id/preview-cache`.
 *
 * Surfaces a single `ActivityOutputCache` row (post-TTL filter) to the
 * frontend preview widget. The endpoint returns the most recent fresh row
 * for `(workflowLineageId, nodeId)` by default, or — when `runId` is
 * supplied — the row whose `createdAt` falls within that Temporal run's
 * execution window.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L20
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §2.5
 */

import { ApiProperty } from "@nestjs/swagger";

export class ActivityOutputPreviewDto {
  @ApiProperty({
    description:
      "The ctx fragment this activity wrote — an arbitrary JSON object whose " +
      "shape is determined by the node's activity / source `outputKind` " +
      "schema. Consumers must not assume any particular keys.",
    type: "object",
    additionalProperties: true,
    example: { documentUrl: "blob://group-1/doc-1.pdf", pageCount: 12 },
  })
  outputCtx!: Record<string, unknown>;

  @ApiProperty({
    description:
      "The ArtifactKind name the row's `outputCtx` conforms to (e.g. " +
      '"Document", "Segment[]"). `null` when the producing node did not ' +
      "declare an output kind.",
    nullable: true,
    type: String,
    example: "Document",
  })
  outputKind!: string | null;

  @ApiProperty({
    description:
      "ISO-8601 timestamp of when the worker decorator wrote this cache row.",
    example: "2026-05-24T12:00:00.000Z",
  })
  createdAt!: string;

  @ApiProperty({
    description:
      "ISO-8601 timestamp at which this cache row is considered expired by " +
      "the read endpoint (rows past this point return 404 even before GC).",
    example: "2026-05-25T12:00:00.000Z",
  })
  expiresAt!: string;
}
