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

/**
 * Per-node live run status surfaced to the canvas (US-135 shape).
 *
 * `cancelled` is terminal and is NOT written by the workflow — the runtime has
 * no chance to record it, because cancellation stops the execution. The
 * endpoint derives it: when the run itself is CANCELED/TERMINATED, any node
 * still sitting at `pending`/`running` is reported as `cancelled` (G-047).
 * Without it those nodes stayed `running` forever, the canvas's terminal-stop
 * check never fired, and the poll ran at 1.5 s until the component unmounted.
 */
export type NodeRunStatusValue =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "cancelled";

/** Node states that will never change again on their own. */
const TERMINAL_NODE_STATUSES: readonly NodeRunStatusValue[] = [
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
];

/** Temporal execution states that mean the run stopped without finishing. */
const ABORTED_RUN_STATUSES: readonly string[] = ["CANCELLED", "TERMINATED"];

/**
 * True when at least one node could still change state. The endpoint uses this
 * to decide whether asking Temporal for the run's own status is worth a round
 * trip — a fully settled map cannot be affected by it.
 */
export function hasUnfinishedNodes(
  statuses: Record<string, { status: NodeRunStatusValue }>,
): boolean {
  return Object.values(statuses).some(
    (entry) => !TERMINAL_NODE_STATUSES.includes(entry.status),
  );
}

/**
 * Report nodes left mid-flight by an aborted run as `cancelled` (G-047).
 *
 * Cancellation stops the execution, so the workflow never gets to write a
 * terminal status for the nodes it was in the middle of. They stay `running`
 * in the query result forever, the canvas's all-terminal check never fires,
 * and it polls at 1.5 s until unmounted.
 *
 * Pure, and exported for tests. Returns the input untouched for a run that is
 * still going or that finished normally, so the common path allocates nothing.
 */
export function applyAbortedRunStatus<T extends { status: NodeRunStatusValue }>(
  statuses: Record<string, T>,
  runStatusName: string | undefined,
): Record<string, T> {
  // Temporal spells it CANCELED (one L); accept both so a client-library
  // change in either direction cannot silently reintroduce the endless poll.
  const normalised = (runStatusName ?? "")
    .toUpperCase()
    .replace("CANCELED", "CANCELLED");
  if (!ABORTED_RUN_STATUSES.includes(normalised)) return statuses;

  let changed = false;
  const out: Record<string, T> = {};
  for (const [nodeId, entry] of Object.entries(statuses)) {
    if (TERMINAL_NODE_STATUSES.includes(entry.status)) {
      out[nodeId] = entry;
      continue;
    }
    changed = true;
    out[nodeId] = { ...entry, status: "cancelled" as NodeRunStatusValue };
  }
  return changed ? out : statuses;
}

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
      "Lifecycle state of the node within this run. `pending` is reserved for callers that seed entries — the workflow itself never writes pending (untouched nodes are absent, and the canvas treats absent as pending). `cancelled` is derived by this endpoint, not written by the workflow: when the run is CANCELED/TERMINATED, nodes left at `pending`/`running` are reported as `cancelled` so the canvas's terminal-stop check can fire.",
    enum: ["pending", "running", "succeeded", "failed", "skipped", "cancelled"],
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

  @ApiProperty({
    description:
      'G-014 — the id of the ONE outgoing edge this node routed to, when the node made a branch decision: a `switch` (matched case, or the default edge), a `humanGate` that timed out onto its `fallbackEdgeId`, or any node whose `errorPolicy: "fallback"` diverted onto an error edge. Absent for every other node, which means all outgoing `normal` edges were taken. Lets the canvas draw the path a finished run actually followed.',
    required: false,
  })
  selectedEdgeId?: string;
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
