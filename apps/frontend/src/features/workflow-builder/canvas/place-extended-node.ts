/**
 * Position helpers for placing a node added via the hover-to-extend popover
 * (US-045) or programmatic equivalents.
 *
 * `findNextFreePosition` reads the workflow config and avoids placing the
 * new node on top of any existing node. For switch sources with existing
 * outgoing edges, it places the new node below the lowest existing target.
 */

import type { GraphWorkflowConfig } from "../../../types/workflow";

export interface NextNodePositionOptions {
  /** Horizontal offset from the source (default 280px). */
  dx?: number;
  /** Vertical offset from the source (default 0px, same y). */
  dy?: number;
}

const DEFAULT_DX = 280;
const DEFAULT_DY = 0;
/** Approximate node footprint used for the AABB collision test (rectangle, px). */
const COLLISION_W = 200;
const COLLISION_H = 100;
const STEP_Y = 140;
const MAX_STEPS = 8;

function readPosition(
  config: GraphWorkflowConfig,
  nodeId: string,
): { x: number; y: number } | null {
  const node = config.nodes[nodeId];
  if (!node) return null;
  const meta = node.metadata as
    | { position?: { x: number; y: number } }
    | undefined;
  const pos = meta?.position;
  if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
    return { x: pos.x, y: pos.y };
  }
  return null;
}

function collides(
  config: GraphWorkflowConfig,
  candidate: { x: number; y: number },
): boolean {
  for (const node of Object.values(config.nodes)) {
    const pos = readPosition(config, node.id);
    if (!pos) continue;
    if (
      Math.abs(pos.x - candidate.x) < COLLISION_W &&
      Math.abs(pos.y - candidate.y) < COLLISION_H
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Resolve a placement for a new node hanging off `sourceNodeId`.
 *
 * Default candidate is `sourcePos + {dx:280, dy:0}`. If that collides with
 * any existing node, steps `y` alternately by ±STEP_Y until a free slot is
 * found, up to MAX_STEPS attempts. For switch sources with existing
 * outgoing edges, the candidate starts below the lowest existing target
 * (one extra stagger step) so cases stack rather than overlap.
 */
export function findNextFreePosition(
  config: GraphWorkflowConfig,
  sourceNodeId: string,
  options: NextNodePositionOptions = {},
): { x: number; y: number } {
  const sourcePos = readPosition(config, sourceNodeId);
  if (!sourcePos) {
    return { x: options.dx ?? DEFAULT_DX, y: options.dy ?? DEFAULT_DY };
  }

  const dx = options.dx ?? DEFAULT_DX;
  let dy = options.dy ?? DEFAULT_DY;

  // Switch-specific: start below the lowest existing outgoing-edge target.
  const sourceNode = config.nodes[sourceNodeId];
  if (sourceNode?.type === "switch") {
    let lowestY: number | null = null;
    for (const edge of config.edges) {
      if (edge.source !== sourceNodeId) continue;
      const targetPos = readPosition(config, edge.target);
      if (!targetPos) continue;
      if (lowestY === null || targetPos.y > lowestY) lowestY = targetPos.y;
    }
    if (lowestY !== null) {
      dy = lowestY - sourcePos.y + STEP_Y;
    }
  }

  const base = { x: sourcePos.x + dx, y: sourcePos.y + dy };
  if (!collides(config, base)) return base;

  // Alternating step-out search: +STEP_Y, -STEP_Y, +2*STEP_Y, -2*STEP_Y, ...
  for (let step = 1; step <= MAX_STEPS; step += 1) {
    const downCandidate = { x: base.x, y: base.y + step * STEP_Y };
    if (!collides(config, downCandidate)) return downCandidate;
    const upCandidate = { x: base.x, y: base.y - step * STEP_Y };
    if (!collides(config, upCandidate)) return upCandidate;
  }

  // Fallback — bounded search exhausted; deterministically pick below.
  return { x: base.x, y: base.y + (MAX_STEPS + 1) * STEP_Y };
}
