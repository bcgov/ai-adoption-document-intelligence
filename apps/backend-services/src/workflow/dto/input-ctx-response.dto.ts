/**
 * US-151 — Response DTO for `GET /api/workflows/:id/runs/:runId/input-ctx`.
 *
 * Surfaces the historical `initialCtx` for a Temporal run so the frontend
 * "Re-run" button (on an evicted-cache preview) can re-trigger a Try with
 * the same input that produced the original run.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L23
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.4
 */

import { ApiProperty } from "@nestjs/swagger";

export class InputCtxResponseDto {
  @ApiProperty({
    description:
      "The `initialCtx` the original run was started with — an arbitrary " +
      "JSON object whose keys match the workflow's derived input schema. " +
      "For `source.upload` workflows this includes the uploaded blob's " +
      "ctx-key reference (re-running with the same value re-attaches to " +
      "the same uploaded content via the source node's cache row).",
    type: "object",
    additionalProperties: true,
    example: { documentUrl: "blob://group-1/doc-1.pdf" },
  })
  initialCtx!: Record<string, unknown>;
}
