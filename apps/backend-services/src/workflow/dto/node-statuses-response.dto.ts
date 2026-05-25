/**
 * US-136 — Response DTO for `GET /api/workflows/:id/runs/:runId/node-statuses`.
 *
 * The response shape mirrors the `NodeRunStatus` interface authored in
 * `apps/temporal/src/graph-workflow-queries.ts` (US-135). It's intentionally
 * re-declared here (rather than imported across apps) because the temporal
 * source file imports `defineQuery` from `@temporalio/workflow` — a workflow-
 * sandbox runtime package that isn't installed in `apps/backend-services`.
 * Keep these two declarations aligned.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L19
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §3.2
 */

import { ApiProperty } from "@nestjs/swagger";

/** Per-node live run status surfaced to the canvas (US-135 shape). */
export type NodeRunStatusValue =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export class CacheHitDto {
  @ApiProperty({
    description:
      "Hash of the workflow config used as the cache key's first component.",
  })
  configHash!: string;

  @ApiProperty({
    description:
      "Hash of the node's resolved inputs used as the cache key's second component.",
  })
  inputHash!: string;
}

export class NodeRunStatusDto {
  @ApiProperty({
    description:
      "Lifecycle state of the node within this run. `pending` is reserved for callers that seed entries — the workflow itself never writes pending (untouched nodes are absent, and the canvas treats absent as pending).",
    enum: ["pending", "running", "succeeded", "failed", "skipped"],
  })
  status!: NodeRunStatusValue;

  @ApiProperty({
    description:
      "ISO-8601 timestamp captured the moment the node entered `running`.",
    required: false,
  })
  startedAt?: string;

  @ApiProperty({
    description:
      "ISO-8601 timestamp captured the moment the node left `running` (regardless of terminal state — succeeded / failed / skipped).",
    required: false,
  })
  endedAt?: string;

  @ApiProperty({
    description:
      'Populated on `status === "failed"`. The thrown error\'s `.message`.',
    required: false,
  })
  errorMessage?: string;

  @ApiProperty({
    description:
      'Populated on `status === "skipped"`. Names the cache row the Phase 4 decorator served the output from.',
    required: false,
    type: CacheHitDto,
  })
  cacheHit?: CacheHitDto;
}

/**
 * The HTTP response body is a JSON object keyed by `nodeId`, with
 * `NodeRunStatusDto` values. TypeScript can't decorate an index signature,
 * so this type alias captures the runtime shape and `NODE_STATUSES_RESPONSE_SCHEMA`
 * carries the matching OpenAPI schema. The controller wires the schema to
 * `@ApiOkResponse({ schema: ... })`.
 */
export type NodeStatusesResponseDto = Record<string, NodeRunStatusDto>;

/**
 * OpenAPI schema for `NodeStatusesResponseDto`. Uses `additionalProperties`
 * with a `$ref` to `NodeRunStatusDto` (registered via `@ApiExtraModels` on
 * the controller) so the OpenAPI spec carries the full nested shape.
 */
export const NODE_STATUSES_RESPONSE_SCHEMA = {
  type: "object" as const,
  additionalProperties: { $ref: "#/components/schemas/NodeRunStatusDto" },
  description:
    "Map of `nodeId` -> `NodeRunStatusDto`. Nodes the workflow never walks stay absent (the canvas treats absent as `pending`).",
  example: {
    "node-1": {
      status: "succeeded",
      startedAt: "2026-05-24T12:00:00.000Z",
      endedAt: "2026-05-24T12:00:01.500Z",
    },
    "node-2": {
      status: "running",
      startedAt: "2026-05-24T12:00:01.500Z",
    },
  },
};
