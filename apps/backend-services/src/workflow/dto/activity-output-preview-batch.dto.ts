/**
 * Response DTO for `GET /api/workflows/:id/preview-cache-batch`.
 *
 * The batch twin of `ActivityOutputPreviewDto` / the per-node
 * `preview-cache` endpoint: returns the most-recent fresh cache row for
 * **every** node in the lineage (optionally scoped to a run window) in a
 * single response, keyed by `nodeId`. Nodes with no fresh cache row are
 * simply absent from the map — the consumer treats an absent key exactly
 * like the per-node endpoint's 404 (no preview yet / evicted).
 *
 * Motivation: the editor mounts a preview widget on every node, so the
 * per-node endpoint fired one request per node on every load — an
 * O(nodes) request storm that tripped the API rate limiter. This endpoint
 * collapses that to one round-trip.
 */

import { ApiExtraModels, ApiProperty, getSchemaPath } from "@nestjs/swagger";

import { ActivityOutputPreviewDto } from "./activity-output-preview.dto";

@ApiExtraModels(ActivityOutputPreviewDto)
export class ActivityOutputPreviewBatchDto {
  @ApiProperty({
    description:
      "Map of `nodeId` → the node's cached preview row. Only nodes with a " +
      "fresh (`expiresAt > now`) cache row appear; an absent key means the " +
      "node hasn't produced a cached output yet (or it was TTL-evicted) and " +
      "is treated exactly like the per-node endpoint's 404.",
    type: "object",
    additionalProperties: { $ref: getSchemaPath(ActivityOutputPreviewDto) },
    example: {
      "node-a": {
        outputCtx: { documentUrl: "blob://group-1/doc-1.pdf", pageCount: 12 },
        outputKind: "Document",
        createdAt: "2026-05-24T12:00:00.000Z",
        expiresAt: "2026-05-25T12:00:00.000Z",
      },
    },
  })
  previews!: Record<string, ActivityOutputPreviewDto>;
}
