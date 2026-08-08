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
import type { CSSProperties } from "react";

import { splitKindRef } from "./artifact-kind-colour";

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

const GRAY_COLOR = "gray";

/**
 * Translates a Mantine colour name into the matching theme CSS variable
 * for a handle dot's background. Falls back to the literal value (so
 * `"gray"` still resolves) when the variable isn't defined in the current
 * theme. Shared by the node-level handles (`WorkflowEditorCanvas`) and the
 * per-port row handles (`PortRows`) so the two dot palettes never drift.
 */
export function handleBackground(color: string): string {
  return `var(--mantine-color-${color}-6, ${color})`;
}

/**
 * Lighter outline tone used to signal array cardinality on a kind-
 * coloured handle dot. Picks shade `3` for a faded ring against shade
 * `6`'s saturated dot.
 */
export function handleArrayOutline(color: string): string {
  return `var(--mantine-color-${color}-3, ${color})`;
}

// ---------------------------------------------------------------------------
// The "+" invitation on an unconnected port handle
// (Inderdeep UX walkthrough 2026-08-06, item 3).
//
// A bare dot says nothing, so the hover-to-extend popover — the main way a
// graph gets built — is invisible to anyone handed the tool cold. A "+"
// says "there is something to add here".
//
// Two constraints shaped the drawing:
//
//   1. It must not fight the port's family colour, which encodes what can
//      connect to what. So the glyph is a KNOCKOUT: two bars in the canvas
//      body colour cut across the coloured disc, exactly like the 2px body
//      ring the dot already wears (`workflow-editor-canvas.css`). The hue is
//      untouched; only the shape inside it changes.
//   2. It must survive the zoom levels people work at. The batch-1 status
//      badge finding was that a glyph INSIDE a ring loses at 16px, because
//      the ring eats the pixel budget. So the plus is not drawn inside the
//      existing 12px dot: an inviting handle grows to
//      `UNCONNECTED_HANDLE_SIZE`, which leaves a 12px coloured disc inside
//      the 2px body ring, and the bars span 8 of those 12px at 2px thick.
//      Two thirds of the disc is glyph — the plus is the shape you read,
//      not a detail inside a circle.
//
// Growing the dot via width/height (not `transform: scale()`) is deliberate
// and matches the drop-target highlight in `PortRows` — xyflow's own
// `.react-flow__handle-left/-right` classes apply `translate(-50%, -50%)`,
// whose percentages resolve against the handle's own box, so a bigger box
// stays centred on the same anchor for free.
// ---------------------------------------------------------------------------

/** Dot size for a handle that renders the "+" invitation, in px. */
export const UNCONNECTED_HANDLE_SIZE = 16;
/** Length of each arm of the "+", in px. */
export const PLUS_GLYPH_ARM = 8;
/** Thickness of each arm of the "+", in px. */
export const PLUS_GLYPH_STROKE = 2;
/** Knockout colour — the canvas body, same tone as the dot's own ring. */
export const PLUS_GLYPH_COLOR = "var(--mantine-color-body, #fff)";

const PLUS_BAR_BASE: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -50%)",
  background: PLUS_GLYPH_COLOR,
  borderRadius: 1,
  // The bars are decoration sitting inside a drag target; they must never
  // intercept the pointer events the handle itself needs.
  pointerEvents: "none",
};

/**
 * Inline styles for the two bars that draw the "+" inside a handle dot.
 * Rendered as children of the xyflow `<Handle>` (which forwards `children`
 * into the dot element) rather than as a background image, so the glyph is
 * a real, assertable DOM shape at any zoom.
 */
export function plusGlyphBarStyles(): {
  horizontal: CSSProperties;
  vertical: CSSProperties;
} {
  return {
    horizontal: {
      ...PLUS_BAR_BASE,
      width: PLUS_GLYPH_ARM,
      height: PLUS_GLYPH_STROKE,
    },
    vertical: {
      ...PLUS_BAR_BASE,
      width: PLUS_GLYPH_STROKE,
      height: PLUS_GLYPH_ARM,
    },
  };
}

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

  // Zero typed ports OR two-or-more typed ports collapse to a gray wildcard
  // handle. The tooltip distinguishes the two: a node with NO typed ports
  // (e.g. a map/join whose data flow is via ctx keys, not ports) shouldn't
  // claim it has "multiple" — that misrepresents the cardinality.
  if (typedKinds.length === 0) {
    return {
      color: GRAY_COLOR,
      isArray: false,
      isMultiPort: true,
      tooltipText:
        direction === "input" ? "No typed inputs" : "No typed outputs",
    };
  }

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
