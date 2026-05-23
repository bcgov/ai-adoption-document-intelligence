/**
 * Pure helper that computes the landing position of a node added via the
 * hover-to-extend popover (US-045).
 *
 * The new node lands `dx` pixels to the right and `dy` pixels below the
 * source. Defaults keep the new node on the same y-axis as its source so
 * a horizontal chain extends naturally.
 *
 * Kept side-effect-free + dependency-free so it can be reused by other
 * "spawn a node next to an existing one" flows in future (e.g., the
 * planned auto-arrange fallback) without dragging xyflow or React into
 * the helper.
 */

export interface NextNodePositionOptions {
  /** Horizontal offset from the source (default 280px). */
  dx?: number;
  /** Vertical offset from the source (default 0px, same y). */
  dy?: number;
}

export function nextNodePosition(
  sourcePos: { x: number; y: number },
  options: NextNodePositionOptions = {},
): { x: number; y: number } {
  const dx = options.dx ?? 280;
  const dy = options.dy ?? 0;
  return { x: sourcePos.x + dx, y: sourcePos.y + dy };
}
