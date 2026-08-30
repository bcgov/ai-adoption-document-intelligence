/**
 * Custom xyflow edge component for the workflow builder canvas.
 *
 * Renders a `DerivedWire` (PORT_WIRING_DESIGN.md §5 — "one wire = data")
 * with a variant-specific stroke + an optional inline pill label:
 *
 *   - `variant: "data"`    → stroke coloured by the wire's artifact kind
 *                            (`colorForKind`), no label, a native SVG
 *                            `<title>` tooltip describing the binding's
 *                            provenance (`wireTooltip`).
 *   - `variant: "sequence"`→ grey DASHED stroke, no label — execution
 *                            order only, no data flows on this hop.
 *   - `variant: "conditional"` → switch accent stroke, label is either
 *                            `if <predicate>` (when the edge id is
 *                            referenced by `switch.cases[i].edgeId`),
 *                            `otherwise` (when the edge id is the
 *                            switch's `defaultEdge`), or `(unmatched)`
 *                            otherwise.
 *   - `variant: "error"`   → red stroke, label `on error`.
 *
 * Edges projected without a `wire` (e.g. the simplified-view chip
 * projection) fall back to the legacy `GraphEdge.type` styling: `normal`
 * → solid grey, `conditional`/`error` as above.
 *
 * The component reads everything it needs from `data` populated by the
 * canvas projection — the canvas walks the graph once and hands each
 * edge enough context to compute its own stroke/label without
 * re-walking.
 *
 * See feature-docs/20260524-workflow-builder-switch-edges-and-validation-editor/
 * user_stories/US-023-workflow-edge-component.md.
 */

import type { KindRef } from "@ai-di/graph-workflow";
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getStraightPath,
} from "@xyflow/react";
import { type CSSProperties, memo } from "react";
import type { GraphEdge, SwitchNode } from "../../../types/workflow";
import { getControlFlowVisualHints } from "../control-flow-visual-hints";
import { colorForKind } from "./artifact-kind-colour";
import type { DataWire, DerivedWire } from "./derive-wires";
import { formatCaseLabel } from "./edge-labels";
import { handleBackground } from "./handle-style";
import { WirePeekPopover } from "./WirePeekPopover";

/**
 * Shape of the `data` payload the canvas projection hands to
 * `WorkflowEdge`.
 *
 * `wire` carries the derived wire this edge renders. Structural wires
 * (sequence / conditional / error) ALSO carry `graphEdge` (and, for
 * switch sources, `sourceSwitch` so the renderer can resolve
 * `cases[i].edgeId` → `if <label>` without holding a reference to
 * the entire graph); data wires carry `wire` only. Legacy projections
 * (simplified view) supply `graphEdge` without `wire`.
 *
 * Phase 4 (US-139) adds the optional `isActive` flag — when true the
 * edge renders with the active-edge animation (blue stroke + 2.5px
 * width); xyflow's built-in marching-ants dash animation is engaged via
 * the edge's `animated` flag set by `WorkflowEditorCanvas`.
 */
export interface WorkflowEdgeData {
  graphEdge?: GraphEdge;
  sourceSwitch?: SwitchNode;
  wire?: DerivedWire;
  isActive?: boolean;
  /**
   * G-014 — this edge is on the path the run being viewed actually took.
   * Distinct from `isActive` ("flowing right now"): a replayed run has no
   * active edge at all, and during a live run the already-walked hops are
   * taken while only the in-flight hop is active.
   */
  isTaken?: boolean;
  /** Data wires only — producer step label for the peek header. */
  peekProducerLabel?: string;
  /** Data wires only — producer port label for the peek header. */
  peekPortLabel?: string;
  [key: string]: unknown;
}

/**
 * Plain-language provenance tooltip for a data wire (Task 3 vocabulary:
 * "Connected automatically…", "Pinned…"). Pure so it can be unit
 * tested without rendering.
 *
 * D21 — a pin carries no author: `metadata.lockedInputPorts` holds port names
 * and nothing else, and `normaliseLocks` mints pins from a seeded workflow's
 * own bindings at load. So "Pinned by you" was false on every demo workflow a
 * reader had never edited. The copy describes the act, not the actor.
 */
export function wireTooltip(wire: DataWire): string {
  if (wire.pinned) {
    return "Pinned — chosen by hand when this workflow was built, so automatic wiring leaves it alone";
  }
  if (wire.via === "name-match") {
    return `Connected automatically — matched by name "${wire.targetPort}"`;
  }
  if (wire.via === "map-item") {
    return "Connected automatically — item from the loop";
  }
  if (wire.auto) {
    return `Connected automatically — nearest ${wire.kind ?? "compatible"} producer`;
  }
  return `Connected — via ${wire.ctxKey}`;
}

/**
 * Machine-readable provenance stamped as `data-provenance` on the
 * rendered wire: `pinned` | `auto:<via>` | `auto` | `manual`.
 */
function wireProvenance(wire: DataWire): string {
  if (wire.pinned) return "pinned";
  if (wire.via !== undefined) return `auto:${wire.via}`;
  if (wire.auto) return "auto";
  return "manual";
}

/**
 * The sequence wire — execution order only, no data. Exported because the
 * legend has to draw the SAME grey: it used to sample `gray-5`, which the app
 * theme overrides to `#C6C5C3`, so the legend taught one grey and the canvas
 * painted another (item 20, drift 1).
 */
export const SEQUENCE_STROKE = "#9CA3AF";
/**
 * The error route, on both the wire and the bottom handle dot it leaves from.
 *
 * A literal, not `var(--mantine-color-red-6)`: the app theme overrides
 * Mantine's red scale, so that variable resolved to the dark `#822623` on the
 * wire while the handle dot beside it was hardcoded `#e03131` — two reds for
 * one concept (item 20, drift 2). This is the brighter of the two, because a
 * 2px wire in a dark maroon barely reads against the canvas.
 */
export const ERROR_STROKE = "#E03131";
const SWITCH_ACCENT = getControlFlowVisualHints("switch").color;
/**
 * Stroke applied to "currently flowing" edges per US-139 / §3.4. The same blue
 * the "running" node-status badge uses, so a live run reads as one story.
 *
 * Literal, not `var(--mantine-color-blue-6)` — that variable resolves to the
 * app theme's blue, and its fallback (`#228be6`) was stock Mantine's, so the
 * two disagreed by 20 ΔE depending on whether the stylesheet had loaded.
 *
 * It IS the same value as the Documents port family, which is a collision on
 * paper and not one in practice: an active wire is the only thing on the
 * canvas that MOVES (xyflow's marching-ants animation, engaged via the edge's
 * `animated` flag) and it is 2.5px against a data wire's 2px. Motion is a
 * stronger carrier than hue, and it is one no colour deficiency touches. The
 * taken trail below is far lighter than any family colour, so it separates on
 * lightness alone.
 */
export const ACTIVE_STROKE = "#5595D9";
const ACTIVE_STROKE_WIDTH = 2.5;
// G-014 — the path a run took: same blue family as the live hop so the two
// read as one story, but calmer (no animation, slightly thinner) so a live
// run's in-flight edge still stands out against the trail behind it.
export const TAKEN_STROKE = "#C1DDFC";
const TAKEN_STROKE_WIDTH = 2.5;
/**
 * Width applied to a selected edge. Wider than both the resting (2) and
 * active (2.5) strokes so the user can tell a wire is selected even while
 * it is animating as the currently-flowing hop.
 */
const SELECTED_STROKE_WIDTH = 3.5;

interface LabelComputation {
  text: string;
  accent: string;
}

function computeConditionalLabel(
  graphEdge: GraphEdge,
  sourceSwitch: SwitchNode | undefined,
): LabelComputation {
  const accent = SWITCH_ACCENT;
  if (!sourceSwitch) {
    return { text: "(unmatched)", accent };
  }
  if (sourceSwitch.defaultEdge === graphEdge.id) {
    return { text: formatCaseLabel({ kind: "default" }), accent };
  }
  const caseIndex = sourceSwitch.cases.findIndex(
    (c) => c.edgeId === graphEdge.id,
  );
  if (caseIndex < 0) {
    return { text: "(unmatched)", accent };
  }
  const expression = sourceSwitch.cases[caseIndex].condition;
  return {
    text: formatCaseLabel({ caseIndex, expression }),
    accent,
  };
}

/**
 * Dash pattern for sequence wires — execution order only, no data. Single
 * definition shared with anything that needs to echo the sequence look.
 */
export const SEQUENCE_DASH = "6 4";

/**
 * Family-coloured stroke for a data wire — the same value the port dots use
 * (`handleBackground`), so the wire, its arrowhead
 * marker, and both endpoint dots share one kind colour. The canvas
 * projection imports this for the arrowhead `markerEnd` colour; the edge
 * renderer uses it for the stroke itself.
 */
export function dataWireStroke(kind: KindRef | undefined): string {
  return handleBackground(colorForKind(kind));
}

interface StyleResolution {
  stroke: string;
  strokeDasharray?: string;
  label: LabelComputation | null;
  /** Stamped as `data-wire-variant` when the projection supplied a wire. */
  wireVariant?: DerivedWire["variant"];
  /** Data wires only — stamped as `data-provenance`. */
  provenance?: string;
  /** Data wires only — native SVG `<title>` hover text. */
  title?: string;
}

function resolveStyle(data: WorkflowEdgeData | undefined): StyleResolution {
  if (!data) {
    return { stroke: SEQUENCE_STROKE, label: null };
  }
  const { graphEdge, sourceSwitch, wire } = data;
  if (wire?.variant === "data") {
    return {
      stroke: dataWireStroke(wire.kind),
      label: null,
      wireVariant: "data",
      provenance: wireProvenance(wire),
      title: wireTooltip(wire),
    };
  }
  if (wire?.variant === "sequence") {
    return {
      stroke: SEQUENCE_STROKE,
      strokeDasharray: SEQUENCE_DASH,
      label: null,
      wireVariant: "sequence",
    };
  }
  // Structural conditional/error wires + legacy (no-wire) projections
  // resolve through the underlying GraphEdge exactly as before.
  if (!graphEdge) {
    return { stroke: SEQUENCE_STROKE, label: null };
  }
  switch (graphEdge.type) {
    case "normal":
      return { stroke: SEQUENCE_STROKE, label: null };
    case "conditional": {
      const label = computeConditionalLabel(graphEdge, sourceSwitch);
      return { stroke: label.accent, label, wireVariant: wire?.variant };
    }
    case "error":
      return {
        stroke: ERROR_STROKE,
        label: { text: "on error", accent: ERROR_STROKE },
        wireVariant: wire?.variant,
      };
  }
}

export const WorkflowEdge = memo(function WorkflowEdge(
  props: EdgeProps & { data?: WorkflowEdgeData },
) {
  const { id, sourceX, sourceY, targetX, targetY, markerEnd, data, selected } =
    props;

  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const { stroke, strokeDasharray, label, wireVariant, provenance, title } =
    resolveStyle(data);
  // Active-edge override (US-139): when the canvas projection flags this
  // edge as the currently-flowing hop, swap in the blue stroke +
  // wider 2.5px line — it wins over every wire variant (including the
  // sequence dash, which would fight xyflow's marching-ants animation).
  const isActive = data?.isActive === true;
  // G-014 — the taken-path cue sits between "active" and plain: it loses to
  // the live hop, wins over the resting wire styling.
  const isTaken = data?.isTaken === true;
  const baseStyle: CSSProperties = isActive
    ? { stroke: ACTIVE_STROKE, strokeWidth: ACTIVE_STROKE_WIDTH }
    : isTaken
      ? { stroke: TAKEN_STROKE, strokeWidth: TAKEN_STROKE_WIDTH }
      : {
          stroke,
          strokeWidth: 2,
          ...(strokeDasharray !== undefined ? { strokeDasharray } : {}),
        };
  // Selection cue: xyflow adds a `.selected` class and paints a selected
  // stroke via its base stylesheet, but BaseEdge's INLINE `style` overrides
  // that class — so selection was visually silent (the edge selects and
  // deletes, it just never looked selected). Reassert it inline: a thicker
  // stroke plus a same-colour glow, layered on whichever base style applies.
  // Works for structural AND data wires (a selected data wire also mounts
  // the peek popover; this makes the wire itself read as selected too).
  const edgeStyle: CSSProperties =
    selected === true
      ? {
          ...baseStyle,
          strokeWidth: SELECTED_STROKE_WIDTH,
          filter: `drop-shadow(0 0 2px ${baseStyle.stroke})`,
        }
      : baseStyle;

  // Wire data peek (Phase 4): mount the peek popover at the wire midpoint
  // when a data wire's edge is selected. Narrow `DerivedWire` → `DataWire`
  // via the discriminant here so the popover receives a `DataWire` without
  // a cast.
  const peekWire =
    selected === true && data?.wire?.variant === "data" ? data.wire : null;

  const labelPillStyle: CSSProperties = {
    position: "absolute",
    transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
    background: "var(--mantine-color-body, #1a1b1e)",
    color: "var(--mantine-color-text, #f3f4f6)",
    border: `1px solid ${label?.accent ?? stroke}`,
    borderRadius: 10,
    padding: "1px 6px",
    fontSize: 10,
    lineHeight: 1.3,
    fontWeight: 500,
    whiteSpace: "nowrap",
    pointerEvents: "all",
  };

  return (
    <>
      {/* The <g> wrapper carries the wire metadata + the native SVG
          <title> hover tooltip (title applies to the wrapped path).
          Attributes are simply absent for legacy no-wire edges. */}
      <g data-wire-variant={wireVariant} data-provenance={provenance}>
        {title !== undefined ? <title>{title}</title> : null}
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={edgeStyle}
        />
      </g>
      {label ? (
        <EdgeLabelRenderer>
          <div data-testid="edge-label" style={labelPillStyle}>
            {label.text}
          </div>
        </EdgeLabelRenderer>
      ) : null}
      {peekWire ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              zIndex: 10,
            }}
          >
            <WirePeekPopover
              wire={peekWire}
              producerLabel={data?.peekProducerLabel}
              portLabel={data?.peekPortLabel}
            />
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
