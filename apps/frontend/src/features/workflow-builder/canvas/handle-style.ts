/**
 * Per-handle styling helper for the visual workflow canvas.
 *
 * Given a list of declared `KindRef` values for every port on one side of a
 * node (input OR output), this helper produces the values the canvas needs
 * to colour the single xyflow `<Handle>` rendered on that side and to drive
 * its hover tooltip.
 *
 * Rule per TYPED_IO_DESIGN.md §4 ("Single-port-side colouring rule"):
 *
 *   - Exactly ONE typed port declared on the side → the handle is coloured
 *     by that port's kind family (from `ARTIFACT_REGISTRY`) and the tooltip
 *     reads the kind literal verbatim (e.g. `"Segment[]"`).
 *   - ZERO typed ports OR TWO-OR-MORE typed ports on the side → the handle
 *     stays gray (Artifact wildcard) and the tooltip prompts the user to
 *     select the node to see the full typed signature. Picking a "primary"
 *     port to colour would mislead users about cardinality.
 *
 * Cardinality (`T[]`) is encoded in the kind literal itself — when present
 * the handle gets a doubled-outline visual cue (caller renders the outline;
 * this helper just sets `isArray: true`).
 *
 * `getArtifactKindMeta` is used so dynamically-registered kinds (Phase 6)
 * resolve their colour through the same code path. Unknown kinds fall back
 * to gray.
 */

import { getArtifactKindMeta, type KindRef } from "@ai-di/graph-workflow";

export interface HandleStyle {
  /** Mantine colour name (`"blue"`, `"green"`, …). `"gray"` for wildcard. */
  color: string;
  /**
   * True when the resolved kind is an array (`T[]`). The canvas renders a
   * doubled outline around the handle dot to signal the cardinality.
   */
  isArray: boolean;
  /**
   * True when the side has either zero typed ports or multiple typed ports.
   * Always co-occurs with `color === "gray"` and `isArray === false` — the
   * canvas uses it to skip rendering kind-specific affordances (the doubled
   * outline) and to drive the "Multiple inputs/outputs" tooltip.
   */
  isMultiPort: boolean;
  /** Hover tooltip text — either the kind literal or the multi-port message. */
  tooltipText: string;
}

export interface ComputeHandleStyleOpts {
  /**
   * Every declared port on this side of the node, in node-declaration order.
   * Entries without a `kind` field on the catalog descriptor pass `undefined`
   * here. Order is preserved so the future per-port pill can render the same
   * ordering the catalog declares.
   */
  portKinds: ReadonlyArray<KindRef | undefined>;
  direction: "input" | "output";
}

/**
 * Splits a `KindRef` into its base kind + array-cardinality flag.
 * `"Segment[]"` → `{ baseKind: "Segment", isArray: true }`.
 * `"Document"` → `{ baseKind: "Document", isArray: false }`.
 */
function splitKindRef(kind: KindRef): { baseKind: string; isArray: boolean } {
  if (kind.endsWith("[]")) {
    return { baseKind: kind.slice(0, -2), isArray: true };
  }
  return { baseKind: kind, isArray: false };
}

const GRAY_COLOR = "gray";

/**
 * Compute the canvas handle style for one side of a node.
 *
 * Pure: given the same `portKinds` + `direction` always returns the same
 * `HandleStyle`. Safe to call unmemoised — the canvas projection runs it
 * once per side per render.
 */
export function computeHandleStyle(opts: ComputeHandleStyleOpts): HandleStyle {
  const { portKinds, direction } = opts;
  const typedKinds: KindRef[] = portKinds.filter(
    (k): k is KindRef => k !== undefined,
  );

  if (typedKinds.length === 1) {
    const lone = typedKinds[0];
    const { baseKind, isArray } = splitKindRef(lone);
    const meta = getArtifactKindMeta(baseKind);
    // Unknown base kinds collapse to gray. They still render as
    // single-port (not multi-port) — the tooltip honestly shows the
    // declared kind literal even when the registry doesn't know it.
    const color = meta?.color ?? GRAY_COLOR;
    return {
      color,
      isArray,
      isMultiPort: false,
      tooltipText: lone,
    };
  }

  // Zero typed ports OR two-or-more typed ports collapse to gray.
  const tooltipText =
    direction === "input"
      ? "Multiple inputs — select node to view all"
      : "Multiple outputs — select node to view all";
  return {
    color: GRAY_COLOR,
    isArray: false,
    isMultiPort: true,
    tooltipText,
  };
}
